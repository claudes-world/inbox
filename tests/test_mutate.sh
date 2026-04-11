#!/usr/bin/env bash
# tests/test_mutate.sh — Gate 3: State mutation tests
# Tests MUT-01 through MUT-07 from the test matrix.
TEST_GATE=3

# --- Shared fixtures ---
_mutate_fixtures() {
  db_exec "
    INSERT INTO addresses (id, local_part, host, kind, display_name, is_listed, is_active, created_at_ms, updated_at_ms)
    VALUES
      ('addr_a', 'alice', 'test', 'agent', 'Alice', 1, 1, 1000, 1000),
      ('addr_b', 'bob',   'test', 'agent', 'Bob',   1, 1, 1000, 1000);
  "
}

# Helper: send a message from alice to bob, return msg_id
_send_alice_to_bob() {
  local result
  result=$(do_send "addr_a" "bob@test" "" "Test" "Hello" "normal" "[]")
  sqlite3 :memory: "SELECT json_extract('$result', '$.message_id');"
}

# --- MUT-01: read unread delivery -> becomes read, event appended ---
test_mut01_read_unread() {
  _mutate_fixtures
  local msg_id
  msg_id=$(_send_alice_to_bob)

  # Bob's delivery should be unread
  local before
  before=$(db_query "SELECT engagement_state FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")
  assert_eq "$before" "unread" "MUT-01: initial state unread"

  # Read it
  local result
  result=$(do_read "$msg_id" "addr_b" 0)
  assert_json_ok "$result" "MUT-01: read succeeds"
  assert_json_field "$result" '$.changed' '1' "MUT-01: changed=true"
  assert_json_field "$result" '$.engagement_state' 'read' "MUT-01: new state is read"

  # Verify delivery state in DB
  local after
  after=$(db_query "SELECT engagement_state FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")
  assert_eq "$after" "read" "MUT-01: DB state is read"

  # Verify event was appended
  local dly_id
  dly_id=$(db_query "SELECT id FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")
  local evt_count
  evt_count=$(db_count "SELECT count(*) FROM delivery_events WHERE delivery_id = '$dly_id' AND change_kind = 'read';")
  assert_eq "$evt_count" "1" "MUT-01: read event appended"
}

# --- MUT-02: read command on acknowledged delivery -> no-op, changed=false, no event ---
test_mut02_read_acknowledged_noop() {
  _mutate_fixtures
  local msg_id
  msg_id=$(_send_alice_to_bob)

  # Ack first
  do_ack "$msg_id" "addr_b" >/dev/null

  # Count events before read attempt
  local dly_id
  dly_id=$(db_query "SELECT id FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")
  local events_before
  events_before=$(db_count "SELECT count(*) FROM delivery_events WHERE delivery_id = '$dly_id';")

  # Try to read acknowledged delivery
  local result
  result=$(do_read "$msg_id" "addr_b" 0)
  assert_json_ok "$result" "MUT-02: read succeeds"
  assert_json_field "$result" '$.changed' '0' "MUT-02: changed=false"
  assert_json_field "$result" '$.engagement_state' 'acknowledged' "MUT-02: state still acknowledged"

  # No new event
  local events_after
  events_after=$(db_count "SELECT count(*) FROM delivery_events WHERE delivery_id = '$dly_id';")
  assert_eq "$events_after" "$events_before" "MUT-02: no new event"
}

# --- MUT-03: ack unread delivery -> acknowledged directly ---
test_mut03_ack_unread() {
  _mutate_fixtures
  local msg_id
  msg_id=$(_send_alice_to_bob)

  # Bob acks directly from unread
  local result
  result=$(do_ack "$msg_id" "addr_b")
  assert_json_ok "$result" "MUT-03: ack succeeds"
  assert_json_field "$result" '$.changed' '1' "MUT-03: changed=true"
  assert_json_field "$result" '$.engagement_state' 'acknowledged' "MUT-03: state acknowledged"

  # Verify DB
  local state
  state=$(db_query "SELECT engagement_state FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")
  assert_eq "$state" "acknowledged" "MUT-03: DB state acknowledged"
}

# --- MUT-04: hide already hidden -> no-op ---
test_mut04_hide_already_hidden() {
  _mutate_fixtures
  local msg_id
  msg_id=$(_send_alice_to_bob)

  # Hide first
  do_hide "$msg_id" "addr_b" >/dev/null

  # Count events
  local dly_id
  dly_id=$(db_query "SELECT id FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")
  local events_before
  events_before=$(db_count "SELECT count(*) FROM delivery_events WHERE delivery_id = '$dly_id';")

  # Hide again
  local result
  result=$(do_hide "$msg_id" "addr_b")
  assert_json_ok "$result" "MUT-04: hide no-op succeeds"
  assert_json_field "$result" '$.changed' '0' "MUT-04: changed=false"
  assert_json_field "$result" '$.visibility_state' 'hidden' "MUT-04: still hidden"

  # No new event
  local events_after
  events_after=$(db_count "SELECT count(*) FROM delivery_events WHERE delivery_id = '$dly_id';")
  assert_eq "$events_after" "$events_before" "MUT-04: no new event"
}

# --- MUT-05: unhide already active -> no-op ---
test_mut05_unhide_already_active() {
  _mutate_fixtures
  local msg_id
  msg_id=$(_send_alice_to_bob)

  # Count events
  local dly_id
  dly_id=$(db_query "SELECT id FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")
  local events_before
  events_before=$(db_count "SELECT count(*) FROM delivery_events WHERE delivery_id = '$dly_id';")

  # Unhide (already active)
  local result
  result=$(do_unhide "$msg_id" "addr_b")
  assert_json_ok "$result" "MUT-05: unhide no-op succeeds"
  assert_json_field "$result" '$.changed' '0' "MUT-05: changed=false"
  assert_json_field "$result" '$.visibility_state' 'active' "MUT-05: still active"

  # No new event
  local events_after
  events_after=$(db_count "SELECT count(*) FROM delivery_events WHERE delivery_id = '$dly_id';")
  assert_eq "$events_after" "$events_before" "MUT-05: no new event"
}

# --- MUT-06: sent hide / unhide -> visibility toggles, hidden_at semantics correct ---
test_mut06_sent_hide_unhide() {
  _mutate_fixtures
  local msg_id
  msg_id=$(_send_alice_to_bob)

  # Alice hides her sent item
  local hide_result
  hide_result=$(do_sent_hide "$msg_id" "addr_a")
  assert_json_ok "$hide_result" "MUT-06: sent hide succeeds"
  assert_json_field "$hide_result" '$.changed' '1' "MUT-06: hide changed=true"
  assert_json_field "$hide_result" '$.visibility_state' 'hidden' "MUT-06: visibility hidden"

  # Check hidden_at_ms is set
  local hidden_at
  hidden_at=$(db_query "SELECT hidden_at_ms FROM sent_items WHERE message_id = '$msg_id';")
  assert_neq "$hidden_at" "" "MUT-06: hidden_at_ms is set"

  # Alice unhides
  local unhide_result
  unhide_result=$(do_sent_unhide "$msg_id" "addr_a")
  assert_json_ok "$unhide_result" "MUT-06: sent unhide succeeds"
  assert_json_field "$unhide_result" '$.changed' '1' "MUT-06: unhide changed=true"
  assert_json_field "$unhide_result" '$.visibility_state' 'active' "MUT-06: visibility active"

  # hidden_at_ms should be NULL after unhide
  local hidden_at_after
  hidden_at_after=$(db_query "SELECT COALESCE(hidden_at_ms, 'NULL') FROM sent_items WHERE message_id = '$msg_id';")
  assert_eq "$hidden_at_after" "NULL" "MUT-06: hidden_at_ms cleared to NULL"

  # Verify inbox and sent are independent: bob's delivery should be unaffected
  local bob_vis
  bob_vis=$(db_query "SELECT visibility_state FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")
  assert_eq "$bob_vis" "active" "MUT-06: bob's delivery unaffected by sent hide/unhide"
}

# --- MUT-07: no-op mutation event suppression -> no delivery_events row appended ---
test_mut07_noop_no_event() {
  _mutate_fixtures
  local msg_id
  msg_id=$(_send_alice_to_bob)

  # Read the message (unread -> read)
  do_read "$msg_id" "addr_b" 0 >/dev/null

  local dly_id
  dly_id=$(db_query "SELECT id FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")

  # Count events now (should be 2: delivered + read)
  local events_after_read
  events_after_read=$(db_count "SELECT count(*) FROM delivery_events WHERE delivery_id = '$dly_id';")
  assert_eq "$events_after_read" "2" "MUT-07: 2 events after read (delivered + read)"

  # Read again (no-op)
  local result
  result=$(do_read "$msg_id" "addr_b" 0)
  assert_json_field "$result" '$.changed' '0' "MUT-07: read no-op changed=false"

  # Event count unchanged
  local events_after_noop
  events_after_noop=$(db_count "SELECT count(*) FROM delivery_events WHERE delivery_id = '$dly_id';")
  assert_eq "$events_after_noop" "$events_after_read" "MUT-07: no event from no-op read"

  # Ack (read -> acknowledged)
  do_ack "$msg_id" "addr_b" >/dev/null

  local events_after_ack
  events_after_ack=$(db_count "SELECT count(*) FROM delivery_events WHERE delivery_id = '$dly_id';")
  assert_eq "$events_after_ack" "3" "MUT-07: 3 events after ack"

  # Ack again (no-op)
  local ack_result
  ack_result=$(do_ack "$msg_id" "addr_b")
  assert_json_field "$ack_result" '$.changed' '0' "MUT-07: ack no-op changed=false"

  local events_after_ack_noop
  events_after_ack_noop=$(db_count "SELECT count(*) FROM delivery_events WHERE delivery_id = '$dly_id';")
  assert_eq "$events_after_ack_noop" "3" "MUT-07: no event from no-op ack"

  # Sent hide no-op
  local sent_hide_noop
  sent_hide_noop=$(do_sent_hide "$msg_id" "addr_a")
  assert_json_field "$sent_hide_noop" '$.changed' '1' "MUT-07: first sent hide changes"

  local sent_hide_noop2
  sent_hide_noop2=$(do_sent_hide "$msg_id" "addr_a")
  assert_json_field "$sent_hide_noop2" '$.changed' '0' "MUT-07: second sent hide is no-op"
}

# --- Register tests ---
run_test "MUT-01: read unread delivery"               test_mut01_read_unread
run_test "MUT-02: read acknowledged delivery (no-op)" test_mut02_read_acknowledged_noop
run_test "MUT-03: ack unread delivery"                test_mut03_ack_unread
run_test "MUT-04: hide already hidden (no-op)"        test_mut04_hide_already_hidden
run_test "MUT-05: unhide already active (no-op)"      test_mut05_unhide_already_active
run_test "MUT-06: sent hide / unhide"                 test_mut06_sent_hide_unhide
run_test "MUT-07: no-op event suppression"            test_mut07_noop_no_event
