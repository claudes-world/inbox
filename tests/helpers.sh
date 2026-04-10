#!/usr/bin/env bash
# tests/helpers.sh — Test utility functions: setup/teardown, assertions, test runner.

# Resolve project root relative to this file
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$TEST_DIR/.." && pwd)"

# Source library modules
export SCRIPT_DIR="$PROJECT_DIR"
for lib in "$PROJECT_DIR"/lib/*.sh; do source "$lib"; done

# --- Test state ---
_TEST_PASS=0
_TEST_FAIL=0
_TEST_ERRORS=()
_VERBOSE="${VERBOSE:-0}"

# --- Setup / Teardown ---

# setup_test_db — Create a temp directory, initialize a fresh DB, export INBOX_DB and INBOX_ADDRESS.
setup_test_db() {
  _TEST_TMPDIR="$(mktemp -d)"
  export INBOX_DB="${_TEST_TMPDIR}/test.db"
  export INBOX_ADDRESS="test-agent@test-host"
  db_init
}

# teardown_test_db — Remove temp directory.
teardown_test_db() {
  if [[ -n "${_TEST_TMPDIR:-}" && -d "$_TEST_TMPDIR" ]]; then
    rm -rf "$_TEST_TMPDIR"
  fi
  unset INBOX_DB INBOX_ADDRESS _TEST_TMPDIR
}

# --- Assertions ---

# assert_eq — Assert string equality.
# Usage: assert_eq "$actual" "$expected" "message"
assert_eq() {
  local actual="$1"
  local expected="$2"
  local message="${3:-assert_eq}"

  if [[ "$actual" == "$expected" ]]; then
    return 0
  else
    _test_fail "$message" "expected: '$expected', got: '$actual'"
    return 1
  fi
}

# assert_neq — Assert string inequality.
# Usage: assert_neq "$actual" "$unexpected" "message"
assert_neq() {
  local actual="$1"
  local unexpected="$2"
  local message="${3:-assert_neq}"

  if [[ "$actual" != "$unexpected" ]]; then
    return 0
  else
    _test_fail "$message" "expected value to differ from: '$unexpected'"
    return 1
  fi
}

# assert_exit_code — Run command and assert exit code.
# Usage: assert_exit_code <expected_code> command [args...]
assert_exit_code() {
  local expected="$1"
  shift
  local actual
  set +e
  "$@" >/dev/null 2>&1
  actual=$?
  set -e

  if [[ "$actual" -eq "$expected" ]]; then
    return 0
  else
    _test_fail "exit code for: $*" "expected exit code $expected, got $actual"
    return 1
  fi
}

# assert_contains — Assert substring match.
# Usage: assert_contains "$haystack" "$needle" "message"
assert_contains() {
  local haystack="$1"
  local needle="$2"
  local message="${3:-assert_contains}"

  if [[ "$haystack" == *"$needle"* ]]; then
    return 0
  else
    _test_fail "$message" "expected to contain: '$needle', in: '$haystack'"
    return 1
  fi
}

# assert_json_field — Assert JSON field value using sqlite3 json_extract.
# Usage: assert_json_field "$json" "$.field" "$expected" "message"
assert_json_field() {
  local json="$1"
  local field="$2"
  local expected="$3"
  local message="${4:-assert_json_field $field}"

  local actual
  local escaped_json="${json//\'/\'\'}"
  actual=$(sqlite3 :memory: "SELECT json_extract('$escaped_json', '$field');")

  if [[ "$actual" == "$expected" ]]; then
    return 0
  else
    _test_fail "$message" "field $field: expected '$expected', got '$actual'"
    return 1
  fi
}

# assert_json_ok — Assert {"ok": true, ...}
# Usage: assert_json_ok "$json" "message"
assert_json_ok() {
  local json="$1"
  local message="${2:-assert_json_ok}"
  assert_json_field "$json" '$.ok' '1' "$message"
}

# assert_json_error — Assert error envelope with specific code.
# Usage: assert_json_error "$json" "not_found" "message"
assert_json_error() {
  local json="$1"
  local expected_code="$2"
  local message="${3:-assert_json_error}"

  assert_json_field "$json" '$.ok' '0' "$message (ok=false)" || return 1
  assert_json_field "$json" '$.error.code' "$expected_code" "$message (error.code)" || return 1
}

# --- Test runner ---

# run_test — Run a test function with setup/teardown, track results.
# Usage: run_test "test name" test_function
run_test() {
  local name="$1"
  local func="$2"
  local gate="${3:-0}"

  if [[ "$_VERBOSE" == "1" ]]; then
    printf "  RUN  %s\n" "$name"
  fi

  # Setup
  setup_test_db

  # Run test
  local result=0
  local output
  output=$("$func" 2>&1) || result=$?

  # Teardown
  teardown_test_db

  if [[ "$result" -eq 0 ]]; then
    _TEST_PASS=$(( _TEST_PASS + 1 ))
    if [[ "$_VERBOSE" == "1" ]]; then
      printf "  PASS %s\n" "$name"
    else
      printf "."
    fi
  else
    _TEST_FAIL=$(( _TEST_FAIL + 1 ))
    _TEST_ERRORS+=("FAIL: $name")
    if [[ -n "$output" ]]; then
      _TEST_ERRORS+=("      $output")
    fi
    if [[ "$_VERBOSE" == "1" ]]; then
      printf "  FAIL %s\n" "$name"
      if [[ -n "$output" ]]; then
        printf "       %s\n" "$output"
      fi
    else
      printf "F"
    fi
  fi
}

# test_summary — Print pass/fail counts.
test_summary() {
  local total=$(( _TEST_PASS + _TEST_FAIL ))
  echo ""
  echo "---"
  printf "Tests: %d total, %d passed, %d failed\n" "$total" "$_TEST_PASS" "$_TEST_FAIL"

  if [[ ${#_TEST_ERRORS[@]} -gt 0 ]]; then
    echo ""
    echo "Failures:"
    for err in "${_TEST_ERRORS[@]}"; do
      echo "  $err"
    done
  fi

  if [[ "$_TEST_FAIL" -gt 0 ]]; then
    return 1
  fi
  return 0
}

# --- Internal helpers ---

_test_fail() {
  local message="$1"
  local detail="${2:-}"
  if [[ -n "$detail" ]]; then
    echo "ASSERTION FAILED: $message — $detail" >&2
  else
    echo "ASSERTION FAILED: $message" >&2
  fi
  return 1
}
