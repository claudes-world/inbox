#!/usr/bin/env bash
# lib/mutate.sh — State mutation logic: read, ack, hide, unhide delivery and sent items.
# All mutators are idempotent: no-op returns changed=false, appends NO event.

# do_read — Mark delivery as read (or no-op if already read/acknowledged).
# Args: msg_id, actor_addr_id, peek (0/1)
# Output: JSON result with changed status
do_read() {
  local msg_id="$1"
  local actor_addr_id="$2"
  local peek="${3:-0}"

  # Resolve delivery
  local dly_row
  dly_row=$(resolve_inbox "$msg_id" "$actor_addr_id") || return $?

  local dly_id engagement_state visibility_state
  dly_id=$(echo "$dly_row" | cut -d'|' -f1)
  engagement_state=$(echo "$dly_row" | cut -d'|' -f5)
  visibility_state=$(echo "$dly_row" | cut -d'|' -f6)

  if [[ "$peek" == "1" ]]; then
    # Peek mode: no mutation
    success_json "\"message_id\":\"$msg_id\",\"changed\":false,\"view_kind\":\"received\",\"engagement_state\":\"$engagement_state\",\"visibility_state\":\"$visibility_state\""
    return 0
  fi

  # State transition: unread -> read. read/ack -> no-op
  if [[ "$engagement_state" == "unread" ]]; then
    local ts evt_id
    ts=$(now_ms)
    evt_id=$(generate_id "evt_")

    local sql=""
    sql+="UPDATE deliveries SET engagement_state = 'read' WHERE id = '$dly_id';"
    sql+="INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)"
    sql+=" VALUES ('$evt_id', '$dly_id', 'state_changed', 'read', '$actor_addr_id', $ts, 'read', '$visibility_state');"

    if ! db_transaction "$sql" 2>/dev/null; then
      error_json "internal_error" "read mutation failed"
      return "$EXIT_INTERNAL_ERROR"
    fi

    success_json "\"message_id\":\"$msg_id\",\"changed\":true,\"view_kind\":\"received\",\"engagement_state\":\"read\",\"visibility_state\":\"$visibility_state\""
  else
    # No-op: already read or acknowledged
    success_json "\"message_id\":\"$msg_id\",\"changed\":false,\"view_kind\":\"received\",\"engagement_state\":\"$engagement_state\",\"visibility_state\":\"$visibility_state\""
  fi
}

# do_read_history — Return N prior visible messages using thread visibility union, oldest-to-newest.
# Args: msg_id, actor_addr_id, history_count
# Output: JSON array of history items
do_read_history() {
  local msg_id="$1"
  local actor_addr_id="$2"
  local history_count="${3:-5}"

  # Verify the actor can see the target message (delivery or sent_item).
  # resolve_reply returns "delivery|<row>" or "sent|<row>"; discard the value,
  # we only care whether the check passes.
  local _visibility_check
  _visibility_check=$(resolve_reply "$msg_id" "$actor_addr_id" 2>/dev/null) || {
    error_json "not_found" "message not found" "message_id"
    return "$EXIT_NOT_FOUND"
  }

  # Get the conversation and timestamp of the target message
  local msg_info
  msg_info=$(db_query "SELECT conversation_id, created_at_ms FROM messages WHERE id = '$msg_id';")
  if [[ -z "$msg_info" ]]; then
    echo "[]"
    return 0
  fi

  local cnv_id msg_ts
  cnv_id=$(echo "$msg_info" | cut -d'|' -f1)
  msg_ts=$(echo "$msg_info" | cut -d'|' -f2)

  # Get visible message IDs for parent redaction
  local visible_ids
  visible_ids=$(resolve_thread_msg_ids "$cnv_id" "$actor_addr_id")

  # Select N prior visible messages (newest first by created_at_ms), then return oldest-to-newest
  # Using the visibility union: actor deliveries + actor sent items.
  # Use SOH ($'\x01') as column separator to avoid breakage on pipe chars in body/subject.
  local _sep=$'\x01'
  local history_rows
  history_rows=$(printf '%s\n' \
    "PRAGMA foreign_keys = ON;" \
    ".separator \"$(printf '\x01')\"" \
    "SELECT m.id, m.conversation_id, m.parent_message_id, m.sender_address_id,
      m.subject, m.body, m.sender_urgency, m.created_at_ms,
      COALESCE(d.id, '') as delivery_id,
      COALESCE(d.effective_role, '') as effective_role,
      COALESCE(d.engagement_state, '') as engagement_state,
      COALESCE(d.visibility_state, '') as d_visibility_state,
      CASE WHEN d.id IS NOT NULL THEN 'received' ELSE 'sent' END as view_kind,
      COALESCE(si.visibility_state, '') as s_visibility_state
    FROM messages m
    LEFT JOIN deliveries d ON d.message_id = m.id AND d.recipient_address_id = '$actor_addr_id'
    LEFT JOIN sent_items si ON si.message_id = m.id AND m.sender_address_id = '$actor_addr_id'
    WHERE m.conversation_id = '$cnv_id'
      AND (d.id IS NOT NULL OR si.message_id IS NOT NULL)
      AND m.created_at_ms < $msg_ts
    ORDER BY m.created_at_ms DESC, m.id DESC
    LIMIT $history_count;" \
    | sqlite3 "$INBOX_DB")

  if [[ -z "$history_rows" ]]; then
    echo "[]"
    return 0
  fi

  # Reverse to oldest-to-newest and format as JSON
  local items="["
  local first=1
  # Reverse lines: read into array then iterate backward
  local -a lines=()
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    lines+=("$line")
  done <<< "$history_rows"

  local i
  for (( i=${#lines[@]}-1; i>=0; i-- )); do
    local line="${lines[$i]}"
    local h_id h_cnv h_parent h_sender_id h_subject h_body h_urgency h_created_at h_dly_id h_eff_role h_eng h_d_vis h_view h_s_vis
    IFS=$'\x01' read -r h_id h_cnv h_parent h_sender_id h_subject h_body h_urgency h_created_at h_dly_id h_eff_role h_eng h_d_vis h_view h_s_vis <<< "$line"

    # Parent redaction: check if parent is in visible set
    local redacted_parent="null"
    if [[ -n "$h_parent" ]]; then
      if echo "$visible_ids" | grep -q "^${h_parent}$"; then
        redacted_parent="\"$h_parent\""
      fi
    fi

    local h_sender_str
    h_sender_str=$(lookup_address_id_to_string "$h_sender_id")

    # Escape strings for JSON
    local safe_h_subject safe_h_body
    safe_h_subject=$(json_escape "$h_subject")
    safe_h_body=$(json_escape "$h_body")

    local item="{\"message_id\":\"$h_id\",\"conversation_id\":\"$h_cnv\",\"parent_message_id\":$redacted_parent,\"sender\":\"$h_sender_str\",\"subject\":\"$safe_h_subject\",\"body\":\"$safe_h_body\",\"created_at_ms\":$h_created_at,\"view_kind\":\"$h_view\""

    if [[ "$h_view" == "received" ]]; then
      item+=",\"engagement_state\":\"$h_eng\",\"visibility_state\":\"$h_d_vis\",\"effective_role\":\"$h_eff_role\""
    else
      item+=",\"visibility_state\":\"$h_s_vis\""
    fi
    item+="}"

    if [[ $first -eq 1 ]]; then
      items+="$item"
      first=0
    else
      items+=",$item"
    fi
  done

  items+="]"
  echo "$items"
}

# do_ack — Mark delivery as acknowledged (or no-op if already acknowledged).
# Args: msg_id, actor_addr_id
# Transitions: unread/read -> acknowledged, acknowledged -> no-op
do_ack() {
  local msg_id="$1"
  local actor_addr_id="$2"

  # Resolve delivery
  local dly_row
  dly_row=$(resolve_inbox "$msg_id" "$actor_addr_id") || return $?

  local dly_id engagement_state visibility_state
  dly_id=$(echo "$dly_row" | cut -d'|' -f1)
  engagement_state=$(echo "$dly_row" | cut -d'|' -f5)
  visibility_state=$(echo "$dly_row" | cut -d'|' -f6)

  if [[ "$engagement_state" != "acknowledged" ]]; then
    local ts evt_id
    ts=$(now_ms)
    evt_id=$(generate_id "evt_")

    local sql=""
    sql+="UPDATE deliveries SET engagement_state = 'acknowledged' WHERE id = '$dly_id';"
    sql+="INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)"
    sql+=" VALUES ('$evt_id', '$dly_id', 'state_changed', 'ack', '$actor_addr_id', $ts, 'acknowledged', '$visibility_state');"

    if ! db_transaction "$sql" 2>/dev/null; then
      error_json "internal_error" "ack mutation failed"
      return "$EXIT_INTERNAL_ERROR"
    fi

    success_json "\"message_id\":\"$msg_id\",\"changed\":true,\"view_kind\":\"received\",\"engagement_state\":\"acknowledged\",\"visibility_state\":\"$visibility_state\""
  else
    # No-op
    success_json "\"message_id\":\"$msg_id\",\"changed\":false,\"view_kind\":\"received\",\"engagement_state\":\"acknowledged\",\"visibility_state\":\"$visibility_state\""
  fi
}

# do_hide — Mark delivery visibility as hidden (or no-op if already hidden).
# Args: msg_id, actor_addr_id
# Transitions: active -> hidden, hidden -> no-op
do_hide() {
  local msg_id="$1"
  local actor_addr_id="$2"

  local dly_row
  dly_row=$(resolve_inbox "$msg_id" "$actor_addr_id") || return $?

  local dly_id engagement_state visibility_state
  dly_id=$(echo "$dly_row" | cut -d'|' -f1)
  engagement_state=$(echo "$dly_row" | cut -d'|' -f5)
  visibility_state=$(echo "$dly_row" | cut -d'|' -f6)

  if [[ "$visibility_state" == "active" ]]; then
    local ts evt_id
    ts=$(now_ms)
    evt_id=$(generate_id "evt_")

    local sql=""
    sql+="UPDATE deliveries SET visibility_state = 'hidden' WHERE id = '$dly_id';"
    sql+="INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)"
    sql+=" VALUES ('$evt_id', '$dly_id', 'state_changed', 'hide', '$actor_addr_id', $ts, '$engagement_state', 'hidden');"

    if ! db_transaction "$sql" 2>/dev/null; then
      error_json "internal_error" "hide mutation failed"
      return "$EXIT_INTERNAL_ERROR"
    fi

    success_json "\"message_id\":\"$msg_id\",\"changed\":true,\"view_kind\":\"received\",\"engagement_state\":\"$engagement_state\",\"visibility_state\":\"hidden\""
  else
    # No-op
    success_json "\"message_id\":\"$msg_id\",\"changed\":false,\"view_kind\":\"received\",\"engagement_state\":\"$engagement_state\",\"visibility_state\":\"hidden\""
  fi
}

# do_unhide — Mark delivery visibility as active (or no-op if already active).
# Args: msg_id, actor_addr_id
# Transitions: hidden -> active, active -> no-op
do_unhide() {
  local msg_id="$1"
  local actor_addr_id="$2"

  local dly_row
  dly_row=$(resolve_inbox "$msg_id" "$actor_addr_id") || return $?

  local dly_id engagement_state visibility_state
  dly_id=$(echo "$dly_row" | cut -d'|' -f1)
  engagement_state=$(echo "$dly_row" | cut -d'|' -f5)
  visibility_state=$(echo "$dly_row" | cut -d'|' -f6)

  if [[ "$visibility_state" == "hidden" ]]; then
    local ts evt_id
    ts=$(now_ms)
    evt_id=$(generate_id "evt_")

    local sql=""
    sql+="UPDATE deliveries SET visibility_state = 'active' WHERE id = '$dly_id';"
    sql+="INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)"
    sql+=" VALUES ('$evt_id', '$dly_id', 'state_changed', 'unhide', '$actor_addr_id', $ts, '$engagement_state', 'active');"

    if ! db_transaction "$sql" 2>/dev/null; then
      error_json "internal_error" "unhide mutation failed"
      return "$EXIT_INTERNAL_ERROR"
    fi

    success_json "\"message_id\":\"$msg_id\",\"changed\":true,\"view_kind\":\"received\",\"engagement_state\":\"$engagement_state\",\"visibility_state\":\"active\""
  else
    # No-op
    success_json "\"message_id\":\"$msg_id\",\"changed\":false,\"view_kind\":\"received\",\"engagement_state\":\"$engagement_state\",\"visibility_state\":\"active\""
  fi
}

# do_sent_hide — Hide a sent item (visibility -> hidden).
# Args: msg_id, actor_addr_id
do_sent_hide() {
  local msg_id="$1"
  local actor_addr_id="$2"

  # Resolve sent item
  local sent_row
  sent_row=$(resolve_sent "$msg_id" "$actor_addr_id") || return $?

  local vis_state
  vis_state=$(echo "$sent_row" | cut -d'|' -f2)

  if [[ "$vis_state" == "active" ]]; then
    local ts
    ts=$(now_ms)

    if ! db_exec "UPDATE sent_items SET visibility_state = 'hidden', hidden_at_ms = $ts WHERE message_id = '$msg_id';" 2>/dev/null; then
      error_json "internal_error" "sent hide mutation failed"
      return "$EXIT_INTERNAL_ERROR"
    fi

    success_json "\"message_id\":\"$msg_id\",\"changed\":true,\"view_kind\":\"sent\",\"visibility_state\":\"hidden\""
  else
    # No-op
    success_json "\"message_id\":\"$msg_id\",\"changed\":false,\"view_kind\":\"sent\",\"visibility_state\":\"hidden\""
  fi
}

# do_sent_unhide — Unhide a sent item (visibility -> active, clear hidden_at_ms).
# Args: msg_id, actor_addr_id
do_sent_unhide() {
  local msg_id="$1"
  local actor_addr_id="$2"

  # Resolve sent item
  local sent_row
  sent_row=$(resolve_sent "$msg_id" "$actor_addr_id") || return $?

  local vis_state
  vis_state=$(echo "$sent_row" | cut -d'|' -f2)

  if [[ "$vis_state" == "hidden" ]]; then
    if ! db_exec "UPDATE sent_items SET visibility_state = 'active', hidden_at_ms = NULL WHERE message_id = '$msg_id';" 2>/dev/null; then
      error_json "internal_error" "sent unhide mutation failed"
      return "$EXIT_INTERNAL_ERROR"
    fi

    success_json "\"message_id\":\"$msg_id\",\"changed\":true,\"view_kind\":\"sent\",\"visibility_state\":\"active\""
  else
    # No-op
    success_json "\"message_id\":\"$msg_id\",\"changed\":false,\"view_kind\":\"sent\",\"visibility_state\":\"active\""
  fi
}
