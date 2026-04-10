#!/usr/bin/env bash
# lib/commands.sh — CLI command handlers: wire library functions to CLI interface.
# Each cmd_* function parses command-specific flags, validates, calls library, formats output.

# require_flag_value — Guard: ensure a value flag has a following argument.
# Usage: require_flag_value "$1" "$#" || exit $?
require_flag_value() {
  local flag="$1" argc="$2"
  if [[ "$argc" -lt 2 ]]; then
    format_error "invalid_argument" "flag $flag requires a value" || return $?
  fi
}

# ============================================================================
# cmd_whoami — Resolve actor, output identity info.
# ============================================================================
cmd_whoami() {
  local actor_row
  actor_row=$(resolve_actor) || {
    local rc=$?
    # resolve_actor already emitted error JSON to stdout
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_row"
    exit $rc
  }

  local addr_id local_part host kind display_name is_active is_listed classification
  IFS='|' read -r addr_id local_part host kind display_name is_active is_listed classification <<< "$actor_row"

  local address="${local_part}@${host}"

  local dn_json="null"
  [[ -n "$display_name" ]] && dn_json="\"$(json_escape "$display_name")\""

  local safe_db_path
  safe_db_path="$(json_escape "$INBOX_DB")"

  local result
  result=$(success_json "\"address\":\"$address\",\"kind\":\"$kind\",\"display_name\":$dn_json,\"is_active\":$([ "$is_active" = "1" ] && echo "true" || echo "false"),\"is_listed\":$([ "$is_listed" = "1" ] && echo "true" || echo "false"),\"db_path\":\"$safe_db_path\"")

  format_output "$result" format_whoami
}

# ============================================================================
# cmd_send — Send a new message.
# ============================================================================
cmd_send() {
  local to_addrs="" cc_addrs="" subject="" body_flag="" body_file="" urgency="normal"
  local body_flag_set=0
  local -a _REF_KINDS=()
  local -a _REF_VALUES=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --to)      require_flag_value "$1" "$#" || exit $?; to_addrs="${to_addrs:+$to_addrs,}$2"; shift 2 ;;
      --cc)      require_flag_value "$1" "$#" || exit $?; cc_addrs="${cc_addrs:+$cc_addrs,}$2"; shift 2 ;;
      --subject) require_flag_value "$1" "$#" || exit $?; subject="$2"; shift 2 ;;
      --body)    require_flag_value "$1" "$#" || exit $?; body_flag="$2"; body_flag_set=1; shift 2 ;;
      --body-file) require_flag_value "$1" "$#" || exit $?; body_file="$2"; shift 2 ;;
      --urgency) require_flag_value "$1" "$#" || exit $?; urgency="$2"; shift 2 ;;
      --ref)
        require_flag_value "$1" "$#" || exit $?
        local _rk="" _rv=""
        REF_KIND="" REF_VALUE=""
        parse_ref "$2" || exit $?
        _REF_KINDS+=("$REF_KIND")
        _REF_VALUES+=("$REF_VALUE")
        shift 2
        ;;
      --ref-file)
        require_flag_value "$1" "$#" || exit $?
        REF_KIND="" REF_VALUE=""
        parse_ref_file "$2" || exit $?
        _REF_KINDS+=("$REF_KIND")
        _REF_VALUES+=("$REF_VALUE")
        shift 2
        ;;
      *) format_error "invalid_argument" "unknown flag: $1" || exit $? ;;
    esac
  done

  # Validate required fields
  if [[ -z "$to_addrs" ]]; then
    format_error "invalid_argument" "at least one --to recipient is required" || exit $?
  fi

  # Validate urgency
  validate_urgency "$urgency" || exit $?

  # Parse body source — only count stdin when it's actually a pipe/redirect
  local stdin_is_pipe=0
  if [[ ! -t 0 ]] && [[ -p /dev/stdin || -f /dev/stdin ]]; then
    stdin_is_pipe=1
  fi

  PARSED_BODY=""
  parse_body_source "$body_flag" "$body_file" "$stdin_is_pipe" "$body_flag_set" || exit $?
  local body="$PARSED_BODY"

  # Build references JSON
  local refs_json="[]"
  if [[ ${#_REF_KINDS[@]} -gt 0 ]]; then
    refs_json=$(build_refs_json)
  fi

  # Resolve actor
  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"
    exit $rc
  }

  # Call library
  local result
  result=$(do_send "$actor_id" "$to_addrs" "$cc_addrs" "$subject" "$body" "$urgency" "$refs_json") || {
    local rc=$?
    if [[ "$INBOX_JSON_MODE" == "1" ]]; then
      echo "$result"
    else
      echo "$result" >&2
    fi
    exit $rc
  }

  format_output "$result" format_send_result
}

# ============================================================================
# cmd_list — List inbox messages.
# ============================================================================
cmd_list() {
  local state="any" visibility="active" since_ms="" until_ms="" limit="50"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --state)      require_flag_value "$1" "$#" || exit $?; state="$2"; shift 2 ;;
      --visibility) require_flag_value "$1" "$#" || exit $?; visibility="$2"; shift 2 ;;
      --since)
        require_flag_value "$1" "$#" || exit $?
        PARSED_TIME_MS=""
        parse_time_filter "$2" "since" || exit $?
        since_ms="$PARSED_TIME_MS"
        shift 2
        ;;
      --until)
        require_flag_value "$1" "$#" || exit $?
        PARSED_TIME_MS=""
        parse_time_filter "$2" "until" || exit $?
        until_ms="$PARSED_TIME_MS"
        shift 2
        ;;
      --limit)
        require_flag_value "$1" "$#" || exit $?
        parse_limit "$2" || exit $?
        limit="$PARSED_LIMIT"
        shift 2
        ;;
      *) format_error "invalid_argument" "unknown flag: $1" || exit $? ;;
    esac
  done

  # Validate state
  case "$state" in
    any|unread|read|acknowledged) ;;
    *) format_error "invalid_argument" "invalid state filter: $state" || exit $? ;;
  esac

  # Validate visibility
  case "$visibility" in
    active|hidden|any) ;;
    *) format_error "invalid_argument" "invalid visibility filter: $visibility" || exit $? ;;
  esac

  # Resolve actor
  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"
    exit $rc
  }

  # Query inbox
  local where_clauses="d.recipient_address_id = '$actor_id'"

  case "$visibility" in
    active) where_clauses="$where_clauses AND d.visibility_state = 'active'" ;;
    hidden) where_clauses="$where_clauses AND d.visibility_state = 'hidden'" ;;
    any) ;;
  esac

  case "$state" in
    unread)       where_clauses="$where_clauses AND d.engagement_state = 'unread'" ;;
    read)         where_clauses="$where_clauses AND d.engagement_state = 'read'" ;;
    acknowledged) where_clauses="$where_clauses AND d.engagement_state = 'acknowledged'" ;;
    any) ;;
  esac

  if [[ -n "$since_ms" ]]; then
    where_clauses="$where_clauses AND d.delivered_at_ms >= $since_ms"
  fi
  if [[ -n "$until_ms" ]]; then
    where_clauses="$where_clauses AND d.delivered_at_ms < $until_ms"
  fi

  local rows
  rows=$(db_query "SELECT m.id, m.conversation_id, m.subject, m.body, m.created_at_ms,
      d.engagement_state, d.visibility_state, d.effective_role, d.delivered_at_ms, d.id as delivery_id
    FROM deliveries d
    JOIN messages m ON m.id = d.message_id
    WHERE $where_clauses
    ORDER BY d.delivered_at_ms DESC, d.id DESC
    LIMIT $limit;")

  local items="["
  local first=1
  local count=0

  while IFS= read -r row; do
    [[ -z "$row" ]] && continue
    count=$((count + 1))

    local m_id m_cnv m_subj m_body m_ts d_eng d_vis d_role d_at d_id
    IFS='|' read -r m_id m_cnv m_subj m_body m_ts d_eng d_vis d_role d_at d_id <<< "$row"

    # Get sender
    local sender_id sender_str safe_m_id
    safe_m_id="$(sql_escape "$m_id")"
    sender_id=$(db_query "SELECT sender_address_id FROM messages WHERE id = '$safe_m_id';")
    sender_str=$(lookup_address_id_to_string "$sender_id")

    local safe_subj="${m_subj//\\/\\\\}"
    safe_subj="${safe_subj//\"/\\\"}"

    # Body preview (first 80 chars)
    local body_preview="${m_body:0:80}"
    local safe_preview="${body_preview//\\/\\\\}"
    safe_preview="${safe_preview//\"/\\\"}"
    safe_preview="${safe_preview//$'\n'/ }"

    local item="{\"message_id\":\"$m_id\",\"conversation_id\":\"$m_cnv\",\"sender\":\"$sender_str\",\"subject\":\"$safe_subj\",\"delivered_at_ms\":$d_at,\"view_kind\":\"received\",\"engagement_state\":\"$d_eng\",\"visibility_state\":\"$d_vis\",\"effective_role\":\"$d_role\",\"body_preview\":\"$safe_preview\",\"delivery_id\":\"$d_id\"}"

    if [[ $first -eq 1 ]]; then
      items+="$item"
      first=0
    else
      items+=",$item"
    fi
  done <<< "$rows"

  items+="]"

  local result
  result=$(success_json "\"items\":$items,\"limit\":$limit,\"returned_count\":$count")

  format_output "$result" format_list_items
}

# ============================================================================
# cmd_read — Read a message (inbox view).
# ============================================================================
cmd_read() {
  local msg_id="" peek=0 history_count=0

  # First positional arg is the message ID
  if [[ $# -gt 0 && "$1" != --* ]]; then
    msg_id="$1"; shift
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --peek)    peek=1; shift ;;
      --history) require_flag_value "$1" "$#" || exit $?; history_count="$2"; shift 2 ;;
      *) format_error "invalid_argument" "unknown flag: $1" || exit $? ;;
    esac
  done

  # Validate ID
  validate_msg_id "$msg_id" || exit $?

  # Resolve actor
  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"
    exit $rc
  }

  # SQL-escape msg_id for direct SQL interpolation
  local safe_msg_id
  safe_msg_id="$(sql_escape "$msg_id")"

  # Do read (marks as read unless --peek)
  local read_result
  read_result=$(do_read "$msg_id" "$actor_id" "$peek") || {
    local rc=$?
    if [[ "$INBOX_JSON_MODE" == "1" ]]; then
      echo "$read_result"
    else
      echo "$read_result" >&2
    fi
    exit $rc
  }

  # Now get the full message details for display
  local dly_row
  dly_row=$(resolve_inbox "$msg_id" "$actor_id") || {
    local rc=$?
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$dly_row"
    exit $rc
  }

  local dly_id engagement_state visibility_state effective_role
  dly_id=$(echo "$dly_row" | cut -d'|' -f1)
  engagement_state=$(echo "$dly_row" | cut -d'|' -f5)
  visibility_state=$(echo "$dly_row" | cut -d'|' -f6)
  effective_role=$(echo "$dly_row" | cut -d'|' -f4)

  # Get message content
  local msg_row
  msg_row=$(db_query "SELECT id, conversation_id, parent_message_id, sender_address_id,
      subject, body, sender_urgency, created_at_ms
    FROM messages WHERE id = '$safe_msg_id';")

  local m_id m_cnv m_parent m_sender_id m_subj m_body m_urgency m_ts
  IFS='|' read -r m_id m_cnv m_parent m_sender_id m_subj m_body m_urgency m_ts <<< "$msg_row"

  local sender_str
  sender_str=$(lookup_address_id_to_string "$m_sender_id")

  # Get public recipients
  local pub_to_json="["
  local pub_cc_json="["
  local first_to=1 first_cc=1

  local pub_rows
  pub_rows=$(db_query "SELECT recipient_address_id, recipient_role
    FROM message_public_recipients
    WHERE message_id = '$safe_msg_id'
    ORDER BY recipient_role, ordinal;")

  while IFS= read -r pr; do
    [[ -z "$pr" ]] && continue
    local pr_addr_id pr_role
    IFS='|' read -r pr_addr_id pr_role <<< "$pr"
    local pr_str
    pr_str=$(lookup_address_id_to_string "$pr_addr_id")
    if [[ "$pr_role" == "to" ]]; then
      [[ $first_to -eq 1 ]] && { pub_to_json+="\"$pr_str\""; first_to=0; } || pub_to_json+=",\"$pr_str\""
    elif [[ "$pr_role" == "cc" ]]; then
      [[ $first_cc -eq 1 ]] && { pub_cc_json+="\"$pr_str\""; first_cc=0; } || pub_cc_json+=",\"$pr_str\""
    fi
  done <<< "$pub_rows"

  pub_to_json+="]"
  pub_cc_json+="]"

  # Get references
  local refs_json="["
  local first_ref=1
  local ref_rows
  ref_rows=$(db_query "SELECT ref_kind, ref_value, label, mime_type, metadata_json
    FROM message_references WHERE message_id = '$safe_msg_id' ORDER BY ordinal;")

  while IFS= read -r rr; do
    [[ -z "$rr" ]] && continue
    local r_kind r_value r_label r_mime r_meta
    IFS='|' read -r r_kind r_value r_label r_mime r_meta <<< "$rr"

    local safe_r_value="${r_value//\\/\\\\}"
    safe_r_value="${safe_r_value//\"/\\\"}"

    local ref_item="{\"kind\":\"$r_kind\",\"value\":\"$safe_r_value\""
    [[ -n "$r_label" ]] && { local sl="${r_label//\\/\\\\}"; sl="${sl//\"/\\\"}"; ref_item+=",\"label\":\"$sl\""; } || ref_item+=",\"label\":null"
    if [[ -n "$r_mime" ]]; then
      ref_item+=",\"mime_type\":\"$(json_escape "$r_mime")\""
    else
      ref_item+=",\"mime_type\":null"
    fi
    ref_item+=",\"metadata\":${r_meta:-null}}"

    [[ $first_ref -eq 1 ]] && { refs_json+="$ref_item"; first_ref=0; } || refs_json+=",$ref_item"
  done <<< "$ref_rows"
  refs_json+="]"

  # Escape message fields
  local safe_subj
  safe_subj="$(json_escape "$m_subj")"
  local safe_body
  safe_body="$(json_escape "$m_body")"

  local parent_json="null"
  [[ -n "$m_parent" ]] && parent_json="\"$m_parent\""

  # History
  local history_json="[]"
  if [[ "$history_count" -gt 0 ]]; then
    history_json=$(do_read_history "$msg_id" "$actor_id" "$history_count")
  fi

  local result
  result=$(success_json "\"message\":{\"message_id\":\"$m_id\",\"conversation_id\":\"$m_cnv\",\"parent_message_id\":$parent_json,\"sender\":\"$sender_str\",\"subject\":\"$safe_subj\",\"body\":\"$safe_body\",\"public_to\":$pub_to_json,\"public_cc\":$pub_cc_json,\"references\":$refs_json},\"state\":{\"view_kind\":\"received\",\"engagement_state\":\"$engagement_state\",\"visibility_state\":\"$visibility_state\",\"effective_role\":\"$effective_role\",\"delivery_id\":\"$dly_id\"},\"history\":$history_json")

  format_output "$result" format_message
}

# ============================================================================
# cmd_reply — Reply to a message.
# ============================================================================
cmd_reply() {
  local msg_id="" all_flag=0 to_addrs="" cc_addrs="" subject="" body_flag="" body_file="" urgency="normal"
  local body_flag_set=0
  local -a _REF_KINDS=()
  local -a _REF_VALUES=()
  local subject_set=0

  # First positional arg is the message ID
  if [[ $# -gt 0 && "$1" != --* ]]; then
    msg_id="$1"; shift
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all)     all_flag=1; shift ;;
      --to)      require_flag_value "$1" "$#" || exit $?; to_addrs="${to_addrs:+$to_addrs,}$2"; shift 2 ;;
      --cc)      require_flag_value "$1" "$#" || exit $?; cc_addrs="${cc_addrs:+$cc_addrs,}$2"; shift 2 ;;
      --subject) require_flag_value "$1" "$#" || exit $?; subject="$2"; subject_set=1; shift 2 ;;
      --body)    require_flag_value "$1" "$#" || exit $?; body_flag="$2"; body_flag_set=1; shift 2 ;;
      --body-file) require_flag_value "$1" "$#" || exit $?; body_file="$2"; shift 2 ;;
      --urgency) require_flag_value "$1" "$#" || exit $?; urgency="$2"; shift 2 ;;
      --ref)
        require_flag_value "$1" "$#" || exit $?
        REF_KIND="" REF_VALUE=""
        parse_ref "$2" || exit $?
        _REF_KINDS+=("$REF_KIND")
        _REF_VALUES+=("$REF_VALUE")
        shift 2
        ;;
      --ref-file)
        require_flag_value "$1" "$#" || exit $?
        REF_KIND="" REF_VALUE=""
        parse_ref_file "$2" || exit $?
        _REF_KINDS+=("$REF_KIND")
        _REF_VALUES+=("$REF_VALUE")
        shift 2
        ;;
      *) format_error "invalid_argument" "unknown flag: $1" || exit $? ;;
    esac
  done

  validate_msg_id "$msg_id" || exit $?
  validate_urgency "$urgency" || exit $?

  # Parse body — only count stdin when it's actually a pipe/redirect
  local stdin_is_pipe=0
  if [[ ! -t 0 ]] && [[ -p /dev/stdin || -f /dev/stdin ]]; then
    stdin_is_pipe=1
  fi

  PARSED_BODY=""
  parse_body_source "$body_flag" "$body_file" "$stdin_is_pipe" "$body_flag_set" || exit $?
  local body="$PARSED_BODY"

  # Resolve actor
  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"
    exit $rc
  }

  # Resolve explicit --to addresses to IDs
  local to_addr_ids=""
  if [[ -n "$to_addrs" ]]; then
    local IFS=','
    for addr_str in $to_addrs; do
      [[ -z "$addr_str" ]] && continue
      local addr_id
      addr_id=$(lookup_address_by_string "$addr_str")
      if [[ -z "$addr_id" ]]; then
        format_error "invalid_argument" "unknown recipient address: $addr_str" || exit $?
      fi
      to_addr_ids="${to_addr_ids:+$to_addr_ids,}$addr_id"
    done
    unset IFS
  fi

  # Resolve explicit --cc addresses to IDs
  local cc_addr_ids=""
  if [[ -n "$cc_addrs" ]]; then
    local IFS=','
    for addr_str in $cc_addrs; do
      [[ -z "$addr_str" ]] && continue
      local addr_id
      addr_id=$(lookup_address_by_string "$addr_str")
      if [[ -z "$addr_id" ]]; then
        format_error "invalid_argument" "unknown recipient address: $addr_str" || exit $?
      fi
      cc_addr_ids="${cc_addr_ids:+$cc_addr_ids,}$addr_id"
    done
    unset IFS
  fi

  local reply_subject=""
  [[ "$subject_set" == "1" ]] && reply_subject="$subject"

  local result
  result=$(do_reply "$actor_id" "$msg_id" "$all_flag" "$to_addr_ids" "$cc_addr_ids" "$reply_subject" "$body" "$urgency") || {
    local rc=$?
    if [[ "$INBOX_JSON_MODE" == "1" ]]; then
      echo "$result"
    else
      echo "$result" >&2
    fi
    exit $rc
  }

  format_output "$result" format_send_result
}

# ============================================================================
# cmd_ack — Acknowledge a message.
# ============================================================================
cmd_ack() {
  local msg_id=""
  [[ $# -gt 0 && "$1" != --* ]] && { msg_id="$1"; shift; }

  validate_msg_id "$msg_id" || exit $?

  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?; [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"; exit $rc
  }

  local result
  result=$(do_ack "$msg_id" "$actor_id") || {
    local rc=$?
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$result" || echo "$result" >&2
    exit $rc
  }

  format_output "$result" format_mutation_result
}

# ============================================================================
# cmd_hide — Hide a message (inbox view).
# ============================================================================
cmd_hide() {
  local msg_id=""
  [[ $# -gt 0 && "$1" != --* ]] && { msg_id="$1"; shift; }

  validate_msg_id "$msg_id" || exit $?

  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?; [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"; exit $rc
  }

  local result
  result=$(do_hide "$msg_id" "$actor_id") || {
    local rc=$?
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$result" || echo "$result" >&2
    exit $rc
  }

  format_output "$result" format_mutation_result
}

# ============================================================================
# cmd_unhide — Unhide a message (inbox view).
# ============================================================================
cmd_unhide() {
  local msg_id=""
  [[ $# -gt 0 && "$1" != --* ]] && { msg_id="$1"; shift; }

  validate_msg_id "$msg_id" || exit $?

  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?; [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"; exit $rc
  }

  local result
  result=$(do_unhide "$msg_id" "$actor_id") || {
    local rc=$?
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$result" || echo "$result" >&2
    exit $rc
  }

  format_output "$result" format_mutation_result
}

# ============================================================================
# cmd_sent_list — List sent messages.
# ============================================================================
cmd_sent_list() {
  local visibility="active" since_ms="" until_ms="" limit="50"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --visibility) require_flag_value "$1" "$#" || exit $?; visibility="$2"; shift 2 ;;
      --since)
        require_flag_value "$1" "$#" || exit $?
        PARSED_TIME_MS=""
        parse_time_filter "$2" "since" || exit $?
        since_ms="$PARSED_TIME_MS"
        shift 2
        ;;
      --until)
        require_flag_value "$1" "$#" || exit $?
        PARSED_TIME_MS=""
        parse_time_filter "$2" "until" || exit $?
        until_ms="$PARSED_TIME_MS"
        shift 2
        ;;
      --limit)
        require_flag_value "$1" "$#" || exit $?
        parse_limit "$2" || exit $?
        limit="$PARSED_LIMIT"
        shift 2
        ;;
      *) format_error "invalid_argument" "unknown flag: $1" || exit $? ;;
    esac
  done

  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?; [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"; exit $rc
  }

  local result
  result=$(query_sent_list "$actor_id" "$visibility" "$since_ms" "$until_ms" "$limit") || {
    local rc=$?
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$result" || echo "$result" >&2
    exit $rc
  }

  format_output "$result" format_sent_list_items
}

# ============================================================================
# cmd_sent_read — Read a sent message.
# ============================================================================
cmd_sent_read() {
  local msg_id=""
  [[ $# -gt 0 && "$1" != --* ]] && { msg_id="$1"; shift; }

  validate_msg_id "$msg_id" || exit $?

  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?; [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"; exit $rc
  }

  local result
  result=$(query_sent_read "$msg_id" "$actor_id") || {
    local rc=$?
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$result" || echo "$result" >&2
    exit $rc
  }

  format_output "$result" format_message
}

# ============================================================================
# cmd_sent_hide — Hide a sent message.
# ============================================================================
cmd_sent_hide() {
  local msg_id=""
  [[ $# -gt 0 && "$1" != --* ]] && { msg_id="$1"; shift; }

  validate_msg_id "$msg_id" || exit $?

  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?; [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"; exit $rc
  }

  local result
  result=$(do_sent_hide "$msg_id" "$actor_id") || {
    local rc=$?
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$result" || echo "$result" >&2
    exit $rc
  }

  format_output "$result" format_mutation_result
}

# ============================================================================
# cmd_sent_unhide — Unhide a sent message.
# ============================================================================
cmd_sent_unhide() {
  local msg_id=""
  [[ $# -gt 0 && "$1" != --* ]] && { msg_id="$1"; shift; }

  validate_msg_id "$msg_id" || exit $?

  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?; [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"; exit $rc
  }

  local result
  result=$(do_sent_unhide "$msg_id" "$actor_id") || {
    local rc=$?
    [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$result" || echo "$result" >&2
    exit $rc
  }

  format_output "$result" format_mutation_result
}

# ============================================================================
# cmd_thread — View conversation thread.
# ============================================================================
cmd_thread() {
  local cnv_id="" since_ms="" until_ms="" limit=50 full_flag=0

  # First positional arg is the conversation ID
  [[ $# -gt 0 && "$1" != --* ]] && { cnv_id="$1"; shift; }

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --since)
        require_flag_value "$1" "$#" || exit $?
        PARSED_TIME_MS=""
        parse_time_filter "$2" "since" || exit $?
        since_ms="$PARSED_TIME_MS"
        shift 2
        ;;
      --until)
        require_flag_value "$1" "$#" || exit $?
        PARSED_TIME_MS=""
        parse_time_filter "$2" "until" || exit $?
        until_ms="$PARSED_TIME_MS"
        shift 2
        ;;
      --limit)
        require_flag_value "$1" "$#" || exit $?
        parse_limit "$2" || exit $?
        limit="$PARSED_LIMIT"
        shift 2
        ;;
      --full) full_flag=1; shift ;;
      *) format_error "invalid_argument" "unknown flag: $1" || exit $? ;;
    esac
  done

  validate_cnv_id "$cnv_id" || exit $?

  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?; [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"; exit $rc
  }

  # SQL-escape cnv_id for direct SQL interpolation
  local safe_cnv_id
  safe_cnv_id="$(sql_escape "$cnv_id")"

  # Get visible message IDs for parent redaction
  local visible_ids
  visible_ids=$(resolve_thread_msg_ids "$cnv_id" "$actor_id")

  # Build time-bounded query
  local time_clause=""
  [[ -n "$since_ms" ]] && time_clause="$time_clause AND m.created_at_ms >= $since_ms"
  [[ -n "$until_ms" ]] && time_clause="$time_clause AND m.created_at_ms < $until_ms"

  # Get total visible count (for truncation metadata)
  local total_visible_count
  total_visible_count=$(db_count "SELECT count(DISTINCT m.id)
    FROM messages m
    LEFT JOIN deliveries d ON d.message_id = m.id AND d.recipient_address_id = '$actor_id'
    LEFT JOIN sent_items si ON si.message_id = m.id AND m.sender_address_id = '$actor_id'
    WHERE m.conversation_id = '$safe_cnv_id'
      AND (d.id IS NOT NULL OR si.message_id IS NOT NULL)
      $time_clause;")

  # Window selection: newest N, then return oldest-to-newest
  local thread_rows
  thread_rows=$(db_query "SELECT m.id, m.conversation_id, m.parent_message_id, m.sender_address_id,
      m.subject, m.body, m.sender_urgency, m.created_at_ms,
      COALESCE(d.id, '') as delivery_id,
      COALESCE(d.effective_role, '') as effective_role,
      COALESCE(d.engagement_state, '') as engagement_state,
      COALESCE(d.visibility_state, '') as d_visibility_state,
      CASE WHEN d.id IS NOT NULL THEN 'received' ELSE 'sent' END as view_kind,
      COALESCE(si.visibility_state, '') as s_visibility_state
    FROM messages m
    LEFT JOIN deliveries d ON d.message_id = m.id AND d.recipient_address_id = '$actor_id'
    LEFT JOIN sent_items si ON si.message_id = m.id AND m.sender_address_id = '$actor_id'
    WHERE m.conversation_id = '$safe_cnv_id'
      AND (d.id IS NOT NULL OR si.message_id IS NOT NULL)
      $time_clause
    ORDER BY m.created_at_ms DESC, m.id DESC
    LIMIT $limit;")

  # Reverse to oldest-to-newest and build JSON
  local -a lines=()
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    lines+=("$line")
  done <<< "$thread_rows"

  local items="["
  local first=1
  local count=0

  local i
  for (( i=${#lines[@]}-1; i>=0; i-- )); do
    local line="${lines[$i]}"
    count=$((count + 1))

    local t_id t_cnv t_parent t_sender_id t_subj t_body t_urgency t_ts t_dly_id t_role t_eng t_d_vis t_view t_s_vis
    IFS='|' read -r t_id t_cnv t_parent t_sender_id t_subj t_body t_urgency t_ts t_dly_id t_role t_eng t_d_vis t_view t_s_vis <<< "$line"

    # Parent redaction
    local redacted_parent="null"
    if [[ -n "$t_parent" ]]; then
      if echo "$visible_ids" | grep -q "^${t_parent}$"; then
        redacted_parent="\"$t_parent\""
      fi
    fi

    local sender_str
    sender_str=$(lookup_address_id_to_string "$t_sender_id")

    local safe_subj="${t_subj//\\/\\\\}"; safe_subj="${safe_subj//\"/\\\"}"

    local item="{\"message_id\":\"$t_id\",\"parent_message_id\":$redacted_parent,\"sender\":\"$sender_str\",\"subject\":\"$safe_subj\",\"created_at_ms\":$t_ts,\"view_kind\":\"$t_view\""

    if [[ "$t_view" == "received" ]]; then
      item+=",\"engagement_state\":\"$t_eng\",\"visibility_state\":\"$t_d_vis\",\"effective_role\":\"$t_role\""
    else
      item+=",\"visibility_state\":\"$t_s_vis\""
    fi

    # Body preview or full body
    if [[ "$full_flag" == "1" ]]; then
      local safe_body="${t_body//\\/\\\\}"; safe_body="${safe_body//\"/\\\"}"
      safe_body="${safe_body//$'\n'/\\n}"
      item+=",\"body\":\"$safe_body\""

      # References for full mode
      local refs_json="["
      local first_ref=1
      local ref_rows
      ref_rows=$(db_query "SELECT ref_kind, ref_value, label FROM message_references WHERE message_id = '$t_id' ORDER BY ordinal;")
      while IFS= read -r rr; do
        [[ -z "$rr" ]] && continue
        local r_kind r_value r_label
        IFS='|' read -r r_kind r_value r_label <<< "$rr"
        local srv="${r_value//\\/\\\\}"; srv="${srv//\"/\\\"}"
        local ref_i="{\"kind\":\"$r_kind\",\"value\":\"$srv\"}"
        [[ $first_ref -eq 1 ]] && { refs_json+="$ref_i"; first_ref=0; } || refs_json+=",$ref_i"
      done <<< "$ref_rows"
      refs_json+="]"
      item+=",\"references\":$refs_json"
    else
      local bp="${t_body:0:80}"
      local safe_bp="${bp//\\/\\\\}"; safe_bp="${safe_bp//\"/\\\"}"
      safe_bp="${safe_bp//$'\n'/ }"
      item+=",\"body_preview\":\"$safe_bp\""
    fi

    item+="}"
    [[ $first -eq 1 ]] && { items+="$item"; first=0; } || items+=",$item"
  done

  items+="]"

  local truncated="false"
  [[ "$total_visible_count" -gt "$limit" ]] && truncated="true"

  local result
  result=$(success_json "\"conversation_id\":\"$cnv_id\",\"items\":$items,\"limit\":$limit,\"returned_count\":$count,\"truncated\":$truncated,\"total_visible_count\":$total_visible_count")

  format_output "$result" format_thread_items
}

# ============================================================================
# cmd_directory_list — List addresses in directory.
# ============================================================================
cmd_directory_list() {
  local include_inactive=0 include_unlisted=0 kind_filter=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --include-inactive) include_inactive=1; shift ;;
      --include-unlisted) include_unlisted=1; shift ;;
      --kind)             require_flag_value "$1" "$#" || exit $?; kind_filter="$2"; shift 2 ;;
      *) format_error "invalid_argument" "unknown flag: $1" || exit $? ;;
    esac
  done

  # Validate actor is active
  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?; [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"; exit $rc
  }

  # Validate --kind against allowed enum values
  if [[ -n "$kind_filter" ]]; then
    case "$kind_filter" in
      agent|human|service|list) ;; # valid
      *) format_error "invalid_argument" "invalid kind: $kind_filter" "kind" || exit $? ;;
    esac
  fi

  local where_clauses="1=1"
  [[ "$include_inactive" -eq 0 ]] && where_clauses="$where_clauses AND is_active = 1"
  [[ "$include_unlisted" -eq 0 ]] && where_clauses="$where_clauses AND is_listed = 1"
  [[ -n "$kind_filter" ]] && where_clauses="$where_clauses AND kind = '$kind_filter'"

  local rows
  rows=$(db_query "SELECT local_part, host, kind, display_name, description, is_active, is_listed, classification
    FROM addresses
    WHERE $where_clauses
    ORDER BY local_part || '@' || host ASC;")

  local items="["
  local first=1
  local count=0

  while IFS= read -r row; do
    [[ -z "$row" ]] && continue
    count=$((count + 1))

    local lp host kind dn desc is_active is_listed classification
    IFS='|' read -r lp host kind dn desc is_active is_listed classification <<< "$row"

    local addr="${lp}@${host}"
    local dn_json="null"; [[ -n "$dn" ]] && dn_json="\"$(json_escape "$dn")\""
    local desc_json="null"; [[ -n "$desc" ]] && desc_json="\"$(json_escape "$desc")\""
    local class_json="null"; [[ -n "$classification" ]] && class_json="\"$(json_escape "$classification")\""

    local item="{\"address\":\"$addr\",\"kind\":\"$kind\",\"display_name\":$dn_json,\"description\":$desc_json,\"is_active\":$([ "$is_active" = "1" ] && echo "true" || echo "false"),\"is_listed\":$([ "$is_listed" = "1" ] && echo "true" || echo "false"),\"classification\":$class_json}"

    [[ $first -eq 1 ]] && { items+="$item"; first=0; } || items+=",$item"
  done <<< "$rows"

  items+="]"

  local result
  result=$(success_json "\"items\":$items,\"returned_count\":$count")

  format_output "$result" format_directory_list
}

# ============================================================================
# cmd_directory_show — Show one address by direct lookup.
# ============================================================================
cmd_directory_show() {
  local address=""
  [[ $# -gt 0 && "$1" != --* ]] && { address="$1"; shift; }

  if [[ -z "$address" ]]; then
    format_error "invalid_argument" "address argument is required" || exit $?
  fi

  # Validate actor is active
  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?; [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"; exit $rc
  }

  if [[ "$address" != *@* ]]; then
    format_error "invalid_argument" "invalid address format: missing @" "address" || exit $?
  fi

  local local_part="${address%%@*}"
  local host="${address#*@}"

  local safe_local_part safe_host
  safe_local_part="$(sql_escape "$local_part")"
  safe_host="$(sql_escape "$host")"

  local row
  row=$(db_query "SELECT local_part, host, kind, display_name, description, is_active, is_listed, classification
    FROM addresses WHERE local_part = '$safe_local_part' AND host = '$safe_host';")

  if [[ -z "$row" ]]; then
    format_error "not_found" "address not found: $address" "address" || exit $?
  fi

  local lp a_host kind dn desc is_active is_listed classification
  IFS='|' read -r lp a_host kind dn desc is_active is_listed classification <<< "$row"

  local addr="${lp}@${a_host}"
  local dn_json="null"; [[ -n "$dn" ]] && dn_json="\"$(json_escape "$dn")\""
  local desc_json="null"; [[ -n "$desc" ]] && desc_json="\"$(json_escape "$desc")\""
  local class_json="null"; [[ -n "$classification" ]] && class_json="\"$(json_escape "$classification")\""

  local result
  result=$(success_json "\"address\":{\"address\":\"$addr\",\"kind\":\"$kind\",\"display_name\":$dn_json,\"description\":$desc_json,\"is_active\":$([ "$is_active" = "1" ] && echo "true" || echo "false"),\"is_listed\":$([ "$is_listed" = "1" ] && echo "true" || echo "false"),\"classification\":$class_json}")

  format_output "$result" format_directory_show
}

# ============================================================================
# cmd_directory_members — List group members.
# ============================================================================
cmd_directory_members() {
  local address=""
  [[ $# -gt 0 && "$1" != --* ]] && { address="$1"; shift; }

  if [[ -z "$address" ]]; then
    format_error "invalid_argument" "list address argument is required" || exit $?
  fi

  # Validate actor is active
  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?; [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"; exit $rc
  }

  if [[ "$address" != *@* ]]; then
    format_error "invalid_argument" "invalid address format: missing @" "address" || exit $?
  fi

  local local_part="${address%%@*}"
  local host="${address#*@}"

  local safe_local_part safe_host
  safe_local_part="$(sql_escape "$local_part")"
  safe_host="$(sql_escape "$host")"

  local addr_row
  addr_row=$(db_query "SELECT id, kind FROM addresses WHERE local_part = '$safe_local_part' AND host = '$safe_host';")

  if [[ -z "$addr_row" ]]; then
    format_error "not_found" "address not found: $address" "address" || exit $?
  fi

  local addr_id addr_kind
  IFS='|' read -r addr_id addr_kind <<< "$addr_row"

  if [[ "$addr_kind" != "list" ]]; then
    format_error "invalid_argument" "address is not a list: $address" "address" || exit $?
  fi

  # Get members in ordinal order
  local members_json="["
  local first=1

  local member_rows
  member_rows=$(db_query "SELECT a.local_part, a.host
    FROM group_members gm
    JOIN addresses a ON a.id = gm.member_address_id
    WHERE gm.group_address_id = '$addr_id'
    ORDER BY gm.ordinal ASC, gm.member_address_id ASC;")

  while IFS= read -r mr; do
    [[ -z "$mr" ]] && continue
    local m_lp m_host
    IFS='|' read -r m_lp m_host <<< "$mr"
    local member_addr="${m_lp}@${m_host}"
    [[ $first -eq 1 ]] && { members_json+="\"$member_addr\""; first=0; } || members_json+=",\"$member_addr\""
  done <<< "$member_rows"

  members_json+="]"

  local result
  result=$(success_json "\"group\":\"$address\",\"members\":$members_json")

  format_output "$result" format_directory_members
}

# ============================================================================
# cmd_give_feedback — Submit feature feedback (stub for MVP).
# ============================================================================
cmd_give_feedback() {
  local feature="" kind="" wanted="" body_flag="" body_file=""
  local body_flag_set=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --feature) require_flag_value "$1" "$#" || exit $?; feature="$2"; shift 2 ;;
      --kind)    require_flag_value "$1" "$#" || exit $?; kind="$2"; shift 2 ;;
      --wanted)  require_flag_value "$1" "$#" || exit $?; wanted="$2"; body_flag_set=1; shift 2 ;;
      --wanted-file) require_flag_value "$1" "$#" || exit $?; body_file="$2"; shift 2 ;;
      *) format_error "invalid_argument" "unknown flag: $1" || exit $? ;;
    esac
  done

  if [[ -z "$feature" ]]; then
    format_error "invalid_argument" "--feature is required" || exit $?
  fi
  if [[ -z "$kind" ]]; then
    format_error "invalid_argument" "--kind is required" || exit $?
  fi

  case "$kind" in
    verb|noun|flag|workflow) ;;
    *) format_error "invalid_argument" "invalid feedback kind: $kind (must be verb|noun|flag|workflow)" || exit $? ;;
  esac

  # Validate actor is active
  local actor_id
  actor_id=$(resolve_actor_id) || {
    local rc=$?; [[ "$INBOX_JSON_MODE" == "1" ]] && echo "$actor_id"; exit $rc
  }

  # Parse body (wanted text) — only count stdin when it's actually a pipe/redirect
  local stdin_is_pipe=0
  if [[ ! -t 0 ]] && [[ -p /dev/stdin || -f /dev/stdin ]]; then
    stdin_is_pipe=1
  fi

  PARSED_BODY=""
  parse_body_source "$wanted" "$body_file" "$stdin_is_pipe" "$body_flag_set" || exit $?
  local feedback_body="$PARSED_BODY"

  # Generate feedback ID
  local feedback_id
  feedback_id=$(generate_id "fbk_")

  # For MVP, feedback is a stub — just record success
  # Future: write to NDJSON log + OTEL
  local result
  result=$(success_json "\"feedback_id\":\"$feedback_id\",\"feature\":\"$feature\",\"recorded\":true")

  format_output "$result" format_mutation_result
}
