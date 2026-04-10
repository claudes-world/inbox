#!/usr/bin/env bash
# lib/db.sh — SQLite connection, initialization, query, and transaction helpers.
# All functions use $INBOX_DB as the database path.

# db_init — Initialize SQLite database at $INBOX_DB with pragmas and schema.
# Idempotent: checks if tables exist before applying schema.
db_init() {
  if [[ -z "${INBOX_DB:-}" ]]; then
    echo "error: INBOX_DB is not set" >&2
    return 1
  fi

  # Create parent directory if needed
  local db_dir
  db_dir="$(dirname "$INBOX_DB")"
  if [[ ! -d "$db_dir" ]]; then
    mkdir -p "$db_dir"
  fi

  # Apply pragmas
  sqlite3 "$INBOX_DB" "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;" >/dev/null 2>&1

  # Check if schema is already applied (use addresses table as sentinel)
  local table_count
  table_count=$(sqlite3 "$INBOX_DB" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='addresses';")
  if [[ "$table_count" -eq 0 ]]; then
    # Apply schema — strip PRAGMA lines since we set them above per-connection
    local schema_file="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/schema/001-init.sql"
    if [[ ! -f "$schema_file" ]]; then
      echo "error: schema file not found: $schema_file" >&2
      return 1
    fi
    sqlite3 "$INBOX_DB" < "$schema_file" >/dev/null
  fi

  return 0
}

# db_exec — Run a SQL statement against $INBOX_DB. Returns exit code.
# Usage: db_exec "INSERT INTO ..."
db_exec() {
  if [[ -z "${INBOX_DB:-}" ]]; then
    echo "error: INBOX_DB is not set" >&2
    return 1
  fi
  sqlite3 "$INBOX_DB" "PRAGMA foreign_keys = ON; $1"
}

# db_query — Run a query against $INBOX_DB, return results.
# Usage: db_query "SELECT ..." [-json]
# With -json flag, returns JSON array output.
db_query() {
  if [[ -z "${INBOX_DB:-}" ]]; then
    echo "error: INBOX_DB is not set" >&2
    return 1
  fi

  local sql="$1"
  shift

  if [[ "${1:-}" == "-json" ]]; then
    sqlite3 -json "$INBOX_DB" "PRAGMA foreign_keys = ON; $sql"
  else
    sqlite3 -separator '|' "$INBOX_DB" "PRAGMA foreign_keys = ON; $sql"
  fi
}

# db_query_json — Shorthand that always returns JSON array.
# Usage: db_query_json "SELECT ..."
db_query_json() {
  if [[ -z "${INBOX_DB:-}" ]]; then
    echo "error: INBOX_DB is not set" >&2
    return 1
  fi
  sqlite3 -json "$INBOX_DB" "PRAGMA foreign_keys = ON; $1"
}

# db_transaction — Run SQL statements inside BEGIN/COMMIT with ROLLBACK on failure.
# Usage: db_transaction "INSERT ...; UPDATE ...;"
# Returns 0 on success, 1 on failure (after rollback).
db_transaction() {
  if [[ -z "${INBOX_DB:-}" ]]; then
    echo "error: INBOX_DB is not set" >&2
    return 1
  fi

  local sql="$1"
  local full_sql
  full_sql="$(printf 'PRAGMA foreign_keys = ON;\nBEGIN;\n%s\nCOMMIT;\n' "$sql")"

  local output
  if output=$(sqlite3 "$INBOX_DB" "$full_sql" 2>&1); then
    if [[ -n "$output" ]]; then
      echo "$output"
    fi
    return 0
  else
    # Transaction failed — attempt explicit rollback in case BEGIN succeeded
    sqlite3 "$INBOX_DB" "ROLLBACK;" 2>/dev/null || true
    echo "$output" >&2
    return 1
  fi
}

# db_exists — Check if a row exists. Returns 0 (true) if at least one row, 1 (false) if none.
# Usage: db_exists "SELECT 1 FROM ... WHERE ... LIMIT 1"
db_exists() {
  if [[ -z "${INBOX_DB:-}" ]]; then
    echo "error: INBOX_DB is not set" >&2
    return 1
  fi

  local result
  result=$(sqlite3 "$INBOX_DB" "PRAGMA foreign_keys = ON; SELECT CASE WHEN EXISTS($1) THEN 1 ELSE 0 END;")
  [[ "$result" == "1" ]]
}

# db_count — Return count from a query (prints the number to stdout).
# Usage: db_count "SELECT count(*) FROM ..."
db_count() {
  if [[ -z "${INBOX_DB:-}" ]]; then
    echo "error: INBOX_DB is not set" >&2
    return 1
  fi

  sqlite3 "$INBOX_DB" "PRAGMA foreign_keys = ON; $1"
}
