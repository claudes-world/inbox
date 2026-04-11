# Inbox

[![CI](https://github.com/claudes-world/inbox/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/claudes-world/inbox/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-TBD-lightgrey.svg)](./LICENSE)

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
