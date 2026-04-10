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

generate_id() {
  echo "not implemented" >&2; return 1
}

now_ms() {
  echo "not implemented" >&2; return 1
}

die() {
  echo "not implemented" >&2; return 1
}

error_json() {
  echo "not implemented" >&2; return 1
}

success_json() {
  echo "not implemented" >&2; return 1
}
