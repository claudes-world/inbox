#!/usr/bin/env bash
# tests/smoke.sh — Quick end-to-end smoke test for the inbox CLI.
# Exercises the entire CLI in under 30 seconds.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INBOX_CMD="$SCRIPT_DIR/bin/inbox"
TMPDIR="$(mktemp -d)"
export INBOX_DB="$TMPDIR/smoke.db"

_pass=0
_fail=0
_errors=()

pass() {
  _pass=$((_pass + 1))
  echo "PASS: $1"
}

fail() {
  _fail=$((_fail + 1))
  _errors+=("$1")
  echo "FAIL: $1"
}

check_json() {
  echo "$1" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null
}

cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

# --- Step 1: whoami without INBOX_ADDRESS should fail ---
unset INBOX_ADDRESS 2>/dev/null || true
if "$INBOX_CMD" whoami --json >/dev/null 2>&1; then
  fail "whoami without INBOX_ADDRESS should fail"
else
  pass "whoami without INBOX_ADDRESS fails"
fi

# --- Step 2: Seed the database ---
export INBOX_ADDRESS="alpha@smoke"

# Run any command to initialize the DB schema (it will fail but creates tables)
"$INBOX_CMD" whoami --json >/dev/null 2>&1 || true

# Seed addresses and groups
sqlite3 "$INBOX_DB" "
INSERT INTO addresses (id, local_part, host, kind, display_name, is_listed, is_active, classification, created_at_ms, updated_at_ms)
VALUES
  ('addr_s_a', 'alpha', 'smoke',      'agent', 'Alpha Agent', 1, 1, 'internal', 1000, 1000),
  ('addr_s_b', 'beta',  'smoke',      'agent', 'Beta Agent',  1, 1, 'internal', 1000, 1000),
  ('addr_s_g', 'group', 'smoke-lists', 'list', 'Team Group',  1, 1, NULL,       1000, 1000);
INSERT INTO group_members (group_address_id, member_address_id, ordinal, added_at_ms)
VALUES ('addr_s_g', 'addr_s_a', 1, 1000), ('addr_s_g', 'addr_s_b', 2, 1000);
"

# --- Step 3: whoami --json ---
result=$("$INBOX_CMD" whoami --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True; assert d['address']=='alpha@smoke'" 2>/dev/null; then
  pass "whoami --json"
else
  fail "whoami --json: $result"
fi

# --- Step 4: send --json ---
result=$("$INBOX_CMD" send --to beta@smoke --subject "Hello" --body "World" --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True; assert 'message_id' in d" 2>/dev/null; then
  pass "send --json"
else
  fail "send --json: $result"
fi
msg_id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['message_id'])")
cnv_id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['conversation_id'])")

# --- Step 5: list --json as beta ---
export INBOX_ADDRESS="beta@smoke"
result=$("$INBOX_CMD" list --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True; assert len(d['items'])>=1" 2>/dev/null; then
  pass "list --json (beta sees message)"
else
  fail "list --json (beta): $result"
fi

# --- Step 6: read --json ---
result=$("$INBOX_CMD" read "$msg_id" --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True; assert d['message']['body']=='World'" 2>/dev/null; then
  pass "read --json"
else
  fail "read --json: $result"
fi

# --- Step 7: reply --json ---
result=$("$INBOX_CMD" reply "$msg_id" --body "Thanks" --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True; assert 'message_id' in d" 2>/dev/null; then
  pass "reply --json"
else
  fail "reply --json: $result"
fi
reply_msg_id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['message_id'])")

# --- Step 8: list --json as alpha (sees reply) ---
export INBOX_ADDRESS="alpha@smoke"
result=$("$INBOX_CMD" list --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True; assert len(d['items'])>=1" 2>/dev/null; then
  pass "list --json (alpha sees reply)"
else
  fail "list --json (alpha sees reply): $result"
fi

# --- Step 9: read reply --json ---
result=$("$INBOX_CMD" read "$reply_msg_id" --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True; assert d['message']['body']=='Thanks'" 2>/dev/null; then
  pass "read reply --json"
else
  fail "read reply --json: $result"
fi

# --- Step 10: ack --json ---
result=$("$INBOX_CMD" ack "$reply_msg_id" --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True" 2>/dev/null; then
  pass "ack --json"
else
  fail "ack --json: $result"
fi

# --- Step 11: hide --json ---
result=$("$INBOX_CMD" hide "$reply_msg_id" --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True" 2>/dev/null; then
  pass "hide --json"
else
  fail "hide --json: $result"
fi

# --- Step 12: unhide --json ---
result=$("$INBOX_CMD" unhide "$reply_msg_id" --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True" 2>/dev/null; then
  pass "unhide --json"
else
  fail "unhide --json: $result"
fi

# --- Step 13: sent list --json ---
result=$("$INBOX_CMD" sent list --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True; assert 'items' in d" 2>/dev/null; then
  pass "sent list --json"
else
  fail "sent list --json: $result"
fi

# --- Step 14: sent read --json ---
result=$("$INBOX_CMD" sent read "$msg_id" --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True" 2>/dev/null; then
  pass "sent read --json"
else
  fail "sent read --json: $result"
fi

# --- Step 15: thread --json ---
result=$("$INBOX_CMD" thread "$cnv_id" --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True; assert len(d['items'])>=2" 2>/dev/null; then
  pass "thread --json"
else
  fail "thread --json: $result"
fi

# --- Step 16: directory list --json ---
result=$("$INBOX_CMD" directory list --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True; assert len(d['items'])>=1" 2>/dev/null; then
  pass "directory list --json"
else
  fail "directory list --json: $result"
fi

# --- Step 17: directory show --json ---
result=$("$INBOX_CMD" directory show beta@smoke --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True; assert d['address']['address']=='beta@smoke'" 2>/dev/null; then
  pass "directory show --json"
else
  fail "directory show --json: $result"
fi

# --- Step 18: directory members --json ---
result=$("$INBOX_CMD" directory members group@smoke-lists --json 2>/dev/null) || true
if check_json "$result" && echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['ok']==True; assert len(d['members'])>=2" 2>/dev/null; then
  pass "directory members --json"
else
  fail "directory members --json: $result"
fi

# --- Step 19: --version flag ---
result=$("$INBOX_CMD" --version 2>/dev/null) || true
if [[ "$result" == *"0.1.0-dev"* ]]; then
  pass "--version flag"
else
  fail "--version flag: $result"
fi

# --- Summary ---
echo ""
echo "========================="
echo "Smoke test: $_pass passed, $_fail failed"

if [[ $_fail -gt 0 ]]; then
  echo ""
  echo "Failures:"
  for err in "${_errors[@]}"; do
    echo "  - $err"
  done
  exit 1
fi

echo "Smoke test: PASS"
