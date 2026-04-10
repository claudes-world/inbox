#!/usr/bin/env bash
# lib/format.sh — Output formatting: JSON/text switching, error envelopes, list/message display.

# Global state: set by CLI harness based on --json flag
INBOX_JSON_MODE="${INBOX_JSON_MODE:-0}"

# format_output — Choose JSON or text output based on --json flag.
# Usage: format_output "$json_data" text_formatter_func [args...]
# In JSON mode: emit json_data to stdout, stderr silent.
# In text mode: call text_formatter_func with json_data and any extra args.
format_output() {
  local json_data="$1"
  shift

  if [[ "$INBOX_JSON_MODE" == "1" ]]; then
    echo "$json_data"
  else
    if [[ $# -gt 0 ]]; then
      local formatter="$1"
      shift
      "$formatter" "$json_data" "$@"
    else
      echo "$json_data"
    fi
  fi
}

# format_error — Output error envelope and exit with correct code.
# Usage: format_error <code> <message> [target]
# Maps error code string to exit code integer.
format_error() {
  local code="$1"
  local message="$2"
  local target="${3:-}"

  local exit_code
  case "$code" in
    invalid_argument)  exit_code="$EXIT_INVALID_ARGUMENT" ;;
    not_found)         exit_code="$EXIT_NOT_FOUND" ;;
    invalid_state)     exit_code="$EXIT_INVALID_STATE" ;;
    permission_denied) exit_code="$EXIT_PERMISSION_DENIED" ;;
    internal_error)    exit_code="$EXIT_INTERNAL_ERROR" ;;
    coming_soon)       exit_code="$EXIT_COMING_SOON" ;;
    *)                 exit_code="$EXIT_INTERNAL_ERROR" ;;
  esac

  if [[ "$INBOX_JSON_MODE" == "1" ]]; then
    error_json "$code" "$message" "$target"
  else
    if [[ -n "$target" ]]; then
      echo "error: $message ($target)" >&2
    else
      echo "error: $message" >&2
    fi
  fi

  return "$exit_code"
}

# format_list_items — Table-formatted list output for inbox list.
# Usage: format_list_items "$json_data"
format_list_items() {
  local json_data="$1"

  local count
  count=$(sqlite3 :memory: "SELECT json_array_length(json_extract('$(echo "$json_data" | sed "s/'/''/g")', '\$.items'));")

  if [[ "$count" -eq 0 ]]; then
    echo "(no messages)"
    return 0
  fi

  local i=0
  while [[ $i -lt $count ]]; do
    local escaped_json
    escaped_json=$(echo "$json_data" | sed "s/'/''/g")
    local state sender subject ts msg_id
    state=$(sqlite3 :memory: "SELECT UPPER(COALESCE(json_extract('$escaped_json', '\$.items[$i].engagement_state'), json_extract('$escaped_json', '\$.items[$i].visibility_state')));")
    msg_id=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.items[$i].message_id');")
    sender=$(sqlite3 :memory: "SELECT COALESCE(json_extract('$escaped_json', '\$.items[$i].sender'), '');")
    subject=$(sqlite3 :memory: "SELECT COALESCE(json_extract('$escaped_json', '\$.items[$i].subject'), '');")
    ts=$(sqlite3 :memory: "SELECT COALESCE(json_extract('$escaped_json', '\$.items[$i].delivered_at_ms'), json_extract('$escaped_json', '\$.items[$i].created_at_ms'));")

    local age
    age=$(_format_age "$ts")

    # Truncate subject if too long
    if [[ ${#subject} -gt 40 ]]; then
      subject="${subject:0:37}..."
    fi

    printf "%-12s  %-20s  %-20s  \"%s\"  %s\n" "$state" "$msg_id" "$sender" "$subject" "$age"
    i=$((i + 1))
  done
}

# format_sent_list_items — Table-formatted list output for sent list.
# Usage: format_sent_list_items "$json_data"
format_sent_list_items() {
  local json_data="$1"

  local count
  count=$(sqlite3 :memory: "SELECT json_array_length(json_extract('$(echo "$json_data" | sed "s/'/''/g")', '\$.items'));")

  if [[ "$count" -eq 0 ]]; then
    echo "(no sent messages)"
    return 0
  fi

  local i=0
  while [[ $i -lt $count ]]; do
    local escaped_json
    escaped_json=$(echo "$json_data" | sed "s/'/''/g")
    local vis subject ts msg_id
    vis=$(sqlite3 :memory: "SELECT UPPER(json_extract('$escaped_json', '\$.items[$i].visibility_state'));")
    msg_id=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.items[$i].message_id');")
    subject=$(sqlite3 :memory: "SELECT COALESCE(json_extract('$escaped_json', '\$.items[$i].subject'), '');")
    ts=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.items[$i].created_at_ms');")

    local age
    age=$(_format_age "$ts")

    if [[ ${#subject} -gt 40 ]]; then
      subject="${subject:0:37}..."
    fi

    printf "%-8s  %-20s  \"%s\"  %s\n" "$vis" "$msg_id" "$subject" "$age"
    i=$((i + 1))
  done
}

# format_message — Display a single message (for read commands).
# Usage: format_message "$json_data"
format_message() {
  local json_data="$1"
  local escaped_json
  escaped_json=$(echo "$json_data" | sed "s/'/''/g")

  local msg_id sender subject body view_kind
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.message.message_id');")
  sender=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.message.sender');")
  subject=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.message.subject');")
  body=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.message.body');")
  view_kind=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.state.view_kind');")

  echo "Message: $msg_id"
  echo "From:    $sender"
  if [[ -n "$subject" ]]; then
    echo "Subject: $subject"
  fi
  echo "View:    $view_kind"
  echo "---"
  echo "$body"
}

# format_thread_items — Display thread items.
# Usage: format_thread_items "$json_data"
format_thread_items() {
  local json_data="$1"
  local escaped_json
  escaped_json=$(echo "$json_data" | sed "s/'/''/g")

  local count
  count=$(sqlite3 :memory: "SELECT json_array_length(json_extract('$escaped_json', '\$.items'));")

  if [[ "$count" -eq 0 ]]; then
    echo "(empty thread)"
    return 0
  fi

  local cnv_id
  cnv_id=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.conversation_id');")
  echo "Thread: $cnv_id"
  echo ""

  local i=0
  while [[ $i -lt $count ]]; do
    local sender subject ts view_kind msg_id
    msg_id=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.items[$i].message_id');")
    sender=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.items[$i].sender');")
    subject=$(sqlite3 :memory: "SELECT COALESCE(json_extract('$escaped_json', '\$.items[$i].subject'), '');")
    ts=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.items[$i].created_at_ms');")
    view_kind=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.items[$i].view_kind');")

    local age
    age=$(_format_age "$ts")

    printf "[%s] %s  %s  \"%s\"  %s\n" "$view_kind" "$msg_id" "$sender" "$subject" "$age"
    i=$((i + 1))
  done
}

# format_whoami — Display whoami output in text mode.
# Usage: format_whoami "$json_data"
format_whoami() {
  local json_data="$1"
  local escaped_json
  escaped_json=$(echo "$json_data" | sed "s/'/''/g")

  local address kind display_name is_active db_path
  address=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.address');")
  kind=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.kind');")
  display_name=$(sqlite3 :memory: "SELECT COALESCE(json_extract('$escaped_json', '\$.display_name'), '');")
  is_active=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.is_active');")
  db_path=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.db_path');")

  echo "Address:      $address"
  echo "Kind:         $kind"
  if [[ -n "$display_name" ]]; then
    echo "Display Name: $display_name"
  fi
  echo "Active:       $([ "$is_active" = "1" ] && echo "yes" || echo "no")"
  echo "Database:     $db_path"
}

# format_send_result — Display send/reply result in text mode.
# Usage: format_send_result "$json_data"
format_send_result() {
  local json_data="$1"
  local escaped_json
  escaped_json=$(echo "$json_data" | sed "s/'/''/g")

  local msg_id cnv_id resolved_count
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.message_id');")
  cnv_id=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.conversation_id');")
  resolved_count=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.resolved_recipient_count');")

  echo "Sent: $msg_id"
  echo "Thread: $cnv_id"
  echo "Recipients: $resolved_count"
}

# format_mutation_result — Display ack/hide/unhide result in text mode.
# Usage: format_mutation_result "$json_data"
format_mutation_result() {
  local json_data="$1"
  local escaped_json
  escaped_json=$(echo "$json_data" | sed "s/'/''/g")

  local msg_id changed
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.message_id');")
  changed=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.changed');")

  if [[ "$changed" == "1" ]]; then
    echo "OK: $msg_id (changed)"
  else
    echo "OK: $msg_id (no change)"
  fi
}

# format_directory_list — Display directory list in text mode.
# Usage: format_directory_list "$json_data"
format_directory_list() {
  local json_data="$1"
  local escaped_json
  escaped_json=$(echo "$json_data" | sed "s/'/''/g")

  local count
  count=$(sqlite3 :memory: "SELECT json_array_length(json_extract('$escaped_json', '\$.items'));")

  if [[ "$count" -eq 0 ]]; then
    echo "(no addresses found)"
    return 0
  fi

  local i=0
  while [[ $i -lt $count ]]; do
    local addr kind display_name is_active
    addr=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.items[$i].address');")
    kind=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.items[$i].kind');")
    display_name=$(sqlite3 :memory: "SELECT COALESCE(json_extract('$escaped_json', '\$.items[$i].display_name'), '');")
    is_active=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.items[$i].is_active');")

    local status=""
    [[ "$is_active" != "1" ]] && status=" (inactive)"

    printf "%-6s  %-25s  %s%s\n" "$kind" "$addr" "$display_name" "$status"
    i=$((i + 1))
  done
}

# format_directory_show — Display directory show in text mode.
# Usage: format_directory_show "$json_data"
format_directory_show() {
  local json_data="$1"
  local escaped_json
  escaped_json=$(echo "$json_data" | sed "s/'/''/g")

  local addr kind display_name description is_active is_listed
  addr=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.address.address');")
  kind=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.address.kind');")
  display_name=$(sqlite3 :memory: "SELECT COALESCE(json_extract('$escaped_json', '\$.address.display_name'), '');")
  description=$(sqlite3 :memory: "SELECT COALESCE(json_extract('$escaped_json', '\$.address.description'), '');")
  is_active=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.address.is_active');")
  is_listed=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.address.is_listed');")

  echo "Address:      $addr"
  echo "Kind:         $kind"
  [[ -n "$display_name" ]] && echo "Display Name: $display_name"
  [[ -n "$description" ]] && echo "Description:  $description"
  echo "Active:       $([ "$is_active" = "1" ] && echo "yes" || echo "no")"
  echo "Listed:       $([ "$is_listed" = "1" ] && echo "yes" || echo "no")"
}

# format_directory_members — Display directory members in text mode.
# Usage: format_directory_members "$json_data"
format_directory_members() {
  local json_data="$1"
  local escaped_json
  escaped_json=$(echo "$json_data" | sed "s/'/''/g")

  local group
  group=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.group');")
  echo "List: $group"
  echo "Members:"

  local count
  count=$(sqlite3 :memory: "SELECT json_array_length(json_extract('$escaped_json', '\$.members'));")

  local i=0
  while [[ $i -lt $count ]]; do
    local member
    member=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '\$.members[$i]');")
    echo "  - $member"
    i=$((i + 1))
  done
}

# --- Internal helpers ---

# _format_age — Convert ms timestamp to human-readable relative time.
_format_age() {
  local ts_ms="${1:-0}"
  local now_ms_val
  now_ms_val=$(now_ms)
  local diff_ms=$((now_ms_val - ts_ms))
  local diff_s=$((diff_ms / 1000))

  if [[ $diff_s -lt 60 ]]; then
    echo "${diff_s}s ago"
  elif [[ $diff_s -lt 3600 ]]; then
    echo "$((diff_s / 60))m ago"
  elif [[ $diff_s -lt 86400 ]]; then
    echo "$((diff_s / 3600))h ago"
  else
    echo "$((diff_s / 86400))d ago"
  fi
}
