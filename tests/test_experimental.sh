#!/usr/bin/env bash
# tests/test_experimental.sh — Gate 4: Experimental mode tests
# Tests EXP-01..EXP-07 from the test matrix.
TEST_GATE=4

INBOX_CMD="$PROJECT_DIR/bin/inbox"

# --- Shared fixtures for experimental tests ---
_exp_fixtures() {
  db_exec "
    INSERT INTO addresses (id, local_part, host, kind, display_name, is_listed, is_active, classification, created_at_ms, updated_at_ms)
    VALUES
      ('addr_exp_a', 'alpha', 'exp-test', 'agent', 'Alpha Agent', 1, 1, 'internal', 1000, 1000),
      ('addr_exp_b', 'beta',  'exp-test', 'agent', 'Beta Agent',  1, 1, 'internal', 1000, 1000);
  "
}

# --- EXP-01: experimental help in core profile shows only core surfaces ---
test_exp01_core_help() {
  export INBOX_EXPERIMENTAL_MODE=1
  export INBOX_EXPERIMENTAL_PROFILE=core

  local help_output
  help_output=$(experimental_help "core")

  # Core verbs must be present
  assert_contains "$help_output" "forward" "EXP-01: core has forward" || return 1
  assert_contains "$help_output" "search" "EXP-01: core has search" || return 1
  assert_contains "$help_output" "snooze" "EXP-01: core has snooze" || return 1
  assert_contains "$help_output" "archive" "EXP-01: core has archive" || return 1

  # Broad-only verbs must NOT be present
  local has_watch=0
  if [[ "$help_output" == *"watch"* && "$help_output" != *"unwatch"* ]]; then
    # "watch" appears but not "unwatch" — but we need to check properly
    :
  fi
  # Use a more precise check: broad verbs should be absent
  local broad_verb_found=0
  for verb in export mute unmute; do
    if [[ "$help_output" == *"  $verb"* ]]; then
      broad_verb_found=1
    fi
  done
  assert_eq "$broad_verb_found" "0" "EXP-01: core profile does not include broad verbs" || return 1

  # Frontier-only verbs must NOT be present
  local frontier_verb_found=0
  for verb in escalate alert filter; do
    if [[ "$help_output" == *"  $verb"* ]]; then
      frontier_verb_found=1
    fi
  done
  assert_eq "$frontier_verb_found" "0" "EXP-01: core profile does not include frontier verbs" || return 1

  # Core nouns
  assert_contains "$help_output" "rules" "EXP-01: core has rules noun" || return 1
  assert_contains "$help_output" "stats" "EXP-01: core has stats noun" || return 1

  # Core flags
  assert_contains "$help_output" "--bcc" "EXP-01: core has --bcc flag" || return 1
  assert_contains "$help_output" "--sort" "EXP-01: core has --sort flag" || return 1

  unset INBOX_EXPERIMENTAL_MODE INBOX_EXPERIMENTAL_PROFILE
}

# --- EXP-02: experimental help in frontier profile shows all surfaces ---
test_exp02_frontier_help() {
  export INBOX_EXPERIMENTAL_MODE=1
  export INBOX_EXPERIMENTAL_PROFILE=frontier

  local help_output
  help_output=$(experimental_help "frontier")

  # Core verbs
  assert_contains "$help_output" "forward" "EXP-02: frontier has forward (core)" || return 1
  assert_contains "$help_output" "search" "EXP-02: frontier has search (core)" || return 1

  # Broad verbs
  assert_contains "$help_output" "export" "EXP-02: frontier has export (broad)" || return 1
  assert_contains "$help_output" "mute" "EXP-02: frontier has mute (broad)" || return 1

  # Frontier verbs
  assert_contains "$help_output" "escalate" "EXP-02: frontier has escalate" || return 1
  assert_contains "$help_output" "alert" "EXP-02: frontier has alert" || return 1
  assert_contains "$help_output" "filter" "EXP-02: frontier has filter" || return 1
  assert_contains "$help_output" "scan" "EXP-02: frontier has scan" || return 1

  # Frontier nouns
  assert_contains "$help_output" "filters" "EXP-02: frontier has filters noun" || return 1
  assert_contains "$help_output" "api" "EXP-02: frontier has api noun" || return 1
  assert_contains "$help_output" "tags" "EXP-02: frontier has tags noun" || return 1

  # Frontier flags
  assert_contains "$help_output" "--signature" "EXP-02: frontier has --signature" || return 1
  assert_contains "$help_output" "--self-destruct" "EXP-02: frontier has --self-destruct" || return 1

  # Profile label
  assert_contains "$help_output" "frontier" "EXP-02: frontier label shown" || return 1

  unset INBOX_EXPERIMENTAL_MODE INBOX_EXPERIMENTAL_PROFILE
}

# --- EXP-03: probe experimental command -> coming_soon, no state mutation ---
test_exp03_probe_coming_soon() {
  _exp_fixtures
  export INBOX_ADDRESS="alpha@exp-test"
  export INBOX_EXPERIMENTAL_MODE=1
  export INBOX_EXPERIMENTAL_PROFILE=core

  # Get message count before
  local msg_count_before
  msg_count_before=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM messages;")

  local result exit_code=0
  result=$("$INBOX_CMD" search --json 2>/dev/null) || exit_code=$?

  # Verify exit code is 6 (EXIT_COMING_SOON)
  assert_eq "$exit_code" "6" "EXP-03: exit code is 6 (coming_soon)" || return 1

  # Verify JSON response
  assert_json_field "$result" '$.ok' '0' "EXP-03: ok=false" || return 1
  assert_json_field "$result" '$.error.code' 'coming_soon' "EXP-03: error code is coming_soon" || return 1
  assert_json_field "$result" '$.error.details.feature' 'search' "EXP-03: feature is search" || return 1

  # Verify no state mutation
  local msg_count_after
  msg_count_after=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM messages;")
  assert_eq "$msg_count_after" "$msg_count_before" "EXP-03: no messages created by probe" || return 1

  # Verify no delivery events created
  local event_count
  event_count=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM delivery_events;")
  assert_eq "$event_count" "0" "EXP-03: no delivery events from probe" || return 1

  unset INBOX_EXPERIMENTAL_MODE INBOX_EXPERIMENTAL_PROFILE
}

# --- EXP-04: coming_soon response includes feedback prompt ---
test_exp04_feedback_prompt() {
  _exp_fixtures
  export INBOX_ADDRESS="alpha@exp-test"
  export INBOX_EXPERIMENTAL_MODE=1
  export INBOX_EXPERIMENTAL_PROFILE=core

  # Test JSON mode
  local result exit_code=0
  result=$("$INBOX_CMD" forward --json 2>/dev/null) || exit_code=$?

  # Verify feedback_command is present in details
  local fb_cmd
  fb_cmd=$(sqlite3 :memory: "SELECT json_extract('$(echo "$result" | sed "s/'/''/g")', '\$.error.details.feedback_command');")
  assert_contains "$fb_cmd" "give-feedback" "EXP-04: feedback_command contains give-feedback" || return 1
  assert_contains "$fb_cmd" "--feature forward" "EXP-04: feedback_command contains --feature forward" || return 1

  # Test text mode
  local text_result text_exit=0
  text_result=$("$INBOX_CMD" forward 2>&1) || text_exit=$?

  assert_contains "$text_result" "give-feedback" "EXP-04: text output mentions give-feedback" || return 1
  assert_contains "$text_result" "--feature forward" "EXP-04: text output includes --feature" || return 1
  assert_contains "$text_result" "--wanted" "EXP-04: text output includes --wanted" || return 1

  unset INBOX_EXPERIMENTAL_MODE INBOX_EXPERIMENTAL_PROFILE
}

# --- EXP-05: give-feedback writes record with fbk_ ID ---
test_exp05_give_feedback_record() {
  _exp_fixtures
  export INBOX_ADDRESS="alpha@exp-test"
  export INBOX_EXPERIMENTAL_LOG="$_TEST_TMPDIR/feedback.ndjson"

  local result exit_code=0
  result=$("$INBOX_CMD" give-feedback --feature search --kind verb --wanted "I need keyword search" --json 2>/dev/null) || exit_code=$?

  # Verify success
  assert_eq "$exit_code" "0" "EXP-05: exit code 0" || return 1
  assert_json_ok "$result" "EXP-05: ok=true" || return 1
  assert_json_field "$result" '$.recorded' '1' "EXP-05: recorded=true" || return 1

  # Verify feedback_id starts with fbk_
  local feedback_id
  feedback_id=$(sqlite3 :memory: "SELECT json_extract('$(echo "$result" | sed "s/'/''/g")', '\$.feedback_id');")
  local prefix="${feedback_id:0:4}"
  assert_eq "$prefix" "fbk_" "EXP-05: feedback_id starts with fbk_" || return 1

  # Verify NDJSON record was written
  if [[ ! -f "$_TEST_TMPDIR/feedback.ndjson" ]]; then
    _test_fail "EXP-05: feedback NDJSON file exists"
    return 1
  fi

  local record
  record=$(tail -1 "$_TEST_TMPDIR/feedback.ndjson")

  # Verify record fields using sqlite3 json_extract
  local record_escaped
  record_escaped=$(echo "$record" | sed "s/'/''/g")
  local rec_feature rec_kind rec_wanted rec_fbk_id
  rec_feature=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.feature');")
  rec_kind=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.kind');")
  rec_wanted=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.wanted');")
  rec_fbk_id=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.feedback_id');")

  assert_eq "$rec_feature" "search" "EXP-05: NDJSON feature=search" || return 1
  assert_eq "$rec_kind" "verb" "EXP-05: NDJSON kind=verb" || return 1
  assert_eq "$rec_wanted" "I need keyword search" "EXP-05: NDJSON wanted text" || return 1
  assert_eq "${rec_fbk_id:0:4}" "fbk_" "EXP-05: NDJSON feedback_id prefix" || return 1

  # Verify no protocol state mutation
  local msg_count
  msg_count=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM messages;")
  assert_eq "$msg_count" "0" "EXP-05: no messages created" || return 1

  unset INBOX_EXPERIMENTAL_LOG
}

# --- EXP-06: safe capture mode produces minimal capture ---
test_exp06_safe_capture() {
  _exp_fixtures
  export INBOX_ADDRESS="alpha@exp-test"
  export INBOX_EXPERIMENTAL_MODE=1
  export INBOX_EXPERIMENTAL_CAPTURE=safe
  export INBOX_EXPERIMENTAL_LOG="$_TEST_TMPDIR/telemetry.ndjson"

  # Run a command to generate telemetry
  "$INBOX_CMD" whoami --json >/dev/null 2>/dev/null || true

  # Verify telemetry was written
  if [[ ! -f "$_TEST_TMPDIR/telemetry.ndjson" ]]; then
    _test_fail "EXP-06: telemetry NDJSON file exists"
    return 1
  fi

  local record
  record=$(tail -1 "$_TEST_TMPDIR/telemetry.ndjson")
  local record_escaped
  record_escaped=$(echo "$record" | sed "s/'/''/g")

  # Verify safe mode fields present
  local capture_mode event_name command result_ok actor
  capture_mode=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.capture_mode');")
  event_name=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.event');")
  command=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.command');")
  result_ok=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.result_ok');")
  actor=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.actor');")

  assert_eq "$capture_mode" "safe" "EXP-06: capture_mode is safe" || return 1
  assert_eq "$event_name" "cli.command" "EXP-06: event is cli.command" || return 1
  assert_eq "$command" "whoami" "EXP-06: command is whoami" || return 1
  assert_eq "$result_ok" "true" "EXP-06: result_ok is true" || return 1
  assert_eq "$actor" "alpha@exp-test" "EXP-06: actor matches" || return 1

  # Verify rich fields are NOT present in safe mode
  local argv_val
  argv_val=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.argv');")
  assert_eq "$argv_val" "" "EXP-06: argv absent in safe mode" || return 1

  local parsed_flags_val
  parsed_flags_val=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.parsed_flags');")
  assert_eq "$parsed_flags_val" "" "EXP-06: parsed_flags absent in safe mode" || return 1

  unset INBOX_EXPERIMENTAL_MODE INBOX_EXPERIMENTAL_CAPTURE INBOX_EXPERIMENTAL_LOG
}

# --- EXP-07: dangerous-full-context produces rich capture ---
test_exp07_dangerous_capture() {
  _exp_fixtures
  export INBOX_ADDRESS="alpha@exp-test"
  export INBOX_EXPERIMENTAL_MODE=1
  export INBOX_EXPERIMENTAL_CAPTURE=dangerous-full-context
  export INBOX_EXPERIMENTAL_LOG="$_TEST_TMPDIR/telemetry.ndjson"

  # Run a command to generate telemetry
  "$INBOX_CMD" whoami --json >/dev/null 2>/dev/null || true

  # Verify telemetry was written
  if [[ ! -f "$_TEST_TMPDIR/telemetry.ndjson" ]]; then
    _test_fail "EXP-07: telemetry NDJSON file exists"
    return 1
  fi

  local record
  record=$(tail -1 "$_TEST_TMPDIR/telemetry.ndjson")
  local record_escaped
  record_escaped=$(echo "$record" | sed "s/'/''/g")

  # Verify dangerous-full-context mode
  local capture_mode
  capture_mode=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.capture_mode');")
  assert_eq "$capture_mode" "dangerous-full-context" "EXP-07: capture_mode is dangerous-full-context" || return 1

  # Verify rich fields ARE present
  local argv_val json_mode_val experimental_mode_val experimental_profile_val
  argv_val=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.argv');")
  json_mode_val=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.json_mode');")
  experimental_mode_val=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.experimental_mode');")
  experimental_profile_val=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.experimental_profile');")

  # argv should contain the command
  assert_contains "$argv_val" "whoami" "EXP-07: argv contains command name" || return 1

  # json_mode should be recorded
  assert_eq "$json_mode_val" "1" "EXP-07: json_mode captured" || return 1

  # experimental mode and profile should be captured
  assert_eq "$experimental_mode_val" "1" "EXP-07: experimental_mode captured" || return 1
  assert_eq "$experimental_profile_val" "core" "EXP-07: experimental_profile captured" || return 1

  # Verify standard fields also present
  local command result_ok
  command=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.command');")
  result_ok=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.result_ok');")
  assert_eq "$command" "whoami" "EXP-07: command present in rich capture" || return 1
  assert_eq "$result_ok" "true" "EXP-07: result_ok present in rich capture" || return 1

  unset INBOX_EXPERIMENTAL_MODE INBOX_EXPERIMENTAL_CAPTURE INBOX_EXPERIMENTAL_LOG
}

# --- Register tests ---
run_test "EXP-01: experimental help core profile"             test_exp01_core_help 4
run_test "EXP-02: experimental help frontier profile"         test_exp02_frontier_help 4
run_test "EXP-03: probe experimental -> coming_soon"          test_exp03_probe_coming_soon 4
run_test "EXP-04: coming_soon includes feedback prompt"       test_exp04_feedback_prompt 4
run_test "EXP-05: give-feedback writes fbk_ record"           test_exp05_give_feedback_record 4
run_test "EXP-06: safe capture mode minimal"                  test_exp06_safe_capture 4
run_test "EXP-07: dangerous-full-context rich capture"        test_exp07_dangerous_capture 4
