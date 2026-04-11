#!/usr/bin/env bash
# lib/parse.sh — CLI input parsing: body sources, refs, time filters, limits, ID validation.

# --- Body source parsing ---

# parse_body_source — Enforce exactly-one-source rule for --body, --body-file, stdin.
# Sets PARSED_BODY to the result.
# Returns 0 on success, or calls format_error and returns non-zero.
# Args: body_flag (value or empty), body_file_flag (path or empty), stdin_is_pipe (0/1)
parse_body_source() {
  local body_flag="${1:-}"
  local body_file_flag="${2:-}"
  local stdin_is_pipe="${3:-0}"
  local body_flag_set="${4:-0}"  # whether --body was explicitly passed (even if empty)

  local source_count=0
  [[ "$body_flag_set" == "1" ]] && source_count=$((source_count + 1))
  [[ -n "$body_file_flag" ]] && source_count=$((source_count + 1))
  [[ "$stdin_is_pipe" == "1" ]] && source_count=$((source_count + 1))

  if [[ $source_count -gt 1 ]]; then
    format_error "invalid_argument" "multiple body sources provided; use exactly one of --body, --body-file, or stdin"
    return $?
  fi

  if [[ "$body_flag_set" == "1" ]]; then
    PARSED_BODY="$body_flag"
  elif [[ -n "$body_file_flag" ]]; then
    if [[ ! -f "$body_file_flag" && ! -L "$body_file_flag" ]]; then
      format_error "invalid_argument" "body file not found: $body_file_flag"
      return $?
    fi
    if [[ ! -r "$body_file_flag" ]]; then
      format_error "invalid_argument" "body file not readable: $body_file_flag"
      return $?
    fi
    PARSED_BODY=$(cat "$body_file_flag")
  elif [[ "$stdin_is_pipe" == "1" ]]; then
    PARSED_BODY=$(cat)
  else
    # No body source provided — empty body is valid
    # shellcheck disable=SC2034  # read by callers
    PARSED_BODY=""
  fi

  return 0
}

# --- Reference parsing ---

# parse_ref — Parse --ref kind:value, split on first colon only.
# Sets REF_KIND and REF_VALUE.
parse_ref() {
  local ref_arg="$1"

  if [[ "$ref_arg" != *:* ]]; then
    format_error "invalid_argument" "invalid --ref format, expected kind:value" "ref"
    return $?
  fi

  REF_KIND="${ref_arg%%:*}"
  REF_VALUE="${ref_arg#*:}"

  # Validate kind
  case "$REF_KIND" in
    path|url|json|text|artifact_id|other) ;;
    *)
      format_error "invalid_argument" "invalid ref kind: $REF_KIND; must be path|url|json|text|artifact_id|other" "ref"
      return $?
      ;;
  esac

  return 0
}

# parse_ref_file — Parse --ref-file kind:path, read file contents, enforce size limit.
# Sets REF_KIND and REF_VALUE (file contents).
# Max file size: 1,048,576 bytes (1 MiB).
parse_ref_file() {
  local ref_arg="$1"
  local max_size=1048576

  if [[ "$ref_arg" != *:* ]]; then
    format_error "invalid_argument" "invalid --ref-file format, expected kind:path" "ref-file"
    return $?
  fi

  REF_KIND="${ref_arg%%:*}"
  local ref_path="${ref_arg#*:}"

  # Validate kind
  case "$REF_KIND" in
    path|url|json|text|artifact_id|other) ;;
    *)
      format_error "invalid_argument" "invalid ref kind: $REF_KIND; must be path|url|json|text|artifact_id|other" "ref-file"
      return $?
      ;;
  esac

  # Resolve path relative to CWD if not absolute
  if [[ "$ref_path" != /* ]]; then
    ref_path="$(pwd)/$ref_path"
  fi

  # Check file exists and is readable (follow symlinks)
  if [[ ! -e "$ref_path" ]]; then
    format_error "invalid_argument" "ref file not found: $ref_path" "ref-file"
    return $?
  fi
  if [[ ! -r "$ref_path" ]]; then
    format_error "invalid_argument" "ref file not readable: $ref_path" "ref-file"
    return $?
  fi

  # Check file size
  local file_size
  file_size=$(wc -c < "$ref_path")
  if [[ "$file_size" -gt "$max_size" ]]; then
    format_error "invalid_argument" "ref file exceeds 1,048,576 byte limit (${file_size} bytes)" "ref-file"
    return $?
  fi

  # shellcheck disable=SC2034  # read by callers
  REF_VALUE=$(cat "$ref_path")
  return 0
}

# --- Time filter parsing ---

# parse_time_filter — Accept ISO 8601 or Unix ms, normalize to Unix ms.
# Sets PARSED_TIME_MS to the result.
parse_time_filter() {
  local input="$1"
  local label="${2:-time}"

  if [[ -z "$input" ]]; then
    PARSED_TIME_MS=""
    return 0
  fi

  # If it looks like a pure number (Unix ms), use directly
  if [[ "$input" =~ ^[0-9]+$ ]]; then
    PARSED_TIME_MS="$input"
    return 0
  fi

  # Try ISO 8601 parsing via date command
  local epoch_s
  epoch_s=$(date -d "$input" +%s 2>/dev/null) || {
    format_error "invalid_argument" "invalid time format for --$label: $input (expected ISO 8601 or Unix ms)"
    return $?
  }

  # shellcheck disable=SC2034  # read by callers
  PARSED_TIME_MS=$((epoch_s * 1000))
  return 0
}

# --- Limit parsing ---

# parse_limit — Parse --limit N, default 50, max 200.
# Sets PARSED_LIMIT.
parse_limit() {
  local input="${1:-50}"

  if [[ ! "$input" =~ ^[0-9]+$ ]]; then
    format_error "invalid_argument" "invalid --limit value: $input (must be a positive integer)"
    return $?
  fi

  PARSED_LIMIT="$input"
  [[ "$PARSED_LIMIT" -gt 200 ]] && PARSED_LIMIT=200
  [[ "$PARSED_LIMIT" -lt 1 ]] && PARSED_LIMIT=1
  return 0
}

# --- ID prefix validation ---

# validate_msg_id — Validate message ID has msg_ prefix.
validate_msg_id() {
  local id="$1"

  if [[ -z "$id" ]]; then
    format_error "invalid_argument" "message ID is required"
    return $?
  fi

  if [[ "$id" != msg_* ]]; then
    format_error "invalid_argument" "invalid message ID prefix: expected msg_ prefix" "message_id"
    return $?
  fi
  return 0
}

# validate_cnv_id — Validate conversation ID has cnv_ prefix.
validate_cnv_id() {
  local id="$1"

  if [[ -z "$id" ]]; then
    format_error "invalid_argument" "conversation ID is required"
    return $?
  fi

  if [[ "$id" != cnv_* ]]; then
    format_error "invalid_argument" "invalid conversation ID prefix: expected cnv_ prefix" "conversation_id"
    return $?
  fi
  return 0
}

# --- Urgency validation ---

# validate_urgency — Validate urgency level.
validate_urgency() {
  local urgency="${1:-normal}"

  case "$urgency" in
    low|normal|high|urgent) return 0 ;;
    *)
      format_error "invalid_argument" "invalid urgency: $urgency (must be low|normal|high|urgent)"
      return $?
      ;;
  esac
}

# --- Build references JSON ---

# build_refs_json — Build a JSON array from accumulated ref arrays.
# Uses global arrays _REF_KINDS and _REF_VALUES.
build_refs_json() {
  local json="["
  local first=1
  local i=0

  # shellcheck disable=SC2153  # _REF_KINDS/_REF_VALUES set by callers
  while [[ $i -lt ${#_REF_KINDS[@]} ]]; do
    local kind="${_REF_KINDS[$i]}"
    local value="${_REF_VALUES[$i]}"

    # Escape for JSON
    local safe_value="${value//\\/\\\\}"
    safe_value="${safe_value//\"/\\\"}"
    safe_value="${safe_value//$'\n'/\\n}"
    safe_value="${safe_value//$'\r'/\\r}"
    safe_value="${safe_value//$'\t'/\\t}"

    if [[ $first -eq 1 ]]; then
      json+="{\"kind\":\"$kind\",\"value\":\"$safe_value\",\"label\":null,\"mime_type\":null,\"metadata\":null}"
      first=0
    else
      json+=",{\"kind\":\"$kind\",\"value\":\"$safe_value\",\"label\":null,\"mime_type\":null,\"metadata\":null}"
    fi

    i=$((i + 1))
  done

  json+="]"
  echo "$json"
}
