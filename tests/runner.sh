#!/usr/bin/env bash
set -euo pipefail

# tests/runner.sh — Test harness: discovers and runs test_*.sh files.
# Usage: tests/runner.sh [--gate N] [--verbose]

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$TEST_DIR/.." && pwd)"

# Parse arguments
GATE=""
export VERBOSE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gate)
      GATE="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=1
      shift
      ;;
    *)
      echo "Usage: runner.sh [--gate N] [--verbose]" >&2
      exit 1
      ;;
  esac
done

# Source helpers (which sources all lib modules)
source "$TEST_DIR/helpers.sh"

echo "Inbox Test Runner"
echo "================="
if [[ -n "$GATE" ]]; then
  echo "Gate: $GATE"
fi
echo ""

# Discover test files
test_files=()
for f in "$TEST_DIR"/test_*.sh; do
  if [[ -f "$f" ]]; then
    test_files+=("$f")
  fi
done

if [[ ${#test_files[@]} -eq 0 ]]; then
  echo "No test files found."
  exit 0
fi

# Run each test file
for test_file in "${test_files[@]}"; do
  # If --gate is specified, only run files that define TEST_GATE matching
  # Each test file should set TEST_GATE=N at the top
  if [[ -n "$GATE" ]]; then
    # Check if this file declares a matching gate
    file_gate=$(grep -oP 'TEST_GATE=\K\d+' "$test_file" 2>/dev/null || echo "")
    if [[ "$file_gate" != "$GATE" ]]; then
      continue
    fi
  fi

  local_name="$(basename "$test_file")"
  echo "--- $local_name ---"
  source "$test_file"
done

# Print summary
echo ""
test_summary
