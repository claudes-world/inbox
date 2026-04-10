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

# json_escape — Escape a string for safe JSON embedding
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"      # backslash
  s="${s//\"/\\\"}"      # double quote
  s="${s//$'\n'/\\n}"    # newline
  s="${s//$'\r'/\\r}"    # carriage return
  s="${s//$'\t'/\\t}"    # tab
  echo "$s"
}

# error_json — Output a JSON error envelope to stdout.
# Usage: error_json <code> <message> [target] [details_json]
error_json() {
  local code="$(json_escape "${1:-internal_error}")"
  local message="$(json_escape "${2:-unknown error}")"
  local target="${3:-null}"
  local details="${4:-null}"

  # Quote target if non-null
  if [[ "$target" != "null" ]]; then
    target="\"$target\""
  fi
  # Details should be raw JSON or null
  if [[ "$details" != "null" && "$details" != "{"* && "$details" != "["* ]]; then
    details="null"
  fi

  printf '{"ok":false,"error":{"code":"%s","message":"%s","target":%s,"details":%s}}\n' \
    "$code" "$message" "$target" "$details"
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
