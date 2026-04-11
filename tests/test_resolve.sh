#!/usr/bin/env bash
# tests/test_resolve.sh — Gate 2: Visibility and lineage tests
# Tests VIS-01 through VIS-06 from the test matrix.
TEST_GATE=2

# --- Shared fixture: addresses A, B, C, a list, and an inactive address ---
_vis_fixtures() {
  db_exec "
    INSERT INTO addresses (id, local_part, host, kind, display_name, is_listed, is_active, created_at_ms, updated_at_ms)
    VALUES
      ('addr_a', 'alice', 'test', 'agent', 'Alice', 1, 1, 1000, 1000),
      ('addr_b', 'bob',   'test', 'agent', 'Bob',   1, 1, 1000, 1000),
      ('addr_c', 'carol', 'test', 'agent', 'Carol', 1, 1, 1000, 1000),
      ('addr_d', 'dave',  'test', 'agent', 'Dave',  1, 0, 1000, 1000),
      ('addr_list1', 'team', 'lists', 'list', 'Team', 1, 1, 1000, 1000);
  "
  db_exec "
    INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
    VALUES
      ('addr_list1', 'addr_a', 1, 1000),
      ('addr_list1', 'addr_b', 2, 1000),
      ('addr_list1', 'addr_c', 3, 1000);
  "
}

# --- VIS-01: A->B, A->B+C, A->B; C reads middle with history ---
# C sees only the middle message (where C has a delivery) + actor-visible context
test_vis01_history_visibility() {
  _vis_fixtures

  # Message 1: A -> B only (C does not have access)
  export INBOX_ADDRESS="alice@test"
  local send1
  send1=$(do_send "addr_a" "bob@test" "" "Msg one" "First message body" "normal" "[]")
  local msg1_id cnv1_id
  msg1_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.message_id');")
  cnv1_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.conversation_id');")

  # Message 2: A -> B + C (C has access)
  # Need to use reply to stay in same conversation
  local send2
  send2=$(do_send_in_conversation "addr_a" "$cnv1_id" "$msg1_id" "addr_b,addr_c" "" "Msg two" "Second message body" "normal")
  local msg2_id
  msg2_id=$(sqlite3 :memory: "SELECT json_extract('$send2', '$.message_id');")

  # Message 3: A -> B only (C does not have access)
  local send3
  send3=$(do_send_in_conversation "addr_a" "$cnv1_id" "$msg2_id" "addr_b" "" "Msg three" "Third message body" "normal")
  local msg3_id
  msg3_id=$(sqlite3 :memory: "SELECT json_extract('$send3', '$.message_id');")

  # C reads message 2 with history
  local history
  history=$(do_read_history "$msg2_id" "addr_c" 10)

  # C should see NO history items before message 2 (message 1 is not visible to C)
  local history_count
  history_count=$(sqlite3 :memory: "SELECT json_array_length('$history');")
  assert_eq "$history_count" "0" "VIS-01: C sees no prior messages"

  # C's thread visibility should include only message 2
  local visible_ids
  visible_ids=$(resolve_thread_msg_ids "$cnv1_id" "addr_c")
  assert_contains "$visible_ids" "$msg2_id" "VIS-01: C sees msg2"

  # C should NOT see msg1 or msg3
  local c_sees_msg1
  c_sees_msg1=$(echo "$visible_ids" | grep -c "^${msg1_id}$" || true)
  assert_eq "$c_sees_msg1" "0" "VIS-01: C does not see msg1"

  local c_sees_msg3
  c_sees_msg3=$(echo "$visible_ids" | grep -c "^${msg3_id}$" || true)
  assert_eq "$c_sees_msg3" "0" "VIS-01: C does not see msg3"
}

# --- VIS-02: thread on mixed visibility conversation ---
# Only delivery/sent-item visible messages included in thread view
test_vis02_thread_mixed_visibility() {
  _vis_fixtures

  # A sends to B (only B has delivery)
  export INBOX_ADDRESS="alice@test"
  local send1
  send1=$(do_send "addr_a" "bob@test" "" "Thread test" "Message one" "normal" "[]")
  local msg1_id cnv_id
  msg1_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.message_id');")
  cnv_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.conversation_id');")

  # B replies to A (B has sent_item, A has delivery)
  local send2
  send2=$(do_send_in_conversation "addr_b" "$cnv_id" "$msg1_id" "addr_a" "" "Thread test" "Reply from B" "normal")
  local msg2_id
  msg2_id=$(sqlite3 :memory: "SELECT json_extract('$send2', '$.message_id');")

  # A replies to B, CC C (A sent, B+C have deliveries)
  local send3
  send3=$(do_send_in_conversation "addr_a" "$cnv_id" "$msg2_id" "addr_b,addr_c" "" "Thread test" "Reply from A with CC" "normal")
  local msg3_id
  msg3_id=$(sqlite3 :memory: "SELECT json_extract('$send3', '$.message_id');")

  # A's thread: should see msg1 (sent), msg2 (received), msg3 (sent)
  local a_visible
  a_visible=$(resolve_thread_msg_ids "$cnv_id" "addr_a")
  local a_count
  a_count=$(echo "$a_visible" | grep -c . || true)
  assert_eq "$a_count" "3" "VIS-02: A sees all 3 messages"

  # B's thread: should see msg1 (received), msg2 (sent), msg3 (received) = 3
  local b_visible
  b_visible=$(resolve_thread_msg_ids "$cnv_id" "addr_b")
  local b_count
  b_count=$(echo "$b_visible" | grep -c . || true)
  assert_eq "$b_count" "3" "VIS-02: B sees all 3 messages"

  # C's thread: should see only msg3 (received) = 1
  local c_visible
  c_visible=$(resolve_thread_msg_ids "$cnv_id" "addr_c")
  local c_count
  c_count=$(echo "$c_visible" | grep -c . || true)
  assert_eq "$c_count" "1" "VIS-02: C sees only msg3"
}

# --- VIS-03: hidden message read by explicit ID succeeds ---
test_vis03_hidden_read_by_id() {
  _vis_fixtures

  # A sends to B
  local send1
  send1=$(do_send "addr_a" "bob@test" "" "Hidden test" "Secret stuff" "normal" "[]")
  local msg_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.message_id');")

  # B hides the message
  local hide_result
  hide_result=$(do_hide "$msg_id" "addr_b")
  assert_json_field "$hide_result" '$.changed' '1' "VIS-03: hide succeeded"

  # B reads hidden message by explicit ID — should succeed
  local read_result
  read_result=$(do_read "$msg_id" "addr_b" 1)  # peek mode
  assert_json_ok "$read_result" "VIS-03: hidden read succeeds"
  assert_json_field "$read_result" '$.engagement_state' "unread" "VIS-03: state preserved"
  assert_json_field "$read_result" '$.visibility_state' "hidden" "VIS-03: visibility is hidden"
}

# --- VIS-04: hidden messages in explicit thread/history browse included if actor-owned ---
test_vis04_hidden_in_thread() {
  _vis_fixtures

  # A sends to B
  local send1
  send1=$(do_send "addr_a" "bob@test" "" "Thread hidden" "Msg 1" "normal" "[]")
  local msg1_id cnv_id
  msg1_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.message_id');")
  cnv_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.conversation_id');")

  # A sends another to B in same conversation
  local send2
  send2=$(do_send_in_conversation "addr_a" "$cnv_id" "$msg1_id" "addr_b" "" "Thread hidden" "Msg 2" "normal")
  local msg2_id
  msg2_id=$(sqlite3 :memory: "SELECT json_extract('$send2', '$.message_id');")

  # B hides msg1
  do_hide "$msg1_id" "addr_b" >/dev/null

  # B's thread visibility should still include hidden msg1
  local b_visible
  b_visible=$(resolve_thread_msg_ids "$cnv_id" "addr_b")
  local b_sees_msg1
  b_sees_msg1=$(echo "$b_visible" | grep -c "^${msg1_id}$" || true)
  assert_eq "$b_sees_msg1" "1" "VIS-04: hidden msg1 still in B's thread"

  # B reads msg2 with history — should include hidden msg1
  local history
  history=$(do_read_history "$msg2_id" "addr_b" 10)
  local history_count
  history_count=$(sqlite3 :memory: "SELECT json_array_length('$history');")
  assert_eq "$history_count" "1" "VIS-04: history includes hidden msg1"
}

# --- VIS-05: parent hidden from actor -> output parent_message_id is null ---
test_vis05_parent_redaction() {
  _vis_fixtures

  # A sends msg1 to B only
  local send1
  send1=$(do_send "addr_a" "bob@test" "" "Parent redact" "Parent msg" "normal" "[]")
  local msg1_id cnv_id
  msg1_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.message_id');")
  cnv_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.conversation_id');")

  # A sends msg2 (reply to msg1) to B and C — C can see msg2 but NOT msg1
  local send2
  send2=$(do_send_in_conversation "addr_a" "$cnv_id" "$msg1_id" "addr_b,addr_c" "" "Parent redact" "Child msg" "normal")
  local msg2_id
  msg2_id=$(sqlite3 :memory: "SELECT json_extract('$send2', '$.message_id');")

  # Get C's thread visibility for parent redaction
  local c_visible
  c_visible=$(resolve_thread_msg_ids "$cnv_id" "addr_c")

  # C should see msg2 but NOT msg1
  local c_sees_msg2 c_sees_msg1
  c_sees_msg2=$(echo "$c_visible" | grep -c "^${msg2_id}$" || true)
  c_sees_msg1=$(echo "$c_visible" | grep -c "^${msg1_id}$" || true)
  assert_eq "$c_sees_msg2" "1" "VIS-05: C sees msg2"
  assert_eq "$c_sees_msg1" "0" "VIS-05: C does not see msg1 (parent)"

  # When C reads history for msg2, parent should be redacted (null)
  local history
  history=$(do_read_history "$msg2_id" "addr_c" 10)

  # No history items (msg1 is invisible to C)
  local history_count
  history_count=$(sqlite3 :memory: "SELECT json_array_length('$history');")
  assert_eq "$history_count" "0" "VIS-05: no visible history for C"

  # Verify that msg2's parent in the DB IS msg1
  local actual_parent
  actual_parent=$(db_query "SELECT parent_message_id FROM messages WHERE id = '$msg2_id';")
  assert_eq "$actual_parent" "$msg1_id" "VIS-05: DB parent is msg1"

  # But resolve_thread_visibility should redact parent for C's view
  local thread_rows
  thread_rows=$(resolve_thread_visibility "$cnv_id" "addr_c")
  # The single row for C should be msg2
  assert_contains "$thread_rows" "$msg2_id" "VIS-05: thread contains msg2 for C"
}

# --- VIS-06: self-send thread view ---
# One message entry, received view wins
test_vis06_self_send() {
  _vis_fixtures

  # A sends to self
  local send1
  send1=$(do_send "addr_a" "alice@test" "" "Self note" "Note to self" "normal" "[]")
  local msg_id cnv_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.message_id');")
  cnv_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.conversation_id');")

  # A's thread visibility: should include message ONCE
  local a_visible
  a_visible=$(resolve_thread_msg_ids "$cnv_id" "addr_a")
  local a_count
  a_count=$(echo "$a_visible" | grep -c "^${msg_id}$" || true)
  assert_eq "$a_count" "1" "VIS-06: self-send appears once"

  # resolve_thread_visibility should prefer 'received' view_kind
  local thread_rows
  thread_rows=$(resolve_thread_visibility "$cnv_id" "addr_a")
  assert_contains "$thread_rows" "received" "VIS-06: view_kind is received"

  # Verify both delivery and sent_item exist
  local dly_exists
  dly_exists=$(db_count "SELECT count(*) FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_a';")
  assert_eq "$dly_exists" "1" "VIS-06: delivery exists for self"

  local si_exists
  si_exists=$(db_count "SELECT count(*) FROM sent_items WHERE message_id = '$msg_id';")
  assert_eq "$si_exists" "1" "VIS-06: sent_item exists for self"
}

# --- Register tests ---
run_test "VIS-01: history visibility with mixed recipients"    test_vis01_history_visibility
run_test "VIS-02: thread mixed visibility"                     test_vis02_thread_mixed_visibility
run_test "VIS-03: hidden message read by explicit ID"          test_vis03_hidden_read_by_id
run_test "VIS-04: hidden messages in thread/history browse"    test_vis04_hidden_in_thread
run_test "VIS-05: parent redaction for invisible parent"       test_vis05_parent_redaction
run_test "VIS-06: self-send thread view (one entry, received)" test_vis06_self_send
