#!/usr/bin/env bash
# tests/test_schema.sh — Gate 1: Schema and trigger tests
# Tests SCH-01 through SCH-07 from the test matrix.
TEST_GATE=1

# --- Shared fixture setup ---
# Creates baseline addresses needed by most tests.
_schema_fixtures() {
  db_exec "
    INSERT INTO addresses (id, local_part, host, kind, display_name, is_listed, is_active, created_at_ms, updated_at_ms)
    VALUES
      ('addr_agent1', 'agent1', 'vps-1', 'agent', 'Agent One', 1, 1, 1000, 1000),
      ('addr_agent2', 'agent2', 'vps-1', 'agent', 'Agent Two', 1, 1, 1000, 1000),
      ('addr_human1', 'human1', 'vps-1', 'human', 'Human One', 1, 1, 1000, 1000),
      ('addr_list1',  'team',   'lists', 'list',  'Team List', 1, 1, 1000, 1000),
      ('addr_list2',  'other',  'lists', 'list',  'Other List', 1, 1, 1000, 1000);
  " || return 1
}

# --- SCH-01: list address used as sender → insert rejected ---
test_sch01_list_sender_rejected() {
  _schema_fixtures || return 1

  # Create a conversation first
  db_exec "INSERT INTO conversations (id, created_at_ms) VALUES ('cnv_01', 2000);" || return 1

  # Attempt to insert a message with a list address as sender
  local output
  output=$(db_exec "
    INSERT INTO messages (id, conversation_id, sender_address_id, body, created_at_ms)
    VALUES ('msg_01', 'cnv_01', 'addr_list1', 'hello', 3000);
  " 2>&1) && {
    echo "ASSERTION FAILED: SCH-01 — expected insert to be rejected, but it succeeded" >&2
    return 1
  }

  assert_contains "$output" "list address cannot send messages" "SCH-01: trigger message"
}

# --- SCH-02: nested list member insert → rejected ---
test_sch02_nested_list_rejected() {
  _schema_fixtures || return 1

  # Add a valid member first
  db_exec "
    INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
    VALUES ('addr_list1', 'addr_agent1', 1, 2000);
  " || return 1

  # Attempt to add a list as a member of another list
  local output
  output=$(db_exec "
    INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
    VALUES ('addr_list1', 'addr_list2', 2, 2000);
  " 2>&1) && {
    echo "ASSERTION FAILED: SCH-02 — expected insert to be rejected, but it succeeded" >&2
    return 1
  }

  assert_contains "$output" "nested lists are not allowed" "SCH-02: trigger message"
}

# --- SCH-03: address.kind mutation → rejected ---
test_sch03_kind_immutable() {
  _schema_fixtures || return 1

  # Attempt to change kind from 'agent' to 'human'
  local output
  output=$(db_exec "
    UPDATE addresses SET kind = 'human' WHERE id = 'addr_agent1';
  " 2>&1) && {
    echo "ASSERTION FAILED: SCH-03 — expected update to be rejected, but it succeeded" >&2
    return 1
  }

  assert_contains "$output" "address kind is immutable" "SCH-03: trigger message"
}

# --- SCH-04: duplicate delivery for same (message_id, recipient) → rejected ---
test_sch04_duplicate_delivery_rejected() {
  _schema_fixtures || return 1

  # Create conversation + message
  db_exec "INSERT INTO conversations (id, created_at_ms) VALUES ('cnv_04', 2000);" || return 1
  db_exec "
    INSERT INTO messages (id, conversation_id, sender_address_id, body, created_at_ms)
    VALUES ('msg_04', 'cnv_04', 'addr_agent1', 'hello', 3000);
  " || return 1

  # First delivery should succeed
  db_exec "
    INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, delivered_at_ms)
    VALUES ('dly_04a', 'msg_04', 'addr_agent2', 'to', 3000);
  " || return 1

  # Duplicate delivery (same message_id + recipient_address_id) should fail
  local output
  output=$(db_exec "
    INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, delivered_at_ms)
    VALUES ('dly_04b', 'msg_04', 'addr_agent2', 'cc', 3000);
  " 2>&1) && {
    echo "ASSERTION FAILED: SCH-04 — expected duplicate delivery to be rejected, but it succeeded" >&2
    return 1
  }

  assert_contains "$output" "UNIQUE constraint failed" "SCH-04: unique violation"
}

# --- SCH-05: group member ordering uses unique ordinal ---
test_sch05_group_ordering() {
  _schema_fixtures || return 1

  # Add members with specific ordinals
  db_exec "
    INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
    VALUES ('addr_list1', 'addr_agent1', 1, 2000);
  " || return 1
  db_exec "
    INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
    VALUES ('addr_list1', 'addr_agent2', 2, 2000);
  " || return 1

  # Verify ordering is deterministic via index
  local result
  result=$(db_query "
    SELECT member_address_id FROM group_members
    WHERE group_address_id = 'addr_list1'
    ORDER BY ordinal, member_address_id;
  ")

  assert_eq "$result" "addr_agent1
addr_agent2" "SCH-05: deterministic ordering"
}

# --- SCH-05b: duplicate ordinal within same group → rejected ---
test_sch05b_duplicate_ordinal_rejected() {
  _schema_fixtures || return 1

  # First insert should succeed
  db_exec "
    INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
    VALUES ('addr_list1', 'addr_agent1', 1, 2000);
  " || return 1

  # Second insert with same ordinal for the same group should fail UNIQUE constraint
  local output
  output=$(db_exec "
    INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
    VALUES ('addr_list1', 'addr_agent2', 1, 2000);
  " 2>&1) && {
    echo "ASSERTION FAILED: SCH-05b — expected duplicate ordinal to be rejected, but it succeeded" >&2
    return 1
  }

  assert_contains "$output" "UNIQUE constraint failed" "SCH-05b: duplicate ordinal rejected"
}

# --- SCH-06: delivered event with non-null actor → rejected ---
test_sch06_delivered_event_no_actor() {
  _schema_fixtures || return 1

  # Setup: conversation → message → delivery
  db_exec "INSERT INTO conversations (id, created_at_ms) VALUES ('cnv_06', 2000);" || return 1
  db_exec "
    INSERT INTO messages (id, conversation_id, sender_address_id, body, created_at_ms)
    VALUES ('msg_06', 'cnv_06', 'addr_agent1', 'hello', 3000);
  " || return 1
  db_exec "
    INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, delivered_at_ms)
    VALUES ('dly_06', 'msg_06', 'addr_agent2', 'to', 3000);
  " || return 1

  # Attempt delivered event with non-null actor_address_id — should fail CHECK constraint
  local output
  output=$(db_exec "
    INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
    VALUES ('evt_06', 'dly_06', 'delivered', 'delivered', 'addr_agent1', 3000, 'unread', 'active');
  " 2>&1) && {
    echo "ASSERTION FAILED: SCH-06 — expected insert to be rejected, but it succeeded" >&2
    return 1
  }

  assert_contains "$output" "CHECK constraint failed" "SCH-06: CHECK constraint"
}

# --- SCH-07: state_changed event with null actor → rejected ---
test_sch07_state_changed_needs_actor() {
  _schema_fixtures || return 1

  # Setup: conversation → message → delivery
  db_exec "INSERT INTO conversations (id, created_at_ms) VALUES ('cnv_07', 2000);" || return 1
  db_exec "
    INSERT INTO messages (id, conversation_id, sender_address_id, body, created_at_ms)
    VALUES ('msg_07', 'cnv_07', 'addr_agent1', 'hello', 3000);
  " || return 1
  db_exec "
    INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, delivered_at_ms)
    VALUES ('dly_07', 'msg_07', 'addr_agent2', 'to', 3000);
  " || return 1

  # Attempt state_changed event with null actor_address_id — should fail CHECK constraint
  local output
  output=$(db_exec "
    INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
    VALUES ('evt_07', 'dly_07', 'state_changed', 'read', NULL, 3000, 'read', 'active');
  " 2>&1) && {
    echo "ASSERTION FAILED: SCH-07 — expected insert to be rejected, but it succeeded" >&2
    return 1
  }

  assert_contains "$output" "CHECK constraint failed" "SCH-07: CHECK constraint"
}

# --- Register tests ---
run_test "SCH-01: list address as sender rejected"           test_sch01_list_sender_rejected
run_test "SCH-02: nested list member rejected"               test_sch02_nested_list_rejected
run_test "SCH-03: address.kind mutation rejected"            test_sch03_kind_immutable
run_test "SCH-04: duplicate delivery rejected"               test_sch04_duplicate_delivery_rejected
run_test "SCH-05: group member ordering deterministic"       test_sch05_group_ordering
run_test "SCH-05b: duplicate ordinal within group rejected"  test_sch05b_duplicate_ordinal_rejected
run_test "SCH-06: delivered event with actor rejected"       test_sch06_delivered_event_no_actor
run_test "SCH-07: state_changed event without actor rejected" test_sch07_state_changed_needs_actor
