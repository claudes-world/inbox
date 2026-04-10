#!/usr/bin/env bash
# tests/test_security.sh — Security tests: SQL injection, input validation, isolation.
TEST_GATE=7

# --- Shared fixtures ---
_security_fixtures() {
  db_exec "
    INSERT INTO addresses (id, local_part, host, kind, display_name, is_listed, is_active, created_at_ms, updated_at_ms)
    VALUES
      ('addr_a', 'alice',   'test',  'agent', 'Alice', 1, 1, 1000, 1000),
      ('addr_b', 'bob',     'test',  'agent', 'Bob',   1, 1, 1000, 1000);
  "
}

# --- SEC-01: SQL injection via INBOX_ADDRESS (single quote in local part) ---
test_sec01_sqli_inbox_address() {
  _security_fixtures

  # Try to set INBOX_ADDRESS to something with a single quote
  local old_addr="$INBOX_ADDRESS"
  export INBOX_ADDRESS="alice'--@test"

  local result rc=0
  result=$(resolve_actor 2>&1) || rc=$?

  # Should get not_found (the address doesn't exist), NOT a SQL error
  assert_neq "$rc" "5" "SEC-01: should not be internal error (SQL error)"
  # rc should be 2 (not_found) since the escaped address won't match
  assert_eq "$rc" "2" "SEC-01: should be not_found for injected address"

  export INBOX_ADDRESS="$old_addr"
}

# --- SEC-02: SQL injection via --to recipient address ---
test_sec02_sqli_to_recipient() {
  _security_fixtures

  # Try sending to an address with SQL injection payload
  local result rc=0
  result=$(do_send "addr_a" "bob'OR'1'='1@test" "" "Test" "Hello" "normal" "[]" 2>&1) || rc=$?

  # Should fail gracefully (not_found or invalid_argument), not with SQL error
  assert_neq "$rc" "5" "SEC-02: should not be internal error (SQL error)"
}

# --- SEC-03: SQL injection via message body ---
test_sec03_sqli_message_body() {
  _security_fixtures

  # Send a message with SQL injection in the body
  local sqli_body="Hello'); DROP TABLE messages;--"
  local result rc=0
  result=$(do_send "addr_a" "bob@test" "" "Test" "$sqli_body" "normal" "[]" 2>&1) || rc=$?

  # Should succeed — the body is just stored as text
  assert_eq "$rc" "0" "SEC-03: send with SQL in body should succeed"

  # Verify the messages table still exists and the body was stored literally
  local msg_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$(sql_escape "$result")', '\$.message_id');")

  local stored_body
  stored_body=$(db_query "SELECT body FROM messages WHERE id = '$msg_id';")
  assert_eq "$stored_body" "$sqli_body" "SEC-03: body stored literally without SQL execution"

  # Verify messages table is intact
  local msg_count
  msg_count=$(db_count "SELECT count(*) FROM messages;")
  assert_eq "$msg_count" "1" "SEC-03: messages table intact (not dropped)"
}

# --- SEC-04: SQL injection via --ref kind:value with quotes ---
test_sec04_sqli_ref_value() {
  _security_fixtures

  # Send with a ref value containing SQL injection
  local refs_json='[{"kind":"path","value":"/foo'\''bar; DROP TABLE messages;--","label":null,"mime_type":null,"metadata":null}]'
  local result rc=0
  result=$(do_send "addr_a" "bob@test" "" "Test" "Hello" "normal" "$refs_json" 2>&1) || rc=$?

  # Should succeed or fail gracefully, not crash
  # The ref value should be escaped properly
  if [[ "$rc" -eq 0 ]]; then
    # Verify messages table still exists
    local msg_count
    msg_count=$(db_count "SELECT count(*) FROM messages;")
    assert_neq "$msg_count" "0" "SEC-04: messages table intact after ref injection"
  fi
  # Either way, should not be internal error from SQL crash
  assert_neq "$rc" "5" "SEC-04: should not be internal error (SQL crash)"
}

# --- SEC-05: Experimental mode should not mutate protocol tables ---
test_sec05_experimental_no_protocol_mutation() {
  _security_fixtures

  # Enable experimental mode
  export INBOX_EXPERIMENTAL_MODE="1"
  export INBOX_EXPERIMENTAL_PROFILE="core"
  export INBOX_EXPERIMENTAL_CAPTURE="safe"
  export INBOX_EXPERIMENTAL_LOG="${_TEST_TMPDIR}/feedback.ndjson"
  experimental_init
  telemetry_init

  # Get initial row counts
  local addr_count_before msg_count_before dly_count_before
  addr_count_before=$(db_count "SELECT count(*) FROM addresses;")
  msg_count_before=$(db_count "SELECT count(*) FROM messages;")
  dly_count_before=$(db_count "SELECT count(*) FROM deliveries;")

  # Probe an experimental feature
  local probe_result rc=0
  export INBOX_JSON_MODE="1"
  probe_result=$(experimental_probe "forward" "verb" 2>&1) || rc=$?
  assert_eq "$rc" "6" "SEC-05: probe returns EXIT_COMING_SOON"

  # Verify no protocol tables were mutated
  local addr_count_after msg_count_after dly_count_after
  addr_count_after=$(db_count "SELECT count(*) FROM addresses;")
  msg_count_after=$(db_count "SELECT count(*) FROM messages;")
  dly_count_after=$(db_count "SELECT count(*) FROM deliveries;")

  assert_eq "$addr_count_after" "$addr_count_before" "SEC-05: addresses unchanged"
  assert_eq "$msg_count_after" "$msg_count_before" "SEC-05: messages unchanged"
  assert_eq "$dly_count_after" "$dly_count_before" "SEC-05: deliveries unchanged"

  export INBOX_EXPERIMENTAL_MODE="0"
  export INBOX_JSON_MODE="0"
}

# --- SEC-06: give-feedback does not write to protocol tables ---
test_sec06_give_feedback_no_protocol_writes() {
  _security_fixtures

  export INBOX_EXPERIMENTAL_LOG="${_TEST_TMPDIR}/feedback.ndjson"

  # Get initial protocol table counts
  local addr_count msg_count dly_count conv_count
  addr_count=$(db_count "SELECT count(*) FROM addresses;")
  msg_count=$(db_count "SELECT count(*) FROM messages;")
  dly_count=$(db_count "SELECT count(*) FROM deliveries;")
  conv_count=$(db_count "SELECT count(*) FROM conversations;")

  # Record feedback
  local feedback_id
  feedback_id=$(do_give_feedback "addr_a" "forward" "verb" "I want to forward messages" "testing" "" "")

  # Verify feedback was recorded to NDJSON, NOT to any protocol table
  assert_neq "$feedback_id" "" "SEC-06: feedback_id returned"

  # Check NDJSON file was written
  local ndjson_lines
  ndjson_lines=$(wc -l < "${_TEST_TMPDIR}/feedback.ndjson")
  assert_eq "$ndjson_lines" "1" "SEC-06: one NDJSON line written"

  # Verify NO protocol table mutations
  assert_eq "$(db_count "SELECT count(*) FROM addresses;")" "$addr_count" "SEC-06: addresses unchanged"
  assert_eq "$(db_count "SELECT count(*) FROM messages;")" "$msg_count" "SEC-06: messages unchanged"
  assert_eq "$(db_count "SELECT count(*) FROM deliveries;")" "$dly_count" "SEC-06: deliveries unchanged"
  assert_eq "$(db_count "SELECT count(*) FROM conversations;")" "$conv_count" "SEC-06: conversations unchanged"
}

# --- SEC-07: --kind enum validation rejects invalid values ---
test_sec07_kind_enum_validation() {
  _security_fixtures

  # parse_ref validates ref kind
  local rc=0
  REF_KIND="" REF_VALUE=""
  export INBOX_JSON_MODE="1"
  parse_ref "invalid_kind:some_value" 2>/dev/null || rc=$?
  assert_neq "$rc" "0" "SEC-07: invalid ref kind rejected"
  export INBOX_JSON_MODE="0"
}

# --- SEC-08: SQL injection via subject field ---
test_sec08_sqli_subject() {
  _security_fixtures

  local sqli_subject="Test'); DELETE FROM deliveries;--"
  local result rc=0
  result=$(do_send "addr_a" "bob@test" "" "$sqli_subject" "Hello" "normal" "[]" 2>&1) || rc=$?

  assert_eq "$rc" "0" "SEC-08: send with SQL in subject should succeed"

  # Verify deliveries exist (not deleted by injection)
  local dly_count
  dly_count=$(db_count "SELECT count(*) FROM deliveries;")
  assert_neq "$dly_count" "0" "SEC-08: deliveries not deleted"

  # Verify subject stored literally
  local msg_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$(sql_escape "$result")', '\$.message_id');")
  local stored_subject
  stored_subject=$(db_query "SELECT subject FROM messages WHERE id = '$msg_id';")
  assert_eq "$stored_subject" "$sqli_subject" "SEC-08: subject stored literally"
}

# --- SEC-09: SQL injection via urgency field ---
test_sec09_sqli_urgency() {
  _security_fixtures

  # Urgency is validated by validate_urgency in the CLI layer,
  # but test the library layer directly with a malicious value
  local sqli_urgency="normal'; DROP TABLE deliveries;--"
  local result rc=0
  result=$(do_send "addr_a" "bob@test" "" "Test" "Hello" "$sqli_urgency" "[]" 2>&1) || rc=$?

  # Even if validation is bypassed, SQL escaping should prevent damage
  # The send may succeed (storing the string literally) or fail gracefully
  assert_neq "$rc" "5" "SEC-09: should not be internal error from SQL injection"

  # Verify deliveries table still exists
  local table_exists
  table_exists=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='deliveries';")
  assert_eq "$table_exists" "1" "SEC-09: deliveries table still exists"
}

# --- SEC-10: SQL injection via directory show address ---
test_sec10_sqli_directory_show() {
  _security_fixtures

  # lookup_address_by_string with injection attempt
  local result
  result=$(lookup_address_by_string "alice'--@test")

  # Should return empty (not found), not crash
  assert_eq "$result" "" "SEC-10: injected address lookup returns empty"

  # Verify addresses table still intact
  local addr_count
  addr_count=$(db_count "SELECT count(*) FROM addresses;")
  assert_eq "$addr_count" "2" "SEC-10: addresses table intact"
}

# --- SEC-11: json_escape handles all special characters ---
test_sec11_json_escape_special_chars() {
  # Test double quote
  local result
  result=$(json_escape 'say "hello"')
  assert_eq "$result" 'say \"hello\"' "SEC-11: double quote escaped"

  # Test backslash
  result=$(json_escape 'path\to\file')
  assert_eq "$result" 'path\\to\\file' "SEC-11: backslash escaped"

  # Test newline
  result=$(json_escape $'line1\nline2')
  assert_eq "$result" 'line1\nline2' "SEC-11: newline escaped"

  # Test tab
  result=$(json_escape $'col1\tcol2')
  assert_eq "$result" 'col1\tcol2' "SEC-11: tab escaped"

  # Test carriage return
  result=$(json_escape $'line1\rline2')
  assert_eq "$result" 'line1\rline2' "SEC-11: carriage return escaped"

  # Test combined
  result=$(json_escape $'say "hi"\nand\\bye')
  assert_eq "$result" 'say \"hi\"\nand\\bye' "SEC-11: combined escaping"
}

# --- SEC-12: sql_escape function works ---
test_sec12_sql_escape() {
  local result

  # Single quote doubled
  result=$(sql_escape "O'Brien")
  assert_eq "$result" "O''Brien" "SEC-12: single quote doubled"

  # Multiple single quotes
  result=$(sql_escape "it's a 'test'")
  assert_eq "$result" "it''s a ''test''" "SEC-12: multiple quotes"

  # No quotes unchanged
  result=$(sql_escape "normal text")
  assert_eq "$result" "normal text" "SEC-12: no quotes unchanged"

  # Empty string
  result=$(sql_escape "")
  assert_eq "$result" "" "SEC-12: empty string unchanged"
}

# --- Register tests ---
run_test "SEC-01: SQL injection via INBOX_ADDRESS" test_sec01_sqli_inbox_address
run_test "SEC-02: SQL injection via --to recipient" test_sec02_sqli_to_recipient
run_test "SEC-03: SQL injection via message body" test_sec03_sqli_message_body
run_test "SEC-04: SQL injection via --ref value" test_sec04_sqli_ref_value
run_test "SEC-05: experimental mode no protocol mutation" test_sec05_experimental_no_protocol_mutation
run_test "SEC-06: give-feedback no protocol writes" test_sec06_give_feedback_no_protocol_writes
run_test "SEC-07: --kind enum validation rejects invalid" test_sec07_kind_enum_validation
run_test "SEC-08: SQL injection via subject" test_sec08_sqli_subject
run_test "SEC-09: SQL injection via urgency" test_sec09_sqli_urgency
run_test "SEC-10: SQL injection via directory address" test_sec10_sqli_directory_show
run_test "SEC-11: json_escape special characters" test_sec11_json_escape_special_chars
run_test "SEC-12: sql_escape function" test_sec12_sql_escape
