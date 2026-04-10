#!/usr/bin/env bash
# lib/send.sh — Send and reply transaction logic: compose, resolve, deliver.
# All-or-nothing transactions using db_transaction.

# do_send — Execute a send transaction.
# Args: sender_addr_id, to_list (comma-sep addresses as "local@host"), cc_list, subject, body, urgency, references_json
# References: JSON array like [{"kind":"path","value":"/foo","label":null,"mime_type":null,"metadata":null}]
# Output: JSON success envelope with message_id, conversation_id, resolution_summary
do_send() {
  local sender_addr_id="$1"
  local to_list="$2"
  local cc_list="${3:-}"
  local subject="${4:-}"
  local body="${5:-}"
  local urgency="${6:-normal}"
  local references_json="${7:-[]}"

  local ts
  ts=$(now_ms)

  # Generate IDs
  local cnv_id msg_id
  cnv_id=$(generate_id "cnv_")
  msg_id=$(generate_id "msg_")

  # --- Phase 1: Resolve all recipient addresses to IDs and validate ---
  local to_addr_ids="" cc_addr_ids=""
  local logical_count=0
  local all_direct_addr_ids=""

  # Process --to list
  local IFS=','
  for addr_str in $to_list; do
    [[ -z "$addr_str" ]] && continue
    logical_count=$((logical_count + 1))
    local addr_row _rc=0
    addr_row=$(validate_direct_recipient "$addr_str") || _rc=$?
    if [[ $_rc -ne 0 ]]; then echo "$addr_row"; return $_rc; fi
    local addr_id
    addr_id=$(echo "$addr_row" | cut -d'|' -f1)
    if [[ -z "$to_addr_ids" ]]; then
      to_addr_ids="$addr_id"
    else
      to_addr_ids="$to_addr_ids,$addr_id"
    fi
    all_direct_addr_ids="$all_direct_addr_ids $addr_id"
  done
  unset IFS

  # Process --cc list
  IFS=','
  for addr_str in $cc_list; do
    [[ -z "$addr_str" ]] && continue
    logical_count=$((logical_count + 1))
    local addr_row _rc=0
    addr_row=$(validate_direct_recipient "$addr_str") || _rc=$?
    if [[ $_rc -ne 0 ]]; then echo "$addr_row"; return $_rc; fi
    local addr_id
    addr_id=$(echo "$addr_row" | cut -d'|' -f1)
    if [[ -z "$cc_addr_ids" ]]; then
      cc_addr_ids="$addr_id"
    else
      cc_addr_ids="$cc_addr_ids,$addr_id"
    fi
    all_direct_addr_ids="$all_direct_addr_ids $addr_id"
  done
  unset IFS

  if [[ $logical_count -eq 0 ]]; then
    error_json "invalid_argument" "at least one --to recipient is required"
    return "$EXIT_INVALID_ARGUMENT"
  fi

  # --- Phase 2: Build normalized public headers (dedupe same-role, preserve cross-role) ---
  # Public headers use the logical addresses (including list addresses)
  local pub_to_ids="" pub_cc_ids=""
  declare -A _pub_to_seen _pub_cc_seen

  IFS=','
  for addr_id in $to_addr_ids; do
    [[ -z "$addr_id" ]] && continue
    if [[ -z "${_pub_to_seen[$addr_id]+x}" ]]; then
      _pub_to_seen["$addr_id"]=1
      if [[ -z "$pub_to_ids" ]]; then
        pub_to_ids="$addr_id"
      else
        pub_to_ids="$pub_to_ids,$addr_id"
      fi
    fi
  done
  unset IFS

  IFS=','
  for addr_id in $cc_addr_ids; do
    [[ -z "$addr_id" ]] && continue
    if [[ -z "${_pub_cc_seen[$addr_id]+x}" ]]; then
      _pub_cc_seen["$addr_id"]=1
      if [[ -z "$pub_cc_ids" ]]; then
        pub_cc_ids="$addr_id"
      else
        pub_cc_ids="$pub_cc_ids,$addr_id"
      fi
    fi
  done
  unset IFS

  # --- Phase 3: Expand lists and collect actual recipients ---
  # For each direct address: if it's a list, expand; if it's not, add directly
  # Track delivery sources: addr_id -> list of "source_addr_id|source_role|source_kind"
  declare -A _actual_recipients  # addr_id -> best_role
  _actual_order=()               # preserve order (avoid unbound with set -u)
  declare -A _delivery_sources   # addr_id -> newline-separated "source_addr_id|source_role|source_kind"
  local skipped_inactive=0
  local total_before_dedupe=0

  _add_actual_recipient() {
    local addr_id="$1"
    local role="$2"
    local source_addr="$3"
    local source_role="$4"
    local source_kind="$5"

    total_before_dedupe=$((total_before_dedupe + 1))
    local src_entry="${source_addr}|${source_role}|${source_kind}"

    if [[ -z "${_actual_recipients[$addr_id]+x}" ]]; then
      _actual_recipients["$addr_id"]="$role"
      _actual_order+=("$addr_id")
      _delivery_sources["$addr_id"]="$src_entry"
    else
      # Already seen — apply precedence for role
      local existing="${_actual_recipients[$addr_id]}"
      case "$role" in
        to) _actual_recipients["$addr_id"]="to" ;;
        cc) [[ "$existing" != "to" ]] && _actual_recipients["$addr_id"]="cc" ;;
        # bcc never upgrades
      esac
      # Append source
      _delivery_sources["$addr_id"]="${_delivery_sources[$addr_id]}"$'\n'"$src_entry"
    fi
  }

  # Process to recipients
  IFS=','
  for addr_id in $to_addr_ids; do
    [[ -z "$addr_id" ]] && continue
    if is_list_address "$addr_id"; then
      # Expand list
      local members
      members=$(expand_list "$addr_id")
      local member_count=0
      while IFS= read -r member_line; do
        [[ -z "$member_line" ]] && continue
        local member_id
        member_id=$(echo "$member_line" | cut -d'|' -f1)
        _add_actual_recipient "$member_id" "to" "$addr_id" "to" "list"
        member_count=$((member_count + 1))
      done <<< "$members"

      # Count skipped inactive members
      local total_members
      total_members=$(db_count "SELECT count(*) FROM group_members WHERE group_address_id = '$addr_id';")
      skipped_inactive=$((skipped_inactive + total_members - member_count))
    else
      _add_actual_recipient "$addr_id" "to" "$addr_id" "to" "direct"
    fi
  done
  unset IFS

  # Process cc recipients
  IFS=','
  for addr_id in $cc_addr_ids; do
    [[ -z "$addr_id" ]] && continue
    if is_list_address "$addr_id"; then
      local members
      members=$(expand_list "$addr_id")
      local member_count=0
      while IFS= read -r member_line; do
        [[ -z "$member_line" ]] && continue
        local member_id
        member_id=$(echo "$member_line" | cut -d'|' -f1)
        _add_actual_recipient "$member_id" "cc" "$addr_id" "cc" "list"
        member_count=$((member_count + 1))
      done <<< "$members"

      local total_members
      total_members=$(db_count "SELECT count(*) FROM group_members WHERE group_address_id = '$addr_id';")
      skipped_inactive=$((skipped_inactive + total_members - member_count))
    else
      _add_actual_recipient "$addr_id" "cc" "$addr_id" "cc" "direct"
    fi
  done
  unset IFS

  local resolved_count=${#_actual_order[@]}
  local deduped_count=$((total_before_dedupe - resolved_count))

  # Zero recipients check
  if [[ $resolved_count -eq 0 ]]; then
    error_json "invalid_state" "no recipients resolved after expansion and filtering"
    return "$EXIT_INVALID_STATE"
  fi

  # --- Phase 4: Build SQL transaction ---
  # Escape single quotes in text fields for SQL
  local safe_subject safe_body
  safe_subject=$(sql_escape "$subject")
  safe_body=$(sql_escape "$body")

  local sql=""

  # 1. Create conversation
  sql+="INSERT INTO conversations (id, created_at_ms) VALUES ('$cnv_id', $ts);"

  # 2. Create message
  sql+="INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)"
  sql+=" VALUES ('$msg_id', '$cnv_id', NULL, '$sender_addr_id', '$safe_subject', '$safe_body', '$urgency', $ts);"

  # 3. Insert normalized public logical recipient headers
  local ordinal=0
  IFS=','
  for addr_id in $pub_to_ids; do
    [[ -z "$addr_id" ]] && continue
    ordinal=$((ordinal + 1))
    local mpr_id
    mpr_id=$(generate_id "mpr_")
    sql+="INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)"
    sql+=" VALUES ('$mpr_id', '$msg_id', '$addr_id', 'to', $ordinal, $ts);"
  done
  unset IFS

  ordinal=0
  IFS=','
  for addr_id in $pub_cc_ids; do
    [[ -z "$addr_id" ]] && continue
    ordinal=$((ordinal + 1))
    local mpr_id
    mpr_id=$(generate_id "mpr_")
    sql+="INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)"
    sql+=" VALUES ('$mpr_id', '$msg_id', '$addr_id', 'cc', $ordinal, $ts);"
  done
  unset IFS

  # 4. Insert message references
  if [[ "$references_json" != "[]" && -n "$references_json" ]]; then
    # Parse references JSON using sqlite3 (escape single quotes for SQL literals)
    local safe_sql_refs
    safe_sql_refs="$(printf '%s' "$references_json" | sed "s/'/''/g")"
    local ref_count
    ref_count=$(printf "SELECT json_array_length('%s');\n" "$safe_sql_refs" | sqlite3 :memory:)
    local ref_i=0
    while [[ $ref_i -lt $ref_count ]]; do
      local ref_id
      ref_id=$(generate_id "ref_")
      local ref_kind ref_value ref_label ref_mime ref_meta
      ref_kind=$(printf "SELECT json_extract('%s', '\$[%d].kind');\n" "$safe_sql_refs" "$ref_i" | sqlite3 :memory:)
      ref_value=$(printf "SELECT json_extract('%s', '\$[%d].value');\n" "$safe_sql_refs" "$ref_i" | sqlite3 :memory:)
      ref_label=$(printf "SELECT COALESCE(json_extract('%s', '\$[%d].label'), '');\n" "$safe_sql_refs" "$ref_i" | sqlite3 :memory:)
      ref_mime=$(printf "SELECT COALESCE(json_extract('%s', '\$[%d].mime_type'), '');\n" "$safe_sql_refs" "$ref_i" | sqlite3 :memory:)
      ref_meta=$(printf "SELECT COALESCE(json_extract('%s', '\$[%d].metadata'), '');\n" "$safe_sql_refs" "$ref_i" | sqlite3 :memory:)

      local safe_ref_kind safe_ref_value safe_ref_label safe_ref_mime safe_ref_meta
      safe_ref_kind=$(sql_escape "$ref_kind")
      safe_ref_value=$(sql_escape "$ref_value")
      safe_ref_label=$(sql_escape "$ref_label")
      safe_ref_mime=$(sql_escape "$ref_mime")
      safe_ref_meta=$(sql_escape "$ref_meta")

      sql+="INSERT INTO message_references (id, message_id, ordinal, ref_kind, ref_value, label, mime_type, metadata_json)"
      sql+=" VALUES ('$ref_id', '$msg_id', $((ref_i + 1)), '$safe_ref_kind', '$safe_ref_value',"
      if [[ -z "$ref_label" ]]; then
        sql+=" NULL,"
      else
        sql+=" '$safe_ref_label',"
      fi
      if [[ -z "$ref_mime" ]]; then
        sql+=" NULL,"
      else
        sql+=" '$safe_ref_mime',"
      fi
      if [[ -z "$ref_meta" ]]; then
        sql+=" NULL);"
      else
        sql+=" '$safe_ref_meta');"
      fi

      ref_i=$((ref_i + 1))
    done
  fi

  # 5-8. Create deliveries, delivery_sources, delivered events
  for addr_id in "${_actual_order[@]}"; do
    local eff_role="${_actual_recipients[$addr_id]}"
    local dly_id
    dly_id=$(generate_id "dly_")
    local evt_id
    evt_id=$(generate_id "evt_")

    # Create delivery
    sql+="INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)"
    sql+=" VALUES ('$dly_id', '$msg_id', '$addr_id', '$eff_role', 'unread', 'active', $ts);"

    # Create delivery_sources
    local sources="${_delivery_sources[$addr_id]}"
    while IFS= read -r src_line; do
      [[ -z "$src_line" ]] && continue
      local src_addr src_role src_kind
      src_addr=$(echo "$src_line" | cut -d'|' -f1)
      src_role=$(echo "$src_line" | cut -d'|' -f2)
      src_kind=$(echo "$src_line" | cut -d'|' -f3)
      sql+="INSERT OR IGNORE INTO delivery_sources (delivery_id, source_address_id, source_role, source_kind)"
      sql+=" VALUES ('$dly_id', '$src_addr', '$src_role', '$src_kind');"
    done <<< "$sources"

    # Create delivered event
    sql+="INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)"
    sql+=" VALUES ('$evt_id', '$dly_id', 'delivered', 'delivered', NULL, $ts, 'unread', 'active');"
  done

  # 9. Create sent_item
  sql+="INSERT INTO sent_items (message_id, visibility_state) VALUES ('$msg_id', 'active');"

  # Execute the full transaction
  if ! db_transaction "$sql" 2>/dev/null; then
    error_json "internal_error" "send transaction failed"
    return "$EXIT_INTERNAL_ERROR"
  fi

  # Build public_to and public_cc arrays for response
  local pub_to_json="["
  local first=1
  IFS=','
  for addr_id in $pub_to_ids; do
    [[ -z "$addr_id" ]] && continue
    local addr_str safe_addr_str
    addr_str=$(lookup_address_id_to_string "$addr_id")
    safe_addr_str=$(json_escape "$addr_str")
    if [[ $first -eq 1 ]]; then
      pub_to_json+="\"$safe_addr_str\""
      first=0
    else
      pub_to_json+=",\"$safe_addr_str\""
    fi
  done
  unset IFS
  pub_to_json+="]"

  local pub_cc_json="["
  first=1
  IFS=','
  for addr_id in $pub_cc_ids; do
    [[ -z "$addr_id" ]] && continue
    local addr_str safe_addr_str
    addr_str=$(lookup_address_id_to_string "$addr_id")
    safe_addr_str=$(json_escape "$addr_str")
    if [[ $first -eq 1 ]]; then
      pub_cc_json+="\"$safe_addr_str\""
      first=0
    else
      pub_cc_json+=",\"$safe_addr_str\""
    fi
  done
  unset IFS
  pub_cc_json+="]"

  local sender_str safe_sender_str
  sender_str=$(lookup_address_id_to_string "$sender_addr_id")
  safe_sender_str=$(json_escape "$sender_str")

  # Build response
  success_json "\"message_id\":\"$msg_id\",\"conversation_id\":\"$cnv_id\",\"sender\":\"$safe_sender_str\",\"public_to\":$pub_to_json,\"public_cc\":$pub_cc_json,\"resolved_recipient_count\":$resolved_count,\"resolution_summary\":{\"logical_recipient_count\":$logical_count,\"resolved_recipient_count\":$resolved_count,\"skipped_inactive_member_count\":$skipped_inactive,\"deduped_recipient_count\":$deduped_count},\"sent_item_created\":true"
}

# do_send_in_conversation — Like do_send but reuses an existing conversation and sets parent.
# Used internally by do_reply.
# Args: sender_addr_id, cnv_id, parent_msg_id, to_addr_ids (comma-sep IDs), cc_addr_ids (comma-sep IDs), subject, body, urgency, references_json
do_send_in_conversation() {
  local sender_addr_id="$1"
  local cnv_id="$2"
  local parent_msg_id="$3"
  local to_addr_ids="$4"
  local cc_addr_ids="${5:-}"
  local subject="${6:-}"
  local body="${7:-}"
  local urgency="${8:-normal}"
  local references_json="${9:-[]}"

  local ts
  ts=$(now_ms)
  local msg_id
  msg_id=$(generate_id "msg_")

  local logical_count=0
  local all_addr_ids=""

  # Count logical recipients
  IFS=','
  for addr_id in $to_addr_ids; do
    [[ -z "$addr_id" ]] && continue
    logical_count=$((logical_count + 1))
  done
  for addr_id in $cc_addr_ids; do
    [[ -z "$addr_id" ]] && continue
    logical_count=$((logical_count + 1))
  done
  unset IFS

  # --- Validate all direct recipient IDs ---
  IFS=','
  for addr_id in $to_addr_ids; do
    [[ -z "$addr_id" ]] && continue
    local _vr _rc=0
    _vr=$(validate_direct_recipient_by_id "$addr_id") || _rc=$?
    if [[ $_rc -ne 0 ]]; then echo "$_vr"; return $_rc; fi
  done
  for addr_id in $cc_addr_ids; do
    [[ -z "$addr_id" ]] && continue
    local _vr _rc=0
    _vr=$(validate_direct_recipient_by_id "$addr_id") || _rc=$?
    if [[ $_rc -ne 0 ]]; then echo "$_vr"; return $_rc; fi
  done
  unset IFS

  # --- Build public headers (dedupe same-role) ---
  local pub_to_ids="" pub_cc_ids=""
  declare -A _pub_to_seen2 _pub_cc_seen2

  IFS=','
  for addr_id in $to_addr_ids; do
    [[ -z "$addr_id" ]] && continue
    if [[ -z "${_pub_to_seen2[$addr_id]+x}" ]]; then
      _pub_to_seen2["$addr_id"]=1
      pub_to_ids="${pub_to_ids:+$pub_to_ids,}$addr_id"
    fi
  done
  for addr_id in $cc_addr_ids; do
    [[ -z "$addr_id" ]] && continue
    if [[ -z "${_pub_cc_seen2[$addr_id]+x}" ]]; then
      _pub_cc_seen2["$addr_id"]=1
      pub_cc_ids="${pub_cc_ids:+$pub_cc_ids,}$addr_id"
    fi
  done
  unset IFS

  # --- Expand lists and collect actual recipients ---
  declare -A _ar2 _ds2
  _ao2=()
  local skipped_inactive=0
  local total_before_dedupe=0

  _add_ar2() {
    local addr_id="$1" role="$2" src_addr="$3" src_role="$4" src_kind="$5"
    total_before_dedupe=$((total_before_dedupe + 1))
    local src_entry="${src_addr}|${src_role}|${src_kind}"
    if [[ -z "${_ar2[$addr_id]+x}" ]]; then
      _ar2["$addr_id"]="$role"
      _ao2+=("$addr_id")
      _ds2["$addr_id"]="$src_entry"
    else
      local existing="${_ar2[$addr_id]}"
      case "$role" in
        to) _ar2["$addr_id"]="to" ;;
        cc) [[ "$existing" != "to" ]] && _ar2["$addr_id"]="cc" ;;
      esac
      _ds2["$addr_id"]="${_ds2[$addr_id]}"$'\n'"$src_entry"
    fi
  }

  IFS=','
  for addr_id in $to_addr_ids; do
    [[ -z "$addr_id" ]] && continue
    if is_list_address "$addr_id"; then
      local members member_count=0
      members=$(expand_list "$addr_id")
      while IFS= read -r ml; do
        [[ -z "$ml" ]] && continue
        _add_ar2 "$(echo "$ml" | cut -d'|' -f1)" "to" "$addr_id" "to" "list"
        member_count=$((member_count + 1))
      done <<< "$members"
      local tm
      tm=$(db_count "SELECT count(*) FROM group_members WHERE group_address_id = '$addr_id';")
      skipped_inactive=$((skipped_inactive + tm - member_count))
    else
      _add_ar2 "$addr_id" "to" "$addr_id" "to" "direct"
    fi
  done
  for addr_id in $cc_addr_ids; do
    [[ -z "$addr_id" ]] && continue
    if is_list_address "$addr_id"; then
      local members member_count=0
      members=$(expand_list "$addr_id")
      while IFS= read -r ml; do
        [[ -z "$ml" ]] && continue
        _add_ar2 "$(echo "$ml" | cut -d'|' -f1)" "cc" "$addr_id" "cc" "list"
        member_count=$((member_count + 1))
      done <<< "$members"
      local tm
      tm=$(db_count "SELECT count(*) FROM group_members WHERE group_address_id = '$addr_id';")
      skipped_inactive=$((skipped_inactive + tm - member_count))
    else
      _add_ar2 "$addr_id" "cc" "$addr_id" "cc" "direct"
    fi
  done
  unset IFS

  local resolved_count=${#_ao2[@]}
  local deduped_count=$((total_before_dedupe - resolved_count))

  if [[ $resolved_count -eq 0 ]]; then
    error_json "invalid_state" "no recipients resolved after expansion and filtering"
    return "$EXIT_INVALID_STATE"
  fi

  # --- Build SQL ---
  local safe_subject safe_body
  safe_subject=$(sql_escape "$subject")
  safe_body=$(sql_escape "$body")
  local sql=""

  # Create message (conversation already exists; set parent)
  local parent_clause="NULL"
  [[ -n "$parent_msg_id" ]] && parent_clause="'$parent_msg_id'"

  sql+="INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)"
  sql+=" VALUES ('$msg_id', '$cnv_id', $parent_clause, '$sender_addr_id', '$safe_subject', '$safe_body', '$urgency', $ts);"

  # Public headers
  local ordinal=0
  IFS=','
  for addr_id in $pub_to_ids; do
    [[ -z "$addr_id" ]] && continue
    ordinal=$((ordinal + 1))
    local mpr_id
    mpr_id=$(generate_id "mpr_")
    sql+="INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)"
    sql+=" VALUES ('$mpr_id', '$msg_id', '$addr_id', 'to', $ordinal, $ts);"
  done
  unset IFS

  ordinal=0
  IFS=','
  for addr_id in $pub_cc_ids; do
    [[ -z "$addr_id" ]] && continue
    ordinal=$((ordinal + 1))
    local mpr_id
    mpr_id=$(generate_id "mpr_")
    sql+="INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)"
    sql+=" VALUES ('$mpr_id', '$msg_id', '$addr_id', 'cc', $ordinal, $ts);"
  done
  unset IFS

  # Insert message references
  if [[ "$references_json" != "[]" && -n "$references_json" ]]; then
    # Parse references JSON using sqlite3 (escape single quotes for SQL literals)
    local safe_sql_refs
    safe_sql_refs="$(printf '%s' "$references_json" | sed "s/'/''/g")"
    local ref_count
    ref_count=$(printf "SELECT json_array_length('%s');\n" "$safe_sql_refs" | sqlite3 :memory:)
    local ref_i=0
    while [[ $ref_i -lt $ref_count ]]; do
      local ref_id
      ref_id=$(generate_id "ref_")
      local ref_kind ref_value ref_label ref_mime ref_meta
      ref_kind=$(printf "SELECT json_extract('%s', '\$[%d].kind');\n" "$safe_sql_refs" "$ref_i" | sqlite3 :memory:)
      ref_value=$(printf "SELECT json_extract('%s', '\$[%d].value');\n" "$safe_sql_refs" "$ref_i" | sqlite3 :memory:)
      ref_label=$(printf "SELECT COALESCE(json_extract('%s', '\$[%d].label'), '');\n" "$safe_sql_refs" "$ref_i" | sqlite3 :memory:)
      ref_mime=$(printf "SELECT COALESCE(json_extract('%s', '\$[%d].mime_type'), '');\n" "$safe_sql_refs" "$ref_i" | sqlite3 :memory:)
      ref_meta=$(printf "SELECT COALESCE(json_extract('%s', '\$[%d].metadata'), '');\n" "$safe_sql_refs" "$ref_i" | sqlite3 :memory:)

      local safe_ref_kind safe_ref_value safe_ref_label safe_ref_mime safe_ref_meta
      safe_ref_kind=$(sql_escape "$ref_kind")
      safe_ref_value=$(sql_escape "$ref_value")
      safe_ref_label=$(sql_escape "$ref_label")
      safe_ref_mime=$(sql_escape "$ref_mime")
      safe_ref_meta=$(sql_escape "$ref_meta")

      sql+="INSERT INTO message_references (id, message_id, ordinal, ref_kind, ref_value, label, mime_type, metadata_json)"
      sql+=" VALUES ('$ref_id', '$msg_id', $((ref_i + 1)), '$safe_ref_kind', '$safe_ref_value',"
      if [[ -z "$ref_label" ]]; then
        sql+=" NULL,"
      else
        sql+=" '$safe_ref_label',"
      fi
      if [[ -z "$ref_mime" ]]; then
        sql+=" NULL,"
      else
        sql+=" '$safe_ref_mime',"
      fi
      if [[ -z "$ref_meta" ]]; then
        sql+=" NULL);"
      else
        sql+=" '$safe_ref_meta');"
      fi

      ref_i=$((ref_i + 1))
    done
  fi

  # Deliveries + sources + events
  for addr_id in "${_ao2[@]}"; do
    local eff_role="${_ar2[$addr_id]}"
    local dly_id evt_id
    dly_id=$(generate_id "dly_")
    evt_id=$(generate_id "evt_")

    sql+="INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)"
    sql+=" VALUES ('$dly_id', '$msg_id', '$addr_id', '$eff_role', 'unread', 'active', $ts);"

    local sources="${_ds2[$addr_id]}"
    while IFS= read -r src_line; do
      [[ -z "$src_line" ]] && continue
      local src_addr src_role src_kind
      src_addr=$(echo "$src_line" | cut -d'|' -f1)
      src_role=$(echo "$src_line" | cut -d'|' -f2)
      src_kind=$(echo "$src_line" | cut -d'|' -f3)
      sql+="INSERT OR IGNORE INTO delivery_sources (delivery_id, source_address_id, source_role, source_kind)"
      sql+=" VALUES ('$dly_id', '$src_addr', '$src_role', '$src_kind');"
    done <<< "$sources"

    sql+="INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)"
    sql+=" VALUES ('$evt_id', '$dly_id', 'delivered', 'delivered', NULL, $ts, 'unread', 'active');"
  done

  # Sent item
  sql+="INSERT INTO sent_items (message_id, visibility_state) VALUES ('$msg_id', 'active');"

  if ! db_transaction "$sql" 2>/dev/null; then
    error_json "internal_error" "send transaction failed"
    return "$EXIT_INTERNAL_ERROR"
  fi

  # Build response
  local sender_str
  sender_str=$(lookup_address_id_to_string "$sender_addr_id")

  local parent_json="null"
  [[ -n "$parent_msg_id" ]] && parent_json="\"$parent_msg_id\""

  success_json "\"message_id\":\"$msg_id\",\"conversation_id\":\"$cnv_id\",\"parent_message_id\":$parent_json,\"sender\":\"$sender_str\",\"resolved_recipient_count\":$resolved_count,\"resolution_summary\":{\"logical_recipient_count\":$logical_count,\"resolved_recipient_count\":$resolved_count,\"skipped_inactive_member_count\":$skipped_inactive,\"deduped_recipient_count\":$deduped_count},\"sent_item_created\":true"
}

# do_reply — Execute a reply transaction.
# Args: actor_addr_id, target_msg_id, all_flag (0/1), explicit_to (comma-sep addr IDs),
#        explicit_cc (comma-sep addr IDs), subject, body, urgency, references_json
do_reply() {
  local actor_addr_id="$1"
  local target_msg_id="$2"
  local all_flag="${3:-0}"
  local explicit_to="${4:-}"
  local explicit_cc="${5:-}"
  local subject="${6:-}"
  local body="${7:-}"
  local urgency="${8:-normal}"
  local references_json="${9:-[]}"

  # Resolve target via resolve_reply (delivery first, then sent_item)
  local reply_result
  reply_result=$(resolve_reply "$target_msg_id" "$actor_addr_id") || return $?

  # Get conversation_id from target message
  local cnv_id
  cnv_id=$(db_query "SELECT conversation_id FROM messages WHERE id = '$target_msg_id';")
  if [[ -z "$cnv_id" ]]; then
    error_json "not_found" "message not found" "message_id"
    return "$EXIT_NOT_FOUND"
  fi

  # Default subject = original subject (NO "Re:" prefix)
  if [[ -z "$subject" ]]; then
    subject=$(db_query "SELECT subject FROM messages WHERE id = '$target_msg_id';")
  fi

  # Build audience
  local to_addr_ids="" cc_addr_ids=""

  if [[ "$all_flag" == "1" ]]; then
    # Use construct_reply_all_audience
    local audience
    audience=$(construct_reply_all_audience "$target_msg_id" "$actor_addr_id" "$explicit_to" "$explicit_cc") || return $?
    to_addr_ids=$(echo "$audience" | grep '^to:' | sed 's/^to://')
    cc_addr_ids=$(echo "$audience" | grep '^cc:' | sed 's/^cc://')
  else
    # Default audience = original sender only
    # Note: actor is NOT excluded in non-all reply. Self-delivery is permitted
    # per MVP design — replying to your own message sends to yourself.
    local original_sender
    original_sender=$(db_query "SELECT sender_address_id FROM messages WHERE id = '$target_msg_id';")

    if [[ -n "$explicit_to" ]]; then
      # Explicit --to provided, add original sender + explicit recipients
      to_addr_ids="$original_sender"
      # Remove actor from explicit_to
      IFS=','
      for addr_id in $explicit_to; do
        [[ -z "$addr_id" || "$addr_id" == "$actor_addr_id" ]] && continue
        to_addr_ids="$to_addr_ids,$addr_id"
      done
      unset IFS
    else
      to_addr_ids="$original_sender"
    fi

    if [[ -n "$explicit_cc" ]]; then
      IFS=','
      for addr_id in $explicit_cc; do
        [[ -z "$addr_id" || "$addr_id" == "$actor_addr_id" ]] && continue
        cc_addr_ids="${cc_addr_ids:+$cc_addr_ids,}$addr_id"
      done
      unset IFS
    fi
  fi

  # If no audience resolved (e.g., replying to own sent message without --all and no explicit)
  # self-only reply is allowed
  if [[ -z "$to_addr_ids" && -z "$cc_addr_ids" ]]; then
    to_addr_ids="$actor_addr_id"
  fi

  # Delegate to do_send_in_conversation
  do_send_in_conversation "$actor_addr_id" "$cnv_id" "$target_msg_id" "$to_addr_ids" "$cc_addr_ids" "$subject" "$body" "$urgency" "$references_json"
}
