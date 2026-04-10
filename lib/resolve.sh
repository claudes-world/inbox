#!/usr/bin/env bash
# lib/resolve.sh — Resolution engine: actor, inbox, sent, thread, list, reply-all resolvers.
# This is THE shared resolver — send, reply, read, thread ALL call through it.

# resolve_actor — Parse INBOX_ADDRESS as "local_part@host", look up in addresses table.
# Returns pipe-delimited: id|local_part|host|kind|display_name|is_active|is_listed|classification
# Errors: permission_denied (inactive), not_found (unknown — conflated with inaccessible)
resolve_actor() {
  local address="${1:-${INBOX_ADDRESS:-}}"
  if [[ -z "$address" ]]; then
    error_json "invalid_argument" "INBOX_ADDRESS is not set"
    return "$EXIT_INVALID_ARGUMENT"
  fi

  # Parse local_part@host
  local local_part host
  if [[ "$address" != *@* ]]; then
    error_json "invalid_argument" "invalid address format: missing @" "address"
    return "$EXIT_INVALID_ARGUMENT"
  fi
  local_part="${address%%@*}"
  host="${address#*@}"

  if [[ -z "$local_part" || -z "$host" ]]; then
    error_json "invalid_argument" "invalid address format: empty local_part or host" "address"
    return "$EXIT_INVALID_ARGUMENT"
  fi

  # Escape for SQL safety
  local escaped_local escaped_host
  escaped_local=$(sql_escape "$local_part")
  escaped_host=$(sql_escape "$host")

  # Look up in addresses table
  local row
  row=$(db_query "SELECT id, local_part, host, kind, display_name, is_active, is_listed, classification
    FROM addresses WHERE local_part = '$escaped_local' AND host = '$escaped_host';")

  if [[ -z "$row" ]]; then
    # Conflation: don't distinguish nonexistent from inaccessible
    error_json "not_found" "address not found" "address"
    return "$EXIT_NOT_FOUND"
  fi

  # Parse fields
  local addr_id addr_kind addr_active
  addr_id=$(echo "$row" | cut -d'|' -f1)
  addr_kind=$(echo "$row" | cut -d'|' -f4)
  addr_active=$(echo "$row" | cut -d'|' -f6)

  # Check is_active
  if [[ "$addr_active" != "1" ]]; then
    error_json "permission_denied" "acting address is inactive" "address"
    return "$EXIT_PERMISSION_DENIED"
  fi

  # Return the full row (pipe-delimited)
  echo "$row"
  return 0
}

# resolve_actor_id — Convenience: resolve actor and return just the address ID.
resolve_actor_id() {
  local row
  row=$(resolve_actor "$@") || return $?
  echo "$row" | cut -d'|' -f1
}

# resolve_inbox — Find delivery for message+recipient.
# Args: msg_id, actor_addr_id
# Returns pipe-delimited delivery row: id|message_id|recipient_address_id|effective_role|engagement_state|visibility_state|delivered_at_ms
# Error: not_found (conflation: don't leak existence)
resolve_inbox() {
  local msg_id="$1"
  local actor_addr_id="$2"

  local row
  row=$(db_query "SELECT id, message_id, recipient_address_id, effective_role,
    engagement_state, visibility_state, delivered_at_ms
    FROM deliveries
    WHERE message_id = '$msg_id' AND recipient_address_id = '$actor_addr_id';")

  if [[ -z "$row" ]]; then
    error_json "not_found" "message not found" "message_id"
    return "$EXIT_NOT_FOUND"
  fi

  echo "$row"
  return 0
}

# resolve_sent — Find sent_item for message where sender matches.
# Args: msg_id, actor_addr_id
# Returns pipe-delimited: message_id|visibility_state|hidden_at_ms
# Error: not_found
resolve_sent() {
  local msg_id="$1"
  local actor_addr_id="$2"

  local row
  row=$(db_query "SELECT si.message_id, si.visibility_state, si.hidden_at_ms
    FROM sent_items si
    JOIN messages m ON m.id = si.message_id
    WHERE si.message_id = '$msg_id' AND m.sender_address_id = '$actor_addr_id';")

  if [[ -z "$row" ]]; then
    error_json "not_found" "message not found" "message_id"
    return "$EXIT_NOT_FOUND"
  fi

  echo "$row"
  return 0
}

# resolve_reply — Try delivery first, fall back to sent_item.
# Args: msg_id, actor_addr_id
# Returns: "delivery|<delivery_row>" or "sent|<sent_row>"
# Error: not_found on miss (conflation)
resolve_reply() {
  local msg_id="$1"
  local actor_addr_id="$2"

  # Try delivery first
  local dly_row
  dly_row=$(resolve_inbox "$msg_id" "$actor_addr_id" 2>/dev/null) && {
    echo "delivery|$dly_row"
    return 0
  }

  # Fall back to sent_item
  local sent_row
  sent_row=$(resolve_sent "$msg_id" "$actor_addr_id" 2>/dev/null) && {
    echo "sent|$sent_row"
    return 0
  }

  error_json "not_found" "message not found" "message_id"
  return "$EXIT_NOT_FOUND"
}

# resolve_thread_visibility — Return messages where actor has delivery OR actor is sender+has sent_item.
# Args: conversation_id, actor_addr_id
# Returns newline-delimited message IDs in created_at_ms ASC order.
# Self-send: if both delivery and sent_item exist for same message, include once.
# Parent redaction: set parent_message_id to null when parent not in visibility set.
resolve_thread_visibility() {
  local conversation_id="$1"
  local actor_addr_id="$2"

  # Union of:
  # 1. Messages where actor has a delivery
  # 2. Messages where actor is sender and has a sent_item
  # UNION removes duplicates (self-send case)
  db_query "SELECT m.id, m.conversation_id,
      CASE
        WHEN m.parent_message_id IS NULL THEN NULL
        WHEN EXISTS (
          SELECT 1 FROM deliveries d2
          WHERE d2.message_id = m.parent_message_id
            AND d2.recipient_address_id = '$actor_addr_id'
          UNION
          SELECT 1 FROM sent_items s2
          JOIN messages m2 ON s2.message_id = m2.id
          WHERE m2.id = m.parent_message_id
            AND m2.sender_address_id = '$actor_addr_id'
        ) THEN m.parent_message_id
        ELSE NULL
      END as parent_message_id,
      m.sender_address_id,
      m.subject, m.body, m.sender_urgency, m.created_at_ms,
      COALESCE(d.id, '') as delivery_id,
      COALESCE(d.effective_role, '') as effective_role,
      COALESCE(d.engagement_state, '') as engagement_state,
      COALESCE(d.visibility_state, '') as d_visibility_state,
      COALESCE(d.delivered_at_ms, 0) as delivered_at_ms,
      CASE WHEN d.id IS NOT NULL THEN 'received' ELSE 'sent' END as view_kind,
      COALESCE(si.visibility_state, '') as s_visibility_state
    FROM messages m
    LEFT JOIN deliveries d ON d.message_id = m.id AND d.recipient_address_id = '$actor_addr_id'
    LEFT JOIN sent_items si ON si.message_id = m.id AND m.sender_address_id = '$actor_addr_id'
    WHERE m.conversation_id = '$conversation_id'
      AND (d.id IS NOT NULL OR si.message_id IS NOT NULL)
    ORDER BY m.created_at_ms ASC, m.id ASC"
}

# resolve_thread_msg_ids — Return just the visible message IDs for a conversation+actor.
# Used for parent redaction checks.
resolve_thread_msg_ids() {
  local conversation_id="$1"
  local actor_addr_id="$2"

  db_query "SELECT DISTINCT m.id
    FROM messages m
    LEFT JOIN deliveries d ON d.message_id = m.id AND d.recipient_address_id = '$actor_addr_id'
    LEFT JOIN sent_items si ON si.message_id = m.id AND m.sender_address_id = '$actor_addr_id'
    WHERE m.conversation_id = '$conversation_id'
      AND (d.id IS NOT NULL OR si.message_id IS NOT NULL)"
}

# validate_direct_recipient — Look up address, check exists+active.
# Args: address_string (local_part@host)
# Returns pipe-delimited address row on success.
# Unknown → invalid_argument, inactive → invalid_state
validate_direct_recipient() {
  local address="$1"

  local local_part host
  local_part="${address%%@*}"
  host="${address#*@}"

  # Escape for SQL safety
  local escaped_local escaped_host
  escaped_local=$(sql_escape "$local_part")
  escaped_host=$(sql_escape "$host")

  local row
  row=$(db_query "SELECT id, local_part, host, kind, is_active
    FROM addresses WHERE local_part = '$escaped_local' AND host = '$escaped_host';")

  if [[ -z "$row" ]]; then
    error_json "invalid_argument" "unknown recipient address: $address" "recipient"
    return "$EXIT_INVALID_ARGUMENT"
  fi

  local is_active
  is_active=$(echo "$row" | cut -d'|' -f5)

  if [[ "$is_active" != "1" ]]; then
    error_json "invalid_state" "recipient address is inactive: $address" "recipient"
    return "$EXIT_INVALID_STATE"
  fi

  echo "$row"
  return 0
}

# validate_direct_recipient_by_id — Same as validate_direct_recipient but takes an address ID.
# Args: address_id
# Returns pipe-delimited address row on success.
validate_direct_recipient_by_id() {
  local addr_id="$1"

  local row
  row=$(db_query "SELECT id, local_part, host, kind, is_active
    FROM addresses WHERE id = '$addr_id';")

  if [[ -z "$row" ]]; then
    error_json "invalid_argument" "unknown recipient address" "recipient"
    return "$EXIT_INVALID_ARGUMENT"
  fi

  local is_active
  is_active=$(echo "$row" | cut -d'|' -f5)

  if [[ "$is_active" != "1" ]]; then
    error_json "invalid_state" "recipient address is inactive" "recipient"
    return "$EXIT_INVALID_STATE"
  fi

  echo "$row"
  return 0
}

# expand_list — Return active members in ordinal order, skip inactive.
# Args: list_addr_id
# Returns newline-delimited: member_address_id|ordinal
expand_list() {
  local list_addr_id="$1"

  db_query "SELECT gm.member_address_id, gm.ordinal
    FROM group_members gm
    JOIN addresses a ON a.id = gm.member_address_id
    WHERE gm.group_address_id = '$list_addr_id'
      AND a.is_active = 1
    ORDER BY gm.ordinal ASC, gm.member_address_id ASC"
}

# construct_reply_all_audience — Build reply-all recipient list.
# Args: original_msg_id, actor_addr_id, explicit_to (comma-sep addr IDs), explicit_cc (comma-sep addr IDs)
# Uses original public logical To/Cc headers from message_public_recipients (NOT expanded deliveries)
# Appends original sender as implicit 'to' if not already present
# Appends explicit --to/--cc additions
# Removes acting address from audience
# Returns: to_list and cc_list as two lines: "to:id1,id2,..." and "cc:id1,id2,..."
construct_reply_all_audience() {
  local original_msg_id="$1"
  local actor_addr_id="$2"
  local explicit_to="${3:-}"
  local explicit_cc="${4:-}"

  # Get original sender
  local original_sender
  original_sender=$(db_query "SELECT sender_address_id FROM messages WHERE id = '$original_msg_id';")
  if [[ -z "$original_sender" ]]; then
    error_json "not_found" "original message not found" "message_id"
    return "$EXIT_NOT_FOUND"
  fi

  # Get original public recipients in ordinal order
  local to_ids="" cc_ids=""

  # Original To headers
  local orig_to
  orig_to=$(db_query "SELECT recipient_address_id FROM message_public_recipients
    WHERE message_id = '$original_msg_id' AND recipient_role = 'to'
    ORDER BY ordinal ASC;")

  while IFS= read -r addr_id; do
    [[ -z "$addr_id" ]] && continue
    [[ "$addr_id" == "$actor_addr_id" ]] && continue
    if [[ -z "$to_ids" ]]; then
      to_ids="$addr_id"
    else
      to_ids="$to_ids,$addr_id"
    fi
  done <<< "$orig_to"

  # Original Cc headers
  local orig_cc
  orig_cc=$(db_query "SELECT recipient_address_id FROM message_public_recipients
    WHERE message_id = '$original_msg_id' AND recipient_role = 'cc'
    ORDER BY ordinal ASC;")

  while IFS= read -r addr_id; do
    [[ -z "$addr_id" ]] && continue
    [[ "$addr_id" == "$actor_addr_id" ]] && continue
    if [[ -z "$cc_ids" ]]; then
      cc_ids="$addr_id"
    else
      cc_ids="$cc_ids,$addr_id"
    fi
  done <<< "$orig_cc"

  # Append original sender as implicit 'to' if not already present and not actor
  if [[ "$original_sender" != "$actor_addr_id" ]]; then
    local sender_in_to=0
    local IFS=','
    for id in $to_ids; do
      [[ "$id" == "$original_sender" ]] && sender_in_to=1
    done
    unset IFS
    if [[ $sender_in_to -eq 0 ]]; then
      # Also check cc
      local sender_in_cc=0
      IFS=','
      for id in $cc_ids; do
        [[ "$id" == "$original_sender" ]] && sender_in_cc=1
      done
      unset IFS
      if [[ $sender_in_cc -eq 0 ]]; then
        if [[ -z "$to_ids" ]]; then
          to_ids="$original_sender"
        else
          to_ids="$to_ids,$original_sender"
        fi
      fi
    fi
  fi

  # Append explicit --to additions (excluding actor)
  if [[ -n "$explicit_to" ]]; then
    local IFS=','
    for addr_id in $explicit_to; do
      [[ -z "$addr_id" ]] && continue
      [[ "$addr_id" == "$actor_addr_id" ]] && continue
      if [[ -z "$to_ids" ]]; then
        to_ids="$addr_id"
      else
        to_ids="$to_ids,$addr_id"
      fi
    done
    unset IFS
  fi

  # Append explicit --cc additions (excluding actor)
  if [[ -n "$explicit_cc" ]]; then
    local IFS=','
    for addr_id in $explicit_cc; do
      [[ -z "$addr_id" ]] && continue
      [[ "$addr_id" == "$actor_addr_id" ]] && continue
      if [[ -z "$cc_ids" ]]; then
        cc_ids="$addr_id"
      else
        cc_ids="$cc_ids,$addr_id"
      fi
    done
    unset IFS
  fi

  # Final pass: expand list addresses and remove actor from both the flat list
  # and any individual members resolved from list expansion.
  # Guards against the actor slipping in via the explicit addition paths or
  # appearing as a member of a list address that was a public recipient.
  local filtered_to="" filtered_cc=""
  local IFS=','
  for addr_id in $to_ids; do
    [[ -z "$addr_id" || "$addr_id" == "$actor_addr_id" ]] && continue
    if is_list_address "$addr_id"; then
      # Expand the list and add individual members (minus actor)
      local _members _ml _member_id
      _members=$(expand_list "$addr_id")
      while IFS= read -r _ml; do
        [[ -z "$_ml" ]] && continue
        _member_id=$(echo "$_ml" | cut -d'|' -f1)
        [[ "$_member_id" == "$actor_addr_id" ]] && continue
        filtered_to="${filtered_to:+$filtered_to,}$_member_id"
      done <<< "$_members"
    else
      filtered_to="${filtered_to:+$filtered_to,}$addr_id"
    fi
  done
  for addr_id in $cc_ids; do
    [[ -z "$addr_id" || "$addr_id" == "$actor_addr_id" ]] && continue
    if is_list_address "$addr_id"; then
      local _members _ml _member_id
      _members=$(expand_list "$addr_id")
      while IFS= read -r _ml; do
        [[ -z "$_ml" ]] && continue
        _member_id=$(echo "$_ml" | cut -d'|' -f1)
        [[ "$_member_id" == "$actor_addr_id" ]] && continue
        filtered_cc="${filtered_cc:+$filtered_cc,}$_member_id"
      done <<< "$_members"
    else
      filtered_cc="${filtered_cc:+$filtered_cc,}$addr_id"
    fi
  done
  unset IFS

  echo "to:${filtered_to}"
  echo "cc:${filtered_cc}"
  return 0
}

# lookup_address_by_string — Look up an address by "local_part@host" string. Returns address ID or empty.
lookup_address_by_string() {
  local address="$1"
  local local_part="${address%%@*}"
  local host="${address#*@}"

  local escaped_local escaped_host
  escaped_local=$(sql_escape "$local_part")
  escaped_host=$(sql_escape "$host")

  db_query "SELECT id FROM addresses WHERE local_part = '$escaped_local' AND host = '$escaped_host';"
}

# lookup_address_id_to_string — Convert an address ID to "local_part@host" string.
lookup_address_id_to_string() {
  local addr_id="$1"
  local row
  row=$(db_query "SELECT local_part, host FROM addresses WHERE id = '$addr_id';")
  if [[ -n "$row" ]]; then
    local lp host
    lp=$(echo "$row" | cut -d'|' -f1)
    host=$(echo "$row" | cut -d'|' -f2)
    echo "${lp}@${host}"
  fi
}

# is_list_address — Check if an address ID is a list address. Returns 0 if true, 1 if false.
is_list_address() {
  local addr_id="$1"
  db_exists "SELECT 1 FROM addresses WHERE id = '$addr_id' AND kind = 'list' LIMIT 1"
}
