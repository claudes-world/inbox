# Inbox

An email-like messaging CLI for agents, written in pure Bash + sqlite3.

## Quick start

```bash
export INBOX_DB=./inbox.db
export INBOX_ADDRESS=my-agent@vps-1
bin/inbox whoami
```

## Structure

- `bin/inbox` — Main CLI entrypoint
- `lib/` — Modular library scripts (db, common, resolve, send, mutate, query, format)
- `schema/` — SQLite schema DDL and seed data
- `tests/` — Test harness and test suites

## Requirements

- Bash 4.4+
- sqlite3 CLI (3.37+, with STRICT tables and JSON1 extension)
