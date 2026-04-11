#!/usr/bin/env bash
# tests/test_uat.sh — Gate 5: UAT end-to-end scenarios
# Tests UAT-01..UAT-05 exercising bin/inbox as a subprocess.
TEST_GATE=5

INBOX_CMD="$PROJECT_DIR/bin/inbox"

# --- Shared UAT fixtures ---
# Creates a realistic multi-agent environment with addresses + list.
_uat_fixtures() {
  db_exec "
    INSERT INTO addresses (id, local_part, host, kind, display_name, is_listed, is_active, classification, created_at_ms, updated_at_ms)
    VALUES
      ('addr_uat_pm',   'pm-alpha', 'uat-host', 'agent', 'PM Alpha',       1, 1, 'internal', 1000, 1000),
      ('addr_uat_eng',  'eng-lead', 'uat-host', 'agent', 'Engineering Lead',1, 1, 'internal', 1000, 1000),
      ('addr_uat_eng1', 'eng-1',    'uat-host', 'agent', 'Engineer One',    1, 1, 'internal', 1000, 1000),
      ('addr_uat_eng2', 'eng-2',    'uat-host', 'agent', 'Engineer Two',    1, 1, 'internal', 1000, 1000);
  "
  db_exec "
    INSERT INTO addresses (id, local_part, host, kind, display_name, is_listed, is_active, classification, created_at_ms, updated_at_ms)
    VALUES
      ('addr_uat_list', 'eng-team', 'uat-lists', 'list', 'Engineering Team', 1, 1, NULL, 1000, 1000);
  "
  db_exec "
    INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
    VALUES
      ('addr_uat_list', 'addr_uat_eng',  1, 1000),
      ('addr_uat_list', 'addr_uat_eng1', 2, 1000),
      ('addr_uat_list', 'addr_uat_eng2', 3, 1000);
  "
}

# ============================================================================
# UAT-01: PM sends report request to eng lead, eng lead receives and replies,
#          PM sees reply in thread.
# ============================================================================
test_uat01_pm_eng_exchange() {
  _uat_fixtures

  # Step 1: PM sends a message to eng-lead
  export INBOX_ADDRESS="pm-alpha@uat-host"
  local send_result send_rc=0
  send_result=$("$INBOX_CMD" send \
    --to "eng-lead@uat-host" \
    --subject "Weekly status report needed" \
    --body "Please send your weekly engineering status report by EOD." \
    --json 2>/dev/null) || send_rc=$?

  assert_eq "$send_rc" "0" "UAT-01: PM send succeeds" || return 1
  assert_json_ok "$send_result" "UAT-01: PM send ok=true" || return 1

  local msg_id cnv_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$(echo "$send_result" | sed "s/'/''/g")', '\$.message_id');")
  cnv_id=$(sqlite3 :memory: "SELECT json_extract('$(echo "$send_result" | sed "s/'/''/g")', '\$.conversation_id');")

  # Step 2: Eng-lead checks inbox and sees the message
  export INBOX_ADDRESS="eng-lead@uat-host"
  local list_result list_rc=0
  list_result=$("$INBOX_CMD" list --json 2>/dev/null) || list_rc=$?

  assert_eq "$list_rc" "0" "UAT-01: eng-lead list succeeds" || return 1
  assert_json_ok "$list_result" "UAT-01: eng-lead list ok=true" || return 1

  # Verify the message appears in inbox
  local returned_count
  returned_count=$(sqlite3 :memory: "SELECT json_extract('$(echo "$list_result" | sed "s/'/''/g")', '\$.returned_count');")
  assert_eq "$returned_count" "1" "UAT-01: eng-lead sees 1 message" || return 1

  local inbox_msg_id
  inbox_msg_id=$(sqlite3 :memory: "SELECT json_extract('$(echo "$list_result" | sed "s/'/''/g")', '\$.items[0].message_id');")
  assert_eq "$inbox_msg_id" "$msg_id" "UAT-01: inbox message matches sent message" || return 1

  # Step 3: Eng-lead reads the message
  local read_result read_rc=0
  read_result=$("$INBOX_CMD" read "$msg_id" --json 2>/dev/null) || read_rc=$?

  assert_eq "$read_rc" "0" "UAT-01: eng-lead read succeeds" || return 1
  assert_json_ok "$read_result" "UAT-01: eng-lead read ok=true" || return 1

  local read_subject
  read_subject=$(sqlite3 :memory: "SELECT json_extract('$(echo "$read_result" | sed "s/'/''/g")', '\$.message.subject');")
  assert_eq "$read_subject" "Weekly status report needed" "UAT-01: correct subject" || return 1

  # Step 4: Eng-lead replies
  local reply_result reply_rc=0
  reply_result=$("$INBOX_CMD" reply "$msg_id" \
    --body "Status report: API migration at 85%. Blocker: auth service refactor." \
    --json 2>/dev/null) || reply_rc=$?

  assert_eq "$reply_rc" "0" "UAT-01: eng-lead reply succeeds" || return 1
  assert_json_ok "$reply_result" "UAT-01: eng-lead reply ok=true" || return 1

  local reply_msg_id reply_cnv_id
  reply_msg_id=$(sqlite3 :memory: "SELECT json_extract('$(echo "$reply_result" | sed "s/'/''/g")', '\$.message_id');")
  reply_cnv_id=$(sqlite3 :memory: "SELECT json_extract('$(echo "$reply_result" | sed "s/'/''/g")', '\$.conversation_id');")

  # Verify reply is in same conversation
  assert_eq "$reply_cnv_id" "$cnv_id" "UAT-01: reply in same conversation" || return 1

  # Step 5: PM checks inbox and sees the reply
  export INBOX_ADDRESS="pm-alpha@uat-host"
  local pm_list_result pm_list_rc=0
  pm_list_result=$("$INBOX_CMD" list --json 2>/dev/null) || pm_list_rc=$?

  assert_eq "$pm_list_rc" "0" "UAT-01: PM list succeeds" || return 1

  # PM should see the reply in inbox
  local pm_count
  pm_count=$(sqlite3 :memory: "SELECT json_extract('$(echo "$pm_list_result" | sed "s/'/''/g")', '\$.returned_count');")
  # PM has at least 1 message (the reply)
  if [[ "$pm_count" -lt 1 ]]; then
    _test_fail "UAT-01: PM should see reply in inbox" "got $pm_count messages"
    return 1
  fi

  # Step 6: PM views thread and sees both messages
  local thread_result thread_rc=0
  thread_result=$("$INBOX_CMD" thread "$cnv_id" --json 2>/dev/null) || thread_rc=$?

  assert_eq "$thread_rc" "0" "UAT-01: PM thread view succeeds" || return 1
  assert_json_ok "$thread_result" "UAT-01: PM thread ok=true" || return 1

  local thread_count
  thread_count=$(sqlite3 :memory: "SELECT json_array_length(json_extract('$(echo "$thread_result" | sed "s/'/''/g")', '\$.items'));")
  assert_eq "$thread_count" "2" "UAT-01: thread has 2 messages" || return 1
}

# ============================================================================
# UAT-02: Threat brief to multiple agents via list.
#          All members receive, delivery sources show list origin.
# ============================================================================
test_uat02_list_delivery() {
  _uat_fixtures

  # PM sends to eng-team list
  export INBOX_ADDRESS="pm-alpha@uat-host"
  local send_result send_rc=0
  send_result=$("$INBOX_CMD" send \
    --to "eng-team@uat-lists" \
    --subject "Security threat brief" \
    --body "Critical vulnerability discovered in auth module. Patch by EOD." \
    --urgency high \
    --json 2>/dev/null) || send_rc=$?

  assert_eq "$send_rc" "0" "UAT-02: send to list succeeds" || return 1
  assert_json_ok "$send_result" "UAT-02: send ok=true" || return 1

  # Verify 3 recipients resolved (eng-lead, eng-1, eng-2)
  local resolved_count
  resolved_count=$(sqlite3 :memory: "SELECT json_extract('$(echo "$send_result" | sed "s/'/''/g")', '\$.resolved_recipient_count');")
  assert_eq "$resolved_count" "3" "UAT-02: 3 recipients resolved from list" || return 1

  local msg_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$(echo "$send_result" | sed "s/'/''/g")', '\$.message_id');")

  # Verify each member sees it in their inbox
  for agent in "eng-lead@uat-host" "eng-1@uat-host" "eng-2@uat-host"; do
    export INBOX_ADDRESS="$agent"
    local agent_list agent_rc=0
    agent_list=$("$INBOX_CMD" list --json 2>/dev/null) || agent_rc=$?

    assert_eq "$agent_rc" "0" "UAT-02: $agent list succeeds" || return 1

    local agent_count
    agent_count=$(sqlite3 :memory: "SELECT json_extract('$(echo "$agent_list" | sed "s/'/''/g")', '\$.returned_count');")
    assert_eq "$agent_count" "1" "UAT-02: $agent sees 1 message" || return 1

    local agent_msg_id
    agent_msg_id=$(sqlite3 :memory: "SELECT json_extract('$(echo "$agent_list" | sed "s/'/''/g")', '\$.items[0].message_id');")
    assert_eq "$agent_msg_id" "$msg_id" "UAT-02: $agent sees correct message" || return 1
  done

  # Verify delivery sources record list origin
  local list_source_count
  list_source_count=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM delivery_sources WHERE source_address_id = 'addr_uat_list' AND source_kind = 'list';")
  assert_eq "$list_source_count" "3" "UAT-02: 3 delivery_sources with list origin" || return 1
}

# ============================================================================
# UAT-03: Self-send. Both inbox and sent views exist independently.
#          Hiding one does not affect the other.
# ============================================================================
test_uat03_self_send() {
  _uat_fixtures

  # PM sends to self
  export INBOX_ADDRESS="pm-alpha@uat-host"
  local send_result send_rc=0
  send_result=$("$INBOX_CMD" send \
    --to "pm-alpha@uat-host" \
    --subject "Note to self" \
    --body "Remember to review sprint retro notes." \
    --json 2>/dev/null) || send_rc=$?

  assert_eq "$send_rc" "0" "UAT-03: self-send succeeds" || return 1
  assert_json_ok "$send_result" "UAT-03: self-send ok=true" || return 1

  local msg_id
  msg_id=$(sqlite3 :memory: "SELECT json_extract('$(echo "$send_result" | sed "s/'/''/g")', '\$.message_id');")

  # Verify message appears in inbox (as received)
  local inbox_result inbox_rc=0
  inbox_result=$("$INBOX_CMD" list --json 2>/dev/null) || inbox_rc=$?

  assert_eq "$inbox_rc" "0" "UAT-03: inbox list succeeds" || return 1
  local inbox_count
  inbox_count=$(sqlite3 :memory: "SELECT json_extract('$(echo "$inbox_result" | sed "s/'/''/g")', '\$.returned_count');")
  assert_eq "$inbox_count" "1" "UAT-03: message in inbox" || return 1

  # Verify message appears in sent
  local sent_result sent_rc=0
  sent_result=$("$INBOX_CMD" sent list --json 2>/dev/null) || sent_rc=$?

  assert_eq "$sent_rc" "0" "UAT-03: sent list succeeds" || return 1
  local sent_count
  sent_count=$(sqlite3 :memory: "SELECT json_extract('$(echo "$sent_result" | sed "s/'/''/g")', '\$.returned_count');")
  assert_eq "$sent_count" "1" "UAT-03: message in sent" || return 1

  # Hide the inbox copy
  local hide_result hide_rc=0
  hide_result=$("$INBOX_CMD" hide "$msg_id" --json 2>/dev/null) || hide_rc=$?

  assert_eq "$hide_rc" "0" "UAT-03: inbox hide succeeds" || return 1
  assert_json_field "$hide_result" '$.changed' '1' "UAT-03: inbox hide changed=true" || return 1

  # Inbox should now show 0 active messages
  local inbox_after_hide inbox_after_rc=0
  inbox_after_hide=$("$INBOX_CMD" list --json 2>/dev/null) || inbox_after_rc=$?

  local inbox_after_count
  inbox_after_count=$(sqlite3 :memory: "SELECT json_extract('$(echo "$inbox_after_hide" | sed "s/'/''/g")', '\$.returned_count');")
  assert_eq "$inbox_after_count" "0" "UAT-03: inbox empty after hide" || return 1

  # Sent should still show 1 active message (independent)
  local sent_after_hide sent_after_rc=0
  sent_after_hide=$("$INBOX_CMD" sent list --json 2>/dev/null) || sent_after_rc=$?

  local sent_after_count
  sent_after_count=$(sqlite3 :memory: "SELECT json_extract('$(echo "$sent_after_hide" | sed "s/'/''/g")', '\$.returned_count');")
  assert_eq "$sent_after_count" "1" "UAT-03: sent still shows message after inbox hide" || return 1

  # Hide the sent copy too
  local sent_hide_result sent_hide_rc=0
  sent_hide_result=$("$INBOX_CMD" sent hide "$msg_id" --json 2>/dev/null) || sent_hide_rc=$?

  assert_eq "$sent_hide_rc" "0" "UAT-03: sent hide succeeds" || return 1
  assert_json_field "$sent_hide_result" '$.changed' '1' "UAT-03: sent hide changed=true" || return 1

  # Both views now hidden, but unhiding inbox should restore only inbox
  local unhide_result unhide_rc=0
  unhide_result=$("$INBOX_CMD" unhide "$msg_id" --json 2>/dev/null) || unhide_rc=$?

  assert_eq "$unhide_rc" "0" "UAT-03: inbox unhide succeeds" || return 1
  assert_json_field "$unhide_result" '$.changed' '1' "UAT-03: inbox unhide changed=true" || return 1

  # Inbox should show 1 again
  local inbox_restored inbox_restored_rc=0
  inbox_restored=$("$INBOX_CMD" list --json 2>/dev/null) || inbox_restored_rc=$?

  local inbox_restored_count
  inbox_restored_count=$(sqlite3 :memory: "SELECT json_extract('$(echo "$inbox_restored" | sed "s/'/''/g")', '\$.returned_count');")
  assert_eq "$inbox_restored_count" "1" "UAT-03: inbox restored after unhide" || return 1

  # Sent should still be hidden
  local sent_still_hidden sent_still_rc=0
  sent_still_hidden=$("$INBOX_CMD" sent list --json 2>/dev/null) || sent_still_rc=$?

  local sent_still_count
  sent_still_count=$(sqlite3 :memory: "SELECT json_extract('$(echo "$sent_still_hidden" | sed "s/'/''/g")', '\$.returned_count');")
  assert_eq "$sent_still_count" "0" "UAT-03: sent still hidden after inbox unhide" || return 1
}

# ============================================================================
# UAT-04: Agent tries experimental search command.
#          Gets coming_soon + feedback prompt. No state mutation.
# ============================================================================
test_uat04_experimental_probe() {
  _uat_fixtures

  export INBOX_ADDRESS="pm-alpha@uat-host"
  export INBOX_EXPERIMENTAL_MODE=1
  export INBOX_EXPERIMENTAL_PROFILE=core

  # Record state before
  local msg_count_before dly_count_before evt_count_before
  msg_count_before=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM messages;")
  dly_count_before=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM deliveries;")
  evt_count_before=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM delivery_events;")

  # Try experimental search command
  local result exit_code=0
  result=$("$INBOX_CMD" search --json 2>/dev/null) || exit_code=$?

  # Verify exit code 6 (coming_soon)
  assert_eq "$exit_code" "6" "UAT-04: exit code is 6" || return 1

  # Verify JSON response
  assert_json_field "$result" '$.ok' '0' "UAT-04: ok=false" || return 1
  assert_json_field "$result" '$.error.code' 'coming_soon' "UAT-04: error code is coming_soon" || return 1

  # Verify feedback prompt is included
  local feedback_cmd
  feedback_cmd=$(sqlite3 :memory: "SELECT json_extract('$(echo "$result" | sed "s/'/''/g")', '\$.error.details.feedback_command');")
  assert_contains "$feedback_cmd" "give-feedback" "UAT-04: feedback_command present" || return 1
  assert_contains "$feedback_cmd" "--feature search" "UAT-04: feedback_command mentions search" || return 1

  # Verify NO state mutation
  local msg_count_after dly_count_after evt_count_after
  msg_count_after=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM messages;")
  dly_count_after=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM deliveries;")
  evt_count_after=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM delivery_events;")

  assert_eq "$msg_count_after" "$msg_count_before" "UAT-04: no messages created" || return 1
  assert_eq "$dly_count_after" "$dly_count_before" "UAT-04: no deliveries created" || return 1
  assert_eq "$evt_count_after" "$evt_count_before" "UAT-04: no events created" || return 1

  unset INBOX_EXPERIMENTAL_MODE INBOX_EXPERIMENTAL_PROFILE
}

# ============================================================================
# UAT-05: Agent submits feedback via give-feedback.
#          Record captured in NDJSON log with correct fields.
# ============================================================================
test_uat05_give_feedback() {
  _uat_fixtures

  export INBOX_ADDRESS="eng-lead@uat-host"
  export INBOX_EXPERIMENTAL_LOG="$_TEST_TMPDIR/feedback.ndjson"

  # Submit feedback about a wanted feature
  local result exit_code=0
  result=$("$INBOX_CMD" give-feedback \
    --feature "search" \
    --kind "verb" \
    --wanted "I need full-text search across all messages in my inbox" \
    --json 2>/dev/null) || exit_code=$?

  assert_eq "$exit_code" "0" "UAT-05: give-feedback succeeds" || return 1
  assert_json_ok "$result" "UAT-05: ok=true" || return 1
  assert_json_field "$result" '$.recorded' '1' "UAT-05: recorded=true" || return 1

  # Verify feedback_id starts with fbk_
  local feedback_id
  feedback_id=$(sqlite3 :memory: "SELECT json_extract('$(echo "$result" | sed "s/'/''/g")', '\$.feedback_id');")
  assert_eq "${feedback_id:0:4}" "fbk_" "UAT-05: feedback_id has fbk_ prefix" || return 1

  # Verify NDJSON file was created
  if [[ ! -f "$_TEST_TMPDIR/feedback.ndjson" ]]; then
    _test_fail "UAT-05: feedback NDJSON file exists"
    return 1
  fi

  # Verify record content
  local record
  record=$(tail -1 "$_TEST_TMPDIR/feedback.ndjson")
  local record_escaped
  record_escaped=$(echo "$record" | sed "s/'/''/g")

  local rec_feature rec_kind rec_wanted rec_actor
  rec_feature=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.feature');")
  rec_kind=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.kind');")
  rec_wanted=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.wanted');")
  rec_actor=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.actor');")

  assert_eq "$rec_feature" "search" "UAT-05: NDJSON feature=search" || return 1
  assert_eq "$rec_kind" "verb" "UAT-05: NDJSON kind=verb" || return 1
  assert_contains "$rec_wanted" "full-text search" "UAT-05: NDJSON wanted text captured" || return 1

  # Verify record has a timestamp
  local rec_ts
  rec_ts=$(sqlite3 :memory: "SELECT json_extract('$record_escaped', '\$.ts_ms');")
  if [[ -z "$rec_ts" || "$rec_ts" == "null" ]]; then
    _test_fail "UAT-05: NDJSON record has ts_ms"
    return 1
  fi

  # Verify no protocol state mutation
  local msg_count
  msg_count=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM messages;")
  assert_eq "$msg_count" "0" "UAT-05: no messages created by feedback" || return 1

  local sent_count
  sent_count=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM sent_items;")
  assert_eq "$sent_count" "0" "UAT-05: no sent_items created by feedback" || return 1

  unset INBOX_EXPERIMENTAL_LOG
}

# --- Register tests ---
run_test "UAT-01: PM-engineer message exchange with thread"     test_uat01_pm_eng_exchange 5
run_test "UAT-02: list delivery to multiple agents"             test_uat02_list_delivery 5
run_test "UAT-03: self-send with independent inbox/sent views"  test_uat03_self_send 5
run_test "UAT-04: experimental probe -> coming_soon, no mutation" test_uat04_experimental_probe 5
run_test "UAT-05: give-feedback captures NDJSON record"         test_uat05_give_feedback 5
