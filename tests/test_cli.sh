#!/usr/bin/env bash
# tests/test_cli.sh — Gate 4: CLI contract tests
# Tests CLI-01..CLI-10 from the test matrix.
TEST_GATE=4

INBOX_CMD="$PROJECT_DIR/bin/inbox"

# --- Shared fixtures for CLI tests ---
_cli_fixtures() {
  db_exec "
    INSERT INTO addresses (id, local_part, host, kind, display_name, is_listed, is_active, classification, created_at_ms, updated_at_ms)
    VALUES
      ('addr_cli_a', 'alpha',    'cli-test',  'agent',   'Alpha Agent',   1, 1, 'internal', 1000, 1000),
      ('addr_cli_b', 'beta',     'cli-test',  'agent',   'Beta Agent',    1, 1, 'internal', 1000, 1000),
      ('addr_cli_c', 'charlie',  'cli-test',  'agent',   'Charlie Agent', 0, 1, NULL,       1000, 1000),
      ('addr_cli_d', 'inactive', 'cli-test',  'agent',   'Inactive Agent',1, 0, NULL,       1000, 1000),
      ('addr_cli_l', 'team',     'cli-lists', 'list',    'Team List',     1, 1, NULL,       1000, 1000);
  "
  db_exec "
    INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
    VALUES
      ('addr_cli_l', 'addr_cli_a', 1, 1000),
      ('addr_cli_l', 'addr_cli_b', 2, 1000);
  "
}

# --- CLI-01: flat success envelope {ok: true, ...} ---
test_cli01_success_envelope() {
  _cli_fixtures
  export INBOX_ADDRESS="alpha@cli-test"

  local result
  result=$("$INBOX_CMD" whoami --json 2>/dev/null)

  assert_json_ok "$result" "CLI-01: success envelope ok=true" || return 1
  assert_json_field "$result" '$.address' "alpha@cli-test" "CLI-01: address field" || return 1
  assert_json_field "$result" '$.kind' "agent" "CLI-01: kind field" || return 1
}

# --- CLI-02: flat error envelope {ok: false, error: ...} ---
test_cli02_error_envelope() {
  _cli_fixtures
  export INBOX_ADDRESS="nonexistent@nowhere"

  local result
  result=$("$INBOX_CMD" whoami --json 2>/dev/null) || true

  assert_json_error "$result" "not_found" "CLI-02: error envelope" || return 1
}

# --- CLI-03: --json mode stderr discipline (stderr silent) ---
test_cli03_json_stderr_silent() {
  _cli_fixtures
  export INBOX_ADDRESS="nonexistent@nowhere"

  local stderr_output
  stderr_output=$("$INBOX_CMD" whoami --json 2>&1 1>/dev/null) || true

  assert_eq "$stderr_output" "" "CLI-03: stderr silent in --json mode" || return 1
}

# --- CLI-04: wrong ID prefix -> invalid_argument ---
test_cli04_wrong_id_prefix() {
  _cli_fixtures
  export INBOX_ADDRESS="alpha@cli-test"

  # msg_ command with cnv_ prefix
  local result exit_code=0
  result=$("$INBOX_CMD" read "cnv_wrong_prefix" --json 2>/dev/null) || exit_code=$?

  assert_eq "$exit_code" "1" "CLI-04: exit code 1 for wrong prefix" || return 1
  assert_json_error "$result" "invalid_argument" "CLI-04: invalid_argument error" || return 1

  # thread command with msg_ prefix
  local result2 exit_code2=0
  result2=$("$INBOX_CMD" thread "msg_wrong_prefix" --json 2>/dev/null) || exit_code2=$?

  assert_eq "$exit_code2" "1" "CLI-04: exit code 1 for wrong thread prefix" || return 1
  assert_json_error "$result2" "invalid_argument" "CLI-04: invalid_argument for thread with msg_ prefix" || return 1
}

# --- CLI-05: multiple body sources -> invalid_argument ---
test_cli05_multiple_body_sources() {
  _cli_fixtures
  export INBOX_ADDRESS="alpha@cli-test"

  # --body + --body-file
  local result exit_code=0
  result=$(echo "" | "$INBOX_CMD" send --to beta@cli-test --body "inline" --body-file /dev/null --json 2>/dev/null) || exit_code=$?

  assert_eq "$exit_code" "1" "CLI-05: exit code 1 for multiple body sources" || return 1
  assert_json_error "$result" "invalid_argument" "CLI-05: invalid_argument for multiple body sources" || return 1
}

# --- CLI-06: --ref-file at exactly 1,048,576 bytes -> succeeds ---
test_cli06_ref_file_at_limit() {
  _cli_fixtures
  export INBOX_ADDRESS="alpha@cli-test"

  # Create a file of exactly 1,048,576 bytes (1 MiB) with safe content
  local ref_file="$_TEST_TMPDIR/ref_exact.txt"
  python3 -c "import sys; sys.stdout.buffer.write(b'A' * 1048576)" > "$ref_file"

  local result exit_code=0
  result=$("$INBOX_CMD" send --to beta@cli-test --body "test" --ref-file "text:$ref_file" --json 2>/dev/null) || exit_code=$?

  assert_eq "$exit_code" "0" "CLI-06: ref-file at exactly 1MiB succeeds" || return 1
  assert_json_ok "$result" "CLI-06: success envelope" || return 1
}

# --- CLI-07: --ref-file at 1,048,577 bytes -> invalid_argument ---
test_cli07_ref_file_over_limit() {
  _cli_fixtures
  export INBOX_ADDRESS="alpha@cli-test"

  # Create a file of 1,048,577 bytes (1 byte over limit) with safe content
  local ref_file="$_TEST_TMPDIR/ref_over.txt"
  python3 -c "import sys; sys.stdout.buffer.write(b'B' * 1048577)" > "$ref_file"

  local result exit_code=0
  result=$("$INBOX_CMD" send --to beta@cli-test --body "test" --ref-file "text:$ref_file" --json 2>/dev/null) || exit_code=$?

  assert_eq "$exit_code" "1" "CLI-07: ref-file over limit exit code 1" || return 1
  assert_json_error "$result" "invalid_argument" "CLI-07: invalid_argument for oversized ref-file" || return 1
}

# --- CLI-08: directory show for unlisted existing address -> succeeds ---
test_cli08_directory_show_unlisted() {
  _cli_fixtures
  export INBOX_ADDRESS="alpha@cli-test"

  # charlie@cli-test has is_listed=0
  local result exit_code=0
  result=$("$INBOX_CMD" directory show charlie@cli-test --json 2>/dev/null) || exit_code=$?

  assert_eq "$exit_code" "0" "CLI-08: directory show unlisted succeeds" || return 1
  assert_json_ok "$result" "CLI-08: success envelope" || return 1
  assert_json_field "$result" '$.address.address' "charlie@cli-test" "CLI-08: address matches" || return 1
  assert_json_field "$result" '$.address.is_listed' "0" "CLI-08: is_listed is false" || return 1
}

# --- CLI-09: directory show for nonexistent -> not_found ---
test_cli09_directory_show_nonexistent() {
  _cli_fixtures
  export INBOX_ADDRESS="alpha@cli-test"

  local result exit_code=0
  result=$("$INBOX_CMD" directory show ghost@nowhere --json 2>/dev/null) || exit_code=$?

  assert_eq "$exit_code" "2" "CLI-09: exit code 2 for not_found" || return 1
  assert_json_error "$result" "not_found" "CLI-09: not_found for nonexistent address" || return 1
}

# --- CLI-10: inactive acting address -> permission_denied ---
test_cli10_inactive_acting_address() {
  _cli_fixtures
  export INBOX_ADDRESS="inactive@cli-test"

  local result exit_code=0
  result=$("$INBOX_CMD" whoami --json 2>/dev/null) || exit_code=$?

  assert_eq "$exit_code" "4" "CLI-10: exit code 4 for permission_denied" || return 1
  assert_json_error "$result" "permission_denied" "CLI-10: permission_denied for inactive address" || return 1
}

# --- Register tests ---
run_test "CLI-01: flat success envelope"            test_cli01_success_envelope 4
run_test "CLI-02: flat error envelope"              test_cli02_error_envelope 4
run_test "CLI-03: --json stderr discipline"         test_cli03_json_stderr_silent 4
run_test "CLI-04: wrong ID prefix"                  test_cli04_wrong_id_prefix 4
run_test "CLI-05: multiple body sources"            test_cli05_multiple_body_sources 4
run_test "CLI-06: --ref-file at 1,048,576 bytes"    test_cli06_ref_file_at_limit 4
run_test "CLI-07: --ref-file at 1,048,577 bytes"    test_cli07_ref_file_over_limit 4
run_test "CLI-08: directory show unlisted"           test_cli08_directory_show_unlisted 4
run_test "CLI-09: directory show nonexistent"        test_cli09_directory_show_nonexistent 4
run_test "CLI-10: inactive acting address"           test_cli10_inactive_acting_address 4
