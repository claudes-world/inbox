#!/usr/bin/env bash
# INBOX_LIB_FILE=1
# lib/telemetry.sh — Telemetry capture for observability.
# All telemetry writes go to NDJSON log, never to the protocol DB.
# Two capture modes: safe (minimal) and dangerous-full-context (rich).

# --- Module state ---
_TELEMETRY_ENABLED=0
_TELEMETRY_CAPTURE_MODE="safe"
_TELEMETRY_LOG_FILE=""

# --- Initialization ---

# telemetry_init — Set up NDJSON capture based on INBOX_EXPERIMENTAL_CAPTURE mode.
# Call after experimental_init.
telemetry_init() {
  if [[ "${INBOX_EXPERIMENTAL_MODE:-0}" == "1" ]]; then
    _TELEMETRY_ENABLED=1
  else
    _TELEMETRY_ENABLED=0
    return 0
  fi

  _TELEMETRY_CAPTURE_MODE="${INBOX_EXPERIMENTAL_CAPTURE:-safe}"
  _TELEMETRY_LOG_FILE="${INBOX_EXPERIMENTAL_LOG:-${HOME}/.inbox/feedback.ndjson}"

  # Ensure log directory exists
  local log_dir
  log_dir="$(dirname "$_TELEMETRY_LOG_FILE")"
  if [[ ! -d "$log_dir" ]]; then
    mkdir -p "$log_dir"
  fi
}

# --- Recording ---

# telemetry_record — Append a structured telemetry record to the NDJSON log.
# Usage: telemetry_record <event_name> [key=value ...]
# In safe mode: captures event_name, command, ok/fail, duration_ms, actor, error_code
# In dangerous-full-context mode: also captures argv, parsed_flags, recent context
telemetry_record() {
  if [[ "$_TELEMETRY_ENABLED" != "1" ]]; then
    return 0
  fi

  local event_name="${1:-}"
  shift || true

  local ts_ms
  ts_ms=$(now_ms)

  # Parse key=value attributes
  local command="" result_ok="" duration_ms="" actor="" error_code=""
  local argv="" parsed_flags="" stdin_present="" json_mode=""
  local feature_name="" feature_kind=""

  for attr in "$@"; do
    local key="${attr%%=*}"
    local value="${attr#*=}"
    case "$key" in
      command)        command="$value" ;;
      result_ok)      result_ok="$value" ;;
      duration_ms)    duration_ms="$value" ;;
      actor)          actor="$value" ;;
      error_code)     error_code="$value" ;;
      argv)           argv="$value" ;;
      parsed_flags)   parsed_flags="$value" ;;
      stdin_present)  stdin_present="$value" ;;
      json_mode)      json_mode="$value" ;;
      feature_name)   feature_name="$value" ;;
      feature_kind)   feature_kind="$value" ;;
    esac
  done

  # Build JSON record based on capture mode
  local record=""

  if [[ "$_TELEMETRY_CAPTURE_MODE" == "dangerous-full-context" ]]; then
    # Rich capture: include all available context
    record=$(printf '{"event":"%s","ts_ms":%s,"capture_mode":"dangerous-full-context","command":"%s","result_ok":"%s","duration_ms":"%s","actor":"%s","error_code":"%s","argv":"%s","parsed_flags":"%s","stdin_present":"%s","json_mode":"%s","feature_name":"%s","feature_kind":"%s","experimental_mode":"%s","experimental_profile":"%s"}' \
      "$event_name" "$ts_ms" \
      "$command" "$result_ok" "$duration_ms" "$actor" "$error_code" \
      "$argv" "$parsed_flags" "$stdin_present" "$json_mode" \
      "$feature_name" "$feature_kind" \
      "${INBOX_EXPERIMENTAL_MODE:-0}" "${INBOX_EXPERIMENTAL_PROFILE:-core}")
  else
    # Safe capture: minimal structured data only
    record=$(printf '{"event":"%s","ts_ms":%s,"capture_mode":"safe","command":"%s","result_ok":"%s","duration_ms":"%s","actor":"%s","error_code":"%s"}' \
      "$event_name" "$ts_ms" \
      "$command" "$result_ok" "$duration_ms" "$actor" "$error_code")
  fi

  # Append to log file
  echo "$record" >> "$_TELEMETRY_LOG_FILE"
}

# --- CLI wrapper ---

# telemetry_start_command — Start timing a CLI command.
# Returns the start timestamp for use with telemetry_finish_command.
telemetry_start_command() {
  if [[ "$_TELEMETRY_ENABLED" != "1" ]]; then
    echo "0"
    return 0
  fi
  now_ms
}

# telemetry_finish_command — Finish timing and record a command execution.
# Usage: telemetry_finish_command <start_ms> <command_name> <exit_code> [argv_string] [parsed_flags_string]
telemetry_finish_command() {
  if [[ "$_TELEMETRY_ENABLED" != "1" ]]; then
    return 0
  fi

  local start_ms="${1:-0}"
  local command_name="${2:-}"
  local exit_code="${3:-0}"
  local argv_string="${4:-}"
  local flags_string="${5:-}"

  local end_ms
  end_ms=$(now_ms)
  local duration_ms=$(( end_ms - start_ms ))

  local result_ok="true"
  local error_code_str=""
  if [[ "$exit_code" -ne 0 ]]; then
    result_ok="false"
    case "$exit_code" in
      1) error_code_str="invalid_argument" ;;
      2) error_code_str="not_found" ;;
      3) error_code_str="invalid_state" ;;
      4) error_code_str="permission_denied" ;;
      5) error_code_str="internal_error" ;;
      6) error_code_str="coming_soon" ;;
      *) error_code_str="unknown" ;;
    esac
  fi

  local stdin_present="false"
  if [[ ! -t 0 ]]; then
    stdin_present="true"
  fi

  telemetry_record "cli.command" \
    "command=$command_name" \
    "result_ok=$result_ok" \
    "duration_ms=$duration_ms" \
    "actor=${INBOX_ADDRESS:-}" \
    "error_code=$error_code_str" \
    "argv=$argv_string" \
    "parsed_flags=$flags_string" \
    "stdin_present=$stdin_present" \
    "json_mode=${INBOX_JSON_MODE:-0}"
}
