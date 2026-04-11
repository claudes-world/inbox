#!/usr/bin/env bash
# tests/test_write.sh — Gate 3: Send and reply tests
# Tests WR-01 through WR-10 from the test matrix.
TEST_GATE=3

# --- Shared fixtures ---
_write_fixtures() {
  db_exec "
    INSERT INTO addresses (id, local_part, host, kind, display_name, is_listed, is_active, created_at_ms, updated_at_ms)
    VALUES
      ('addr_a',     'alice',   'test',  'agent', 'Alice',     1, 1, 1000, 1000),
      ('addr_b',     'bob',     'test',  'agent', 'Bob',       1, 1, 1000, 1000),
      ('addr_c',     'carol',   'test',  'agent', 'Carol',     1, 1, 1000, 1000),
      ('addr_d',     'dave',    'test',  'agent', 'Dave',      1, 0, 1000, 1000),
      ('addr_e',     'eve',     'test',  'agent', 'Eve',       1, 1, 1000, 1000),
      ('addr_list1', 'team',    'lists', 'list',  'Team',      1, 1, 1000, 1000),
      ('addr_list2', 'empty',   'lists', 'list',  'Empty',     1, 1, 1000, 1000),
      ('addr_list3', 'inactive','lists', 'list',  'Inactive',  1, 0, 1000, 1000);
  "
  # team@lists: alice, bob, carol
  db_exec "
    INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
    VALUES
      ('addr_list1', 'addr_a', 1, 1000),
      ('addr_list1', 'addr_b', 2, 1000),
      ('addr_list1', 'addr_c', 3, 1000);
  "
  # empty@lists has no members
  # inactive@lists has member but list itself is inactive
  db_exec "
    INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
    VALUES ('addr_list3', 'addr_a', 1, 1000);
  "
}

# --- WR-01: inactive direct recipient -> invalid_state ---
test_wr01_inactive_direct_recipient() {
  _write_fixtures

  local result
  result=$(do_send "addr_a" "dave@test" "" "Test" "Hello" "normal" "[]" 2>&1) || true

  assert_json_error "$result" "invalid_state" "WR-01: inactive recipient"
}

# --- WR-02: inactive list addressed directly -> invalid_state ---
test_wr02_inactive_list_direct() {
  _write_fixtures

  local result
  result=$(do_send "addr_a" "inactive@lists" "" "Test" "Hello" "normal" "[]" 2>&1) || true

  assert_json_error "$result" "invalid_state" "WR-02: inactive list"
}

# --- WR-03: active list with zero active members -> invalid_state ---
test_wr03_empty_list_no_recipients() {
  _write_fixtures

  local result
  result=$(do_send "addr_a" "empty@lists" "" "Test" "Hello" "normal" "[]" 2>&1) || true

  assert_json_error "$result" "invalid_state" "WR-03: empty list"
}

# --- WR-04: direct + list overlap -> one delivery, multiple delivery_sources ---
test_wr04_direct_list_overlap() {
  _write_fixtures

  # Send to bob (direct) and team@lists (which includes bob)
  local result
  result=$(do_send "addr_e" "bob@test,team@lists" "" "Overlap" "Hello" "normal" "[]")
  assert_json_ok "$result" "WR-04: send succeeds"

  local msg_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$result', '$.message_id');")

  # Bob should have exactly ONE delivery
  local dly_count
  dly_count=$(db_count "SELECT count(*) FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")
  assert_eq "$dly_count" "1" "WR-04: one delivery for bob"

  # Bob's delivery should have multiple sources
  local bob_dly_id
  bob_dly_id=$(db_query "SELECT id FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")

  local src_count
  src_count=$(db_count "SELECT count(*) FROM delivery_sources WHERE delivery_id = '$bob_dly_id';")

  # Should have at least 2 sources: direct 'to' + list expansion 'to'
  assert_eq "$([ "$src_count" -ge 2 ] && echo true || echo false)" "true" "WR-04: multiple delivery_sources for bob (got $src_count)"

  # Effective role should be 'to' (highest precedence)
  local eff_role
  eff_role=$(db_query "SELECT effective_role FROM deliveries WHERE id = '$bob_dly_id';")
  assert_eq "$eff_role" "to" "WR-04: effective_role is to"
}

# --- WR-05: reply-all after list membership change ---
# Reply expands current list membership, not old snapshot
test_wr05_reply_all_membership_change() {
  _write_fixtures

  # Eve sends to team@lists
  local send1
  send1=$(do_send "addr_e" "team@lists" "" "Team msg" "Hello team" "normal" "[]")
  assert_json_ok "$send1" "WR-05: initial send"
  local msg1_id
  msg1_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.message_id');")

  # Now change list membership: remove carol, add dave (make dave active first)
  db_exec "UPDATE addresses SET is_active = 1 WHERE id = 'addr_d';"
  db_exec "DELETE FROM group_members WHERE group_address_id = 'addr_list1' AND member_address_id = 'addr_c';"
  db_exec "INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms) VALUES ('addr_list1', 'addr_d', 4, 2000);"

  # Alice (member of team) does reply-all
  local reply_result
  reply_result=$(do_reply "addr_a" "$msg1_id" 1 "" "" "" "Reply from alice" "normal")
  assert_json_ok "$reply_result" "WR-05: reply-all succeeds"

  local reply_msg_id
  reply_msg_id=$(sqlite3 :memory: "SELECT json_extract('$reply_result', '$.message_id');")

  # Dave (new member) should have a delivery
  local dave_dly
  dave_dly=$(db_count "SELECT count(*) FROM deliveries WHERE message_id = '$reply_msg_id' AND recipient_address_id = 'addr_d';")
  assert_eq "$dave_dly" "1" "WR-05: dave (new member) has delivery"

  # Carol (removed member) should NOT have a delivery for the reply
  local carol_dly
  carol_dly=$(db_count "SELECT count(*) FROM deliveries WHERE message_id = '$reply_msg_id' AND recipient_address_id = 'addr_c';")
  assert_eq "$carol_dly" "0" "WR-05: carol (removed member) has no delivery"
}

# --- WR-06: reply-all plus explicit extra recipients ---
# Extras additive, acting address excluded
test_wr06_reply_all_extra_recipients() {
  _write_fixtures

  # Alice sends to Bob
  local send1
  send1=$(do_send "addr_a" "bob@test" "" "Direct msg" "Hello bob" "normal" "[]")
  local msg_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.message_id');")

  # Bob does reply-all with explicit extra --cc carol
  local reply_result
  reply_result=$(do_reply "addr_b" "$msg_id" 1 "" "addr_c" "" "Reply with extra" "normal")
  assert_json_ok "$reply_result" "WR-06: reply-all with extra"

  local reply_msg_id
  reply_msg_id=$(sqlite3 :memory: "SELECT json_extract('$reply_result', '$.message_id');")

  # Carol should have a delivery
  local carol_dly
  carol_dly=$(db_count "SELECT count(*) FROM deliveries WHERE message_id = '$reply_msg_id' AND recipient_address_id = 'addr_c';")
  assert_eq "$carol_dly" "1" "WR-06: carol (extra CC) has delivery"

  # Alice (original sender) should have a delivery
  local alice_dly
  alice_dly=$(db_count "SELECT count(*) FROM deliveries WHERE message_id = '$reply_msg_id' AND recipient_address_id = 'addr_a';")
  assert_eq "$alice_dly" "1" "WR-06: alice (original sender) has delivery"

  # Bob (acting) should NOT have a delivery (excluded as actor)
  # UNLESS bob sent it to himself. Check: bob IS the sender, so bob has sent_item.
  # Bob should not be in the recipient list since actor is excluded.
  local bob_dly
  bob_dly=$(db_count "SELECT count(*) FROM deliveries WHERE message_id = '$reply_msg_id' AND recipient_address_id = 'addr_b';")
  assert_eq "$bob_dly" "0" "WR-06: bob (acting) excluded from recipients"
}

# --- WR-07: reply to sent message -> succeeds via sent resolver ---
test_wr07_reply_to_sent() {
  _write_fixtures

  # Alice sends to Bob
  local send1
  send1=$(do_send "addr_a" "bob@test" "" "Sent view reply" "Hello" "normal" "[]")
  local msg_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.message_id');")

  # Alice replies to her own sent message (has sent_item but no delivery)
  local reply_result
  reply_result=$(do_reply "addr_a" "$msg_id" 0 "" "" "" "Follow up" "normal")
  assert_json_ok "$reply_result" "WR-07: reply to sent succeeds"

  # The reply should go to original recipient (Bob) since default audience = original sender
  # But wait - Alice IS the original sender, so default audience = Alice (self-reply).
  # Let's check explicitly.
  local reply_msg_id
  reply_msg_id=$(sqlite3 :memory: "SELECT json_extract('$reply_result', '$.message_id');")

  # Alice should have a delivery (self-send) because default audience = original sender = alice
  # Actually the original sender is alice, so default audience is alice = self-only reply
  local alice_dly
  alice_dly=$(db_count "SELECT count(*) FROM deliveries WHERE message_id = '$reply_msg_id' AND recipient_address_id = 'addr_a';")
  assert_eq "$alice_dly" "1" "WR-07: alice has delivery (self-reply)"
}

# --- WR-08: self-only reply to self-sent message -> allowed and deterministic ---
test_wr08_self_only_reply() {
  _write_fixtures

  # Alice sends to self
  local send1
  send1=$(do_send "addr_a" "alice@test" "" "Self note" "Note" "normal" "[]")
  assert_json_ok "$send1" "WR-08: self-send"
  local msg_id cnv_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.message_id');")
  cnv_id=$(sqlite3 :memory: "SELECT json_extract('$send1', '$.conversation_id');")

  # Alice replies (self-only, no --all)
  local reply_result
  reply_result=$(do_reply "addr_a" "$msg_id" 0 "" "" "" "Self reply" "normal")
  assert_json_ok "$reply_result" "WR-08: self-only reply"

  local reply_msg_id
  reply_msg_id=$(sqlite3 :memory: "SELECT json_extract('$reply_result', '$.message_id');")

  # Both sent_item and delivery should exist for reply
  local si_exists
  si_exists=$(db_count "SELECT count(*) FROM sent_items WHERE message_id = '$reply_msg_id';")
  assert_eq "$si_exists" "1" "WR-08: sent_item exists for reply"

  local dly_exists
  dly_exists=$(db_count "SELECT count(*) FROM deliveries WHERE message_id = '$reply_msg_id' AND recipient_address_id = 'addr_a';")
  assert_eq "$dly_exists" "1" "WR-08: delivery exists for self-reply"

  # Reply should be in same conversation
  local reply_cnv
  reply_cnv=$(db_query "SELECT conversation_id FROM messages WHERE id = '$reply_msg_id';")
  assert_eq "$reply_cnv" "$cnv_id" "WR-08: reply in same conversation"
}

# --- WR-09: duplicate logical recipients same role -> normalized deterministically ---
test_wr09_duplicate_same_role() {
  _write_fixtures

  # Send to bob twice in --to
  local result
  result=$(do_send "addr_a" "bob@test,bob@test" "" "Dupe test" "Hello" "normal" "[]")
  assert_json_ok "$result" "WR-09: send succeeds with deduped"

  local msg_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$result', '$.message_id');")

  # Public headers: bob should appear only once in 'to'
  local pub_to_count
  pub_to_count=$(db_count "SELECT count(*) FROM message_public_recipients WHERE message_id = '$msg_id' AND recipient_role = 'to';")
  assert_eq "$pub_to_count" "1" "WR-09: one public 'to' header after dedupe"

  # Only one delivery for bob
  local dly_count
  dly_count=$(db_count "SELECT count(*) FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")
  assert_eq "$dly_count" "1" "WR-09: one delivery for bob"
}

# --- WR-10: duplicate cross-role recipients -> preserved logically, effective_role by precedence ---
test_wr10_duplicate_cross_role() {
  _write_fixtures

  # Send with bob in both --to and --cc
  local result
  result=$(do_send "addr_a" "bob@test" "bob@test" "Cross role" "Hello" "normal" "[]")
  assert_json_ok "$result" "WR-10: send succeeds"

  local msg_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$result', '$.message_id');")

  # Public headers should preserve cross-role: bob in 'to' AND bob in 'cc'
  local pub_to_count pub_cc_count
  pub_to_count=$(db_count "SELECT count(*) FROM message_public_recipients WHERE message_id = '$msg_id' AND recipient_role = 'to' AND recipient_address_id = 'addr_b';")
  pub_cc_count=$(db_count "SELECT count(*) FROM message_public_recipients WHERE message_id = '$msg_id' AND recipient_role = 'cc' AND recipient_address_id = 'addr_b';")
  assert_eq "$pub_to_count" "1" "WR-10: bob in public 'to'"
  assert_eq "$pub_cc_count" "1" "WR-10: bob in public 'cc'"

  # Only one delivery, effective_role = 'to' (highest precedence)
  local dly_count
  dly_count=$(db_count "SELECT count(*) FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")
  assert_eq "$dly_count" "1" "WR-10: one delivery"

  local eff_role
  eff_role=$(db_query "SELECT effective_role FROM deliveries WHERE message_id = '$msg_id' AND recipient_address_id = 'addr_b';")
  assert_eq "$eff_role" "to" "WR-10: effective_role is 'to' (precedence)"
}

# --- Register tests ---
run_test "WR-01: inactive direct recipient"                test_wr01_inactive_direct_recipient
run_test "WR-02: inactive list addressed directly"         test_wr02_inactive_list_direct
run_test "WR-03: active list zero active members"          test_wr03_empty_list_no_recipients
run_test "WR-04: direct + list overlap"                    test_wr04_direct_list_overlap
run_test "WR-05: reply-all after list membership change"   test_wr05_reply_all_membership_change
run_test "WR-06: reply-all plus explicit extra recipients" test_wr06_reply_all_extra_recipients
run_test "WR-07: reply to sent message"                    test_wr07_reply_to_sent
run_test "WR-08: self-only reply to self-sent"             test_wr08_self_only_reply
run_test "WR-09: duplicate same-role recipients"           test_wr09_duplicate_same_role
run_test "WR-10: duplicate cross-role recipients"          test_wr10_duplicate_cross_role
