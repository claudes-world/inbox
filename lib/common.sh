#!/usr/bin/env bash
# lib/common.sh — Shared utilities: ID generation, timestamps, error helpers, exit codes.

# --- Exit code constants ---
export EXIT_SUCCESS=0
export EXIT_INVALID_ARGUMENT=1
export EXIT_NOT_FOUND=2
export EXIT_INVALID_STATE=3
export EXIT_PERMISSION_DENIED=4
export EXIT_INTERNAL_ERROR=5
export EXIT_COMING_SOON=6

# now_ms — Return current Unix time in milliseconds.
# Uses nanosecond precision if available, falls back to seconds * 1000.
now_ms() {
  local ns
  ns="$(date +%s%N 2>/dev/null)" || true
  if [[ -n "$ns" && "$ns" != *N* ]]; then
    # Nanoseconds available — divide by 1,000,000 to get milliseconds
    echo $(( ns / 1000000 ))
  else
    # Fallback: seconds * 1000
    echo $(( $(date +%s) * 1000 ))
  fi
}

# generate_id — Generate a sortable prefixed ID.
# Format: ${prefix}${timestamp_hex}_${random_hex}
# - timestamp: current time in ms, hex-encoded, zero-padded to 12 chars
# - random: 8 random hex chars from /dev/urandom
# Uses od and tr from coreutils (not pure bash builtins).
# Usage: generate_id "msg_"
generate_id() {
  local prefix="${1:-}"
  local ts_ms
  ts_ms="$(now_ms)"
  local ts_hex
  ts_hex="$(printf '%012x' "$ts_ms")"
  local rand_hex
  rand_hex="$(od -An -tx1 -N4 /dev/urandom | tr -d ' \n')"
  echo "${prefix}${ts_hex}_${rand_hex}"
}

# die — Print error message to stderr and exit with given code.
# Usage: die <exit_code> <message>
die() {
  local code="${1:-1}"
  shift
  echo "error: $*" >&2
  exit "$code"
}

# json_escape — Escape a string for safe JSON embedding (RFC 8259 compliant).
# Handles backslash, double quote, the named control characters (\b \t \n \f \r),
# and all remaining control characters 0x00-0x1F as \u00XX sequences.
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"      # backslash (must be first)
  s="${s//\"/\\\"}"      # double quote
  s="${s//$'\b'/\\b}"    # backspace
  s="${s//$'\t'/\\t}"    # tab
  s="${s//$'\n'/\\n}"    # newline
  s="${s//$'\f'/\\f}"    # form feed
  s="${s//$'\r'/\\r}"    # carriage return
  # Handle remaining control characters (0x01-0x1F) as \u00XX.
  # NUL (0x00) is skipped: bash strings are NUL-terminated so NUL bytes
  # cannot be stored in shell variables — attempting to substitute them
  # silently drops the null and emits a warning. Callers should not pass
  # NUL-containing strings.
  local i char_val hex
  for ((i=1; i<=31; i++)); do
    case $i in
      8|9|10|12|13) continue ;; # Already handled: \b \t \n \f \r
    esac
    char_val=$(printf '%b' "$(printf '\\x%02x' "$i")")
    hex=$(printf '\\u%04x' $i)
    s="${s//$char_val/$hex}"
  done
  printf '%s\n' "$s"
}

# error_json — Output a JSON error envelope to stdout.
# Usage: error_json <code> <message> [target] [details_json]
error_json() {
  local code
  code="$(json_escape "${1:-internal_error}")"
  local message
  message="$(json_escape "${2:-unknown error}")"
  local target="${3:-null}"
  local details="${4:-null}"

  # Quote target if non-null (escape first to prevent JSON injection)
  if [[ "$target" != "null" ]]; then
    target="\"$(json_escape "$target")\""
  fi
  # Details should be raw JSON or null
  if [[ "$details" != "null" && "$details" != "{"* && "$details" != "["* ]]; then
    details="null"
  fi

  printf '{"ok":false,"error":{"code":"%s","message":"%s","target":%s,"details":%s}}\n' \
    "$code" "$message" "$target" "$details"
}

# sql_escape — Escape a string for safe interpolation into a single-quoted SQL literal.
# Doubles every single quote so ' becomes ''.
# Usage: sql_escape "value"   → echoes the escaped string (no surrounding quotes added)
sql_escape() {
  local value="${1:-}"
  echo "${value//\'/\'\'}"
}

# success_json — Output a JSON success envelope to stdout.
# Usage: success_json <additional_fields_json>
# The additional_fields_json should NOT include outer braces — it will be merged into {"ok":true, ...}
success_json() {
  local fields="${1:-}"
  if [[ -n "$fields" ]]; then
    printf '{"ok":true,%s}\n' "$fields"
  else
    printf '{"ok":true}\n'
  fi
}
