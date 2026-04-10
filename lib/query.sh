#!/usr/bin/env bash
# lib/query.sh — Query logic: list inbox, read message, sent view, thread view, directory lookups.

# query_sent_list — List messages sent by actor with sent_items.
# Args: actor_addr_id, visibility (active|hidden|any), since_ms, until_ms, limit
# Output: JSON result
query_sent_list() {
  local actor_addr_id="$1"
  local visibility="${2:-active}"
  local since_ms="${3:-}"
  local until_ms="${4:-}"
  local limit="${5:-50}"

  # Validate numeric inputs before interpolating into SQL
  if ! [[ "$limit" =~ ^[0-9]+$ ]]; then
    error_json "invalid_argument" "limit must be a non-negative integer" "limit"
    return "$EXIT_INVALID_ARGUMENT"
  fi
  if [[ -n "$since_ms" ]] && ! [[ "$since_ms" =~ ^[0-9]+$ ]]; then
    error_json "invalid_argument" "since_ms must be a non-negative integer" "since_ms"
    return "$EXIT_INVALID_ARGUMENT"
  fi
  if [[ -n "$until_ms" ]] && ! [[ "$until_ms" =~ ^[0-9]+$ ]]; then
    error_json "invalid_argument" "until_ms must be a non-negative integer" "until_ms"
    return "$EXIT_INVALID_ARGUMENT"
  fi

  # Clamp limit
  [[ "$limit" -gt 200 ]] && limit=200

  local where_clauses="m.sender_address_id = '$actor_addr_id'"

  case "$visibility" in
    active) where_clauses="$where_clauses AND si.visibility_state = 'active'" ;;
    hidden) where_clauses="$where_clauses AND si.visibility_state = 'hidden'" ;;
    any) ;; # no filter
    *) error_json "invalid_argument" "invalid visibility filter: $visibility"; return "$EXIT_INVALID_ARGUMENT" ;;
  esac

  if [[ -n "$since_ms" ]]; then
    where_clauses="$where_clauses AND m.created_at_ms >= $since_ms"
  fi
  if [[ -n "$until_ms" ]]; then
    where_clauses="$where_clauses AND m.created_at_ms < $until_ms"
  fi

  local rows
  rows=$(db_query "SELECT m.id, m.conversation_id, m.subject, m.created_at_ms,
      si.visibility_state
    FROM messages m
    JOIN sent_items si ON si.message_id = m.id
    WHERE $where_clauses
    ORDER BY m.created_at_ms DESC, m.id DESC
    LIMIT $limit;")

  local items="["
  local first=1
  local count=0

  while IFS= read -r row; do
    [[ -z "$row" ]] && continue
    count=$((count + 1))

    local m_id m_cnv m_subj m_ts s_vis
    IFS='|' read -r m_id m_cnv m_subj m_ts s_vis <<< "$row"

    local safe_subj
    safe_subj=$(json_escape "$m_subj")

    local item="{\"message_id\":\"$m_id\",\"conversation_id\":\"$m_cnv\",\"subject\":\"$safe_subj\",\"created_at_ms\":$m_ts,\"view_kind\":\"sent\",\"visibility_state\":\"$s_vis\"}"

    if [[ $first -eq 1 ]]; then
      items+="$item"
      first=0
    else
      items+=",$item"
    fi
  done <<< "$rows"

  items+="]"

  success_json "\"items\":$items,\"limit\":$limit,\"returned_count\":$count"
}

# query_sent_read — Read a specific sent message.
# Args: msg_id, actor_addr_id
# Output: JSON result with message content and sent_item state
# Hidden sent items are still directly readable by ID.
query_sent_read() {
  local msg_id="$1"
  local actor_addr_id="$2"

  # Resolve sent item
  local sent_row
  sent_row=$(resolve_sent "$msg_id" "$actor_addr_id") || return $?

  local s_vis
  s_vis=$(echo "$sent_row" | cut -d'|' -f2)

  # Get message details.
  # Use SOH ($'\x01') as column separator to avoid breakage on pipe chars in subject/body.
  local msg_row
  msg_row=$(printf '%s\n' \
    "PRAGMA foreign_keys = ON;" \
    ".separator \"$(printf '\x01')\"" \
    "SELECT id, conversation_id, parent_message_id, sender_address_id,
      subject, body, sender_urgency, created_at_ms
    FROM messages WHERE id = '$msg_id';" \
    | sqlite3 "$INBOX_DB")

  if [[ -z "$msg_row" ]]; then
    error_json "not_found" "message not found" "message_id"
    return "$EXIT_NOT_FOUND"
  fi

  local m_id m_cnv m_parent m_sender_id m_subj m_body m_urgency m_ts
  IFS=$'\x01' read -r m_id m_cnv m_parent m_sender_id m_subj m_body m_urgency m_ts <<< "$msg_row"

  local sender_str safe_sender_str
  sender_str=$(lookup_address_id_to_string "$m_sender_id")
  safe_sender_str=$(json_escape "$sender_str")

  # Get public recipients
  local pub_to_json="["
  local pub_cc_json="["
  local first_to=1 first_cc=1

  local pub_rows
  pub_rows=$(db_query "SELECT recipient_address_id, recipient_role
    FROM message_public_recipients
    WHERE message_id = '$msg_id'
    ORDER BY recipient_role, ordinal;")

  while IFS= read -r pr; do
    [[ -z "$pr" ]] && continue
    local pr_addr_id pr_role
    IFS='|' read -r pr_addr_id pr_role <<< "$pr"
    local pr_str safe_pr_str
    pr_str=$(lookup_address_id_to_string "$pr_addr_id")
    safe_pr_str=$(json_escape "$pr_str")
    if [[ "$pr_role" == "to" ]]; then
      if [[ $first_to -eq 1 ]]; then
        pub_to_json+="\"$safe_pr_str\""
        first_to=0
      else
        pub_to_json+=",\"$safe_pr_str\""
      fi
    elif [[ "$pr_role" == "cc" ]]; then
      if [[ $first_cc -eq 1 ]]; then
        pub_cc_json+="\"$safe_pr_str\""
        first_cc=0
      else
        pub_cc_json+=",\"$safe_pr_str\""
      fi
    fi
  done <<< "$pub_rows"

  pub_to_json+="]"
  pub_cc_json+="]"

  # Get references
  local refs_json="["
  local first_ref=1
  local ref_rows
  ref_rows=$(db_query "SELECT ref_kind, ref_value, label, mime_type, metadata_json
    FROM message_references WHERE message_id = '$msg_id' ORDER BY ordinal;")

  while IFS= read -r rr; do
    [[ -z "$rr" ]] && continue
    local r_kind r_value r_label r_mime r_meta
    IFS='|' read -r r_kind r_value r_label r_mime r_meta <<< "$rr"

    local safe_r_value
    safe_r_value=$(json_escape "$r_value")

    local ref_item="{\"kind\":\"$r_kind\",\"value\":\"$safe_r_value\""
    if [[ -n "$r_label" ]]; then
      local safe_r_label
      safe_r_label=$(json_escape "$r_label")
      ref_item+=",\"label\":\"$safe_r_label\""
    else
      ref_item+=",\"label\":null"
    fi
    if [[ -n "$r_mime" ]]; then
      ref_item+=",\"mime_type\":\"$r_mime\""
    else
      ref_item+=",\"mime_type\":null"
    fi
    ref_item+=",\"metadata\":${r_meta:-null}}"

    if [[ $first_ref -eq 1 ]]; then
      refs_json+="$ref_item"
      first_ref=0
    else
      refs_json+=",$ref_item"
    fi
  done <<< "$ref_rows"

  refs_json+="]"

  # Escape message fields for JSON
  local safe_subj safe_body
  safe_subj=$(json_escape "$m_subj")
  safe_body=$(json_escape "$m_body")

  local parent_json="null"
  if [[ -n "$m_parent" ]]; then
    # Check if parent is visible to actor (has delivery or sent_item)
    local safe_parent="$(sql_escape "$m_parent")"
    local safe_actor="$(sql_escape "$actor_addr_id")"
    local parent_visible
    parent_visible=$(db_query "SELECT 1 FROM deliveries WHERE message_id='$safe_parent' AND recipient_address_id='$safe_actor' UNION SELECT 1 FROM sent_items si JOIN messages m ON si.message_id=m.id WHERE m.id='$safe_parent' AND m.sender_address_id='$safe_actor' LIMIT 1")
    if [[ -n "$parent_visible" ]]; then
      parent_json="\"$m_parent\""
    fi
  fi

  success_json "\"message\":{\"message_id\":\"$m_id\",\"conversation_id\":\"$m_cnv\",\"parent_message_id\":$parent_json,\"sender\":\"$safe_sender_str\",\"subject\":\"$safe_subj\",\"body\":\"$safe_body\",\"public_to\":$pub_to_json,\"public_cc\":$pub_cc_json,\"references\":$refs_json},\"state\":{\"view_kind\":\"sent\",\"visibility_state\":\"$s_vis\"}"
}
