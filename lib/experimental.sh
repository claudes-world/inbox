#!/usr/bin/env bash
# lib/experimental.sh — Experimental discovery mode and give-feedback command logic.
# Never mutates Inbox protocol tables. All writes go to NDJSON log files only.

# --- Experimental profile surface definitions ---
# Each tier is cumulative: broad includes core, frontier includes broad.

_EXP_CORE_VERBS="forward fork search snooze archive mark-unread"
_EXP_CORE_NOUNS="rules stats"
_EXP_CORE_FLAGS="--bcc --send-at --receipt --tag --sort --cursor --branch --ancestors --descendants --tree"

_EXP_BROAD_VERBS="watch unwatch export mute unmute"
_EXP_BROAD_NOUNS="telemetry config"
_EXP_BROAD_FLAGS="--follow-up --quote --template --branch-only --unread-first"

_EXP_FRONTIER_VERBS="filter escalate alert report scan move create-folder create-tag"
_EXP_FRONTIER_NOUNS="filters addresses api tags folders"
_EXP_FRONTIER_FLAGS="--signature --cid --public --self-destruct --scan"

# --- Initialization ---

# experimental_init — Parse env vars for experimental mode.
# Sets module-level defaults. Call early in CLI startup.
experimental_init() {
  export INBOX_EXPERIMENTAL_MODE="${INBOX_EXPERIMENTAL_MODE:-0}"
  export INBOX_EXPERIMENTAL_PROFILE="${INBOX_EXPERIMENTAL_PROFILE:-core}"
  export INBOX_EXPERIMENTAL_CAPTURE="${INBOX_EXPERIMENTAL_CAPTURE:-safe}"
  export INBOX_EXPERIMENTAL_LOG="${INBOX_EXPERIMENTAL_LOG:-${HOME}/.inbox/feedback.ndjson}"
}

# --- Query functions ---

# experimental_is_enabled — Check if experimental discovery mode is active.
# Returns 0 if enabled, 1 if not.
experimental_is_enabled() {
  [[ "${INBOX_EXPERIMENTAL_MODE:-0}" == "1" ]]
}

# experimental_get_profile — Return current profile name.
experimental_get_profile() {
  echo "${INBOX_EXPERIMENTAL_PROFILE:-core}"
}

# experimental_get_surfaces — Return the verbs/nouns/flags for a given profile tier (cumulative).
# Usage: experimental_get_surfaces <profile> <surface_type>
# surface_type: verbs | nouns | flags
# Output: space-separated list
experimental_get_surfaces() {
  local profile="${1:-core}"
  local surface_type="${2:-verbs}"

  local result=""

  case "$surface_type" in
    verbs)
      result="$_EXP_CORE_VERBS"
      if [[ "$profile" == "broad" || "$profile" == "frontier" ]]; then
        result="$result $_EXP_BROAD_VERBS"
      fi
      if [[ "$profile" == "frontier" ]]; then
        result="$result $_EXP_FRONTIER_VERBS"
      fi
      ;;
    nouns)
      result="$_EXP_CORE_NOUNS"
      if [[ "$profile" == "broad" || "$profile" == "frontier" ]]; then
        result="$result $_EXP_BROAD_NOUNS"
      fi
      if [[ "$profile" == "frontier" ]]; then
        result="$result $_EXP_FRONTIER_NOUNS"
      fi
      ;;
    flags)
      result="$_EXP_CORE_FLAGS"
      if [[ "$profile" == "broad" || "$profile" == "frontier" ]]; then
        result="$result $_EXP_BROAD_FLAGS"
      fi
      if [[ "$profile" == "frontier" ]]; then
        result="$result $_EXP_FRONTIER_FLAGS"
      fi
      ;;
  esac

  echo "$result"
}

# --- Probe ---

# experimental_probe — Return coming_soon response for an experimental surface.
# Never mutates protocol state. Returns exit code 6 (EXIT_COMING_SOON).
# Usage: experimental_probe <feature> <kind>
# kind: verb | noun | flag
experimental_probe() {
  local feature="${1:-}"
  local kind="${2:-verb}"

  if [[ -z "$feature" ]]; then
    format_error "invalid_argument" "feature name is required for experimental probe" || return $?
  fi

  local feedback_cmd="inbox give-feedback --feature $feature --kind $kind --wanted \"<what you wanted to do>\""

  if [[ "$INBOX_JSON_MODE" == "1" ]]; then
    local details
    details=$(printf '{"feature":"%s","feedback_command":"%s"}' "$feature" "$feedback_cmd")
    error_json "coming_soon" "feature coming soon" "null" "$details"
  else
    echo "feature coming soon: $feature"
    echo ""
    echo "please describe how you would like to use this '$feature' feature in your workflow by submitting feedback:"
    echo "  $feedback_cmd"
  fi

  return "$EXIT_COMING_SOON"
}

# --- Experimental help ---

# experimental_help — Return tier-appropriate help text showing experimental surfaces.
# Usage: experimental_help [profile]
experimental_help() {
  local profile="${1:-$(experimental_get_profile)}"

  local verbs nouns flags
  verbs=$(experimental_get_surfaces "$profile" "verbs")
  nouns=$(experimental_get_surfaces "$profile" "nouns")
  flags=$(experimental_get_surfaces "$profile" "flags")

  echo "Experimental commands (profile: $profile):"
  for verb in $verbs; do
    echo "  $verb"
  done

  echo ""
  echo "Experimental nouns:"
  for noun in $nouns; do
    echo "  $noun"
  done

  echo ""
  echo "Experimental flags:"
  for flag in $flags; do
    echo "  $flag"
  done

  echo ""
  echo "These features are not yet implemented. Try one to see its status,"
  echo "or use 'inbox give-feedback' to describe how you would use it."
}

# --- Experimental command check ---

# experimental_check — Check if a command/noun/flag is an experimental surface.
# Returns 0 if it matches an experimental surface in the current profile, 1 if not.
# Usage: experimental_check <name>
experimental_check() {
  local name="${1:-}"

  if ! experimental_is_enabled; then
    return 1
  fi

  local profile
  profile=$(experimental_get_profile)

  local verbs nouns
  verbs=$(experimental_get_surfaces "$profile" "verbs")
  nouns=$(experimental_get_surfaces "$profile" "nouns")

  for verb in $verbs; do
    if [[ "$verb" == "$name" ]]; then
      return 0
    fi
  done

  for noun in $nouns; do
    if [[ "$noun" == "$name" ]]; then
      return 0
    fi
  done

  return 1
}

# --- Give-feedback command ---

# do_give_feedback — Record feedback to NDJSON log.
# Usage: do_give_feedback <actor_id> <feature> <kind> <wanted> [context] [outcome] [command_text]
# Required: feature, kind
# Never touches protocol tables.
do_give_feedback() {
  local actor_id="${1:-}"
  local feature="${2:-}"
  local kind="${3:-}"
  local wanted="${4:-}"
  local context="${5:-}"
  local outcome="${6:-}"
  local command_text="${7:-}"

  # Generate feedback ID
  local feedback_id
  feedback_id=$(generate_id "fbk_")

  local ts_ms
  ts_ms=$(now_ms)

  # Ensure log directory exists
  local log_file="${INBOX_EXPERIMENTAL_LOG:-${HOME}/.inbox/feedback.ndjson}"
  local log_dir
  log_dir="$(dirname "$log_file")"
  if [[ ! -d "$log_dir" ]]; then
    mkdir -p "$log_dir"
  fi

  # Escape strings for JSON
  local safe_wanted="${wanted//\\/\\\\}"
  safe_wanted="${safe_wanted//\"/\\\"}"
  safe_wanted="${safe_wanted//$'\n'/\\n}"

  local safe_context="${context//\\/\\\\}"
  safe_context="${safe_context//\"/\\\"}"
  safe_context="${safe_context//$'\n'/\\n}"

  local safe_outcome="${outcome//\\/\\\\}"
  safe_outcome="${safe_outcome//\"/\\\"}"
  safe_outcome="${safe_outcome//$'\n'/\\n}"

  local safe_command="${command_text//\\/\\\\}"
  safe_command="${safe_command//\"/\\\"}"

  # Build NDJSON record
  local record
  record=$(printf '{"feedback_id":"%s","ts_ms":%s,"actor":"%s","feature":"%s","kind":"%s","wanted":"%s","context":"%s","outcome":"%s","command":"%s"}' \
    "$feedback_id" "$ts_ms" "$actor_id" "$feature" "$kind" "$safe_wanted" "$safe_context" "$safe_outcome" "$safe_command")

  # Append to log file
  echo "$record" >> "$log_file"

  # Return the feedback ID
  echo "$feedback_id"
}
