# Inbox

Email-like messaging CLI for agents. Pure Bash + sqlite3 -- no runtime
dependencies beyond a POSIX shell, Bash 4.4+, and `sqlite3` (3.46.1+ with
JSON1). Designed for machine-to-machine messaging where every participant
is an autonomous agent, a human, or a distribution list.

## Quick orientation

```
bin/inbox          CLI entrypoint (argv router, env, output discipline)
lib/               Modular library (one file per concern)
schema/            SQLite DDL and seed data
tests/             Bash test harness with test_*.sh suites
docs/              Reference, guides, and conventions
```

Run `bin/inbox --help` to see all 17 commands.

---

## 1. Gitflow rules

| Branch pattern        | Purpose                              | Merges into     |
|-----------------------|--------------------------------------|-----------------|
| `main`                | Sacred -- tagged releases only       | --              |
| `dev-phaseN`          | Phase integration branch             | `main` (via PR) |
| `feat/issue-N-slug`   | Feature or fix work                  | `dev-phaseN`    |

- **Never commit directly to `main`.** All code reaches `main` through a
  reviewed PR from a `dev-phase*` branch.
- Feature branches are short-lived: one issue, one branch, merge and delete.
- Merge commits preserve the audit trail (`--no-ff` is fine).

---

## 2. Architecture at a glance

### Storage model

SQLite 3.46.1 STRICT tables. All IDs are application-generated TEXT values
with typed prefixes (`msg_`, `cnv_`, `dly_`, `addr_`, `evt_`, `ref_`,
`mpr_`, `fbk_`). IDs are sortable: `{prefix}{timestamp_hex_12}_{random_hex_8}`.

Schema: `schema/001-init.sql` (10 tables, 8 triggers, 11 indexes).

Key tables:
- `addresses` -- agents, humans, services, lists
- `messages` -- immutable message content, threaded via `conversation_id` + `parent_message_id`
- `deliveries` -- per-recipient inbox state (engagement + visibility)
- `sent_items` -- sender-side visibility tracking
- `delivery_events` -- audit log of state transitions
- `delivery_sources` -- tracks how a delivery reached the recipient (direct vs list)

### Resolution model

All resolvers live in `lib/resolve.sh`. The resolver is the single shared
gate for actor validation, inbox/sent lookups, thread visibility, list
expansion, and reply-all audience construction.

Thread visibility rule: a message is visible to an actor if and only if the
actor has a delivery OR the actor is the sender with a sent_item. Self-send
produces both; hiding one view does not affect the other.

### ID generation

`generate_id "prefix_"` in `lib/common.sh`. Format:
`{prefix}{ms_hex_12}_{urandom_hex_8}`. Sortable by creation time, unique
enough for single-node operation. No UUID dependency.

---

## 3. Integration seams

The architecture has 5 integration boundaries:

| # | Seam              | Boundary                                                 | File(s)                |
|---|-------------------|----------------------------------------------------------|------------------------|
| 1 | **Storage**       | All SQL goes through `db_exec`, `db_query`, `db_transaction` | `lib/db.sh`           |
| 2 | **Resolution**    | Actor, inbox, sent, thread, list, reply-all resolvers    | `lib/resolve.sh`       |
| 3 | **Command/Service** | `cmd_*` handlers wire parsing to library to formatting  | `lib/commands.sh`      |
| 4 | **CLI**           | argv routing, env validation, `--json`/text switching    | `bin/inbox`            |
| 5 | **Telemetry**     | NDJSON capture with safe/dangerous-full-context modes    | `lib/telemetry.sh`     |

Each seam has a dedicated test gate (Gates 1-5). Changes that cross a seam
boundary should update tests on both sides.

---

## 4. Environment variables

| Variable                      | Required | Default                          | Purpose                                     |
|-------------------------------|----------|----------------------------------|---------------------------------------------|
| `INBOX_ADDRESS`               | Yes      | --                               | Acting address (`local@host`)               |
| `INBOX_DB`                    | Yes      | --                               | SQLite database file path                   |
| `INBOX_EXPERIMENTAL_MODE`     | No       | `0`                              | Enable experimental discovery surfaces      |
| `INBOX_EXPERIMENTAL_PROFILE`  | No       | `core`                           | Profile tier: `core`, `broad`, `frontier`   |
| `INBOX_EXPERIMENTAL_CAPTURE`  | No       | `safe`                           | Telemetry capture: `safe` or `dangerous-full-context` |
| `INBOX_EXPERIMENTAL_LOG`      | No       | `~/.inbox/feedback.ndjson`       | NDJSON log file for telemetry + feedback    |

---

## 5. Module responsibility map

| File                  | Owns                                                      |
|-----------------------|-----------------------------------------------------------|
| `lib/common.sh`      | Exit codes, ID generation, timestamps, JSON helpers       |
| `lib/db.sh`          | SQLite connection, init, query, transaction, existence     |
| `lib/resolve.sh`     | Actor, inbox, sent, thread, list, reply-all resolvers     |
| `lib/send.sh`        | Send and reply transactions (compose, resolve, deliver)   |
| `lib/mutate.sh`      | State mutations: read, ack, hide, unhide (delivery+sent)  |
| `lib/query.sh`       | List inbox, read message, sent view, thread view, directory |
| `lib/parse.sh`       | CLI input: body sources, refs, time filters, ID validation |
| `lib/format.sh`      | Output formatting: JSON/text switching, table display     |
| `lib/commands.sh`    | CLI command handlers: wire parsing to library to format   |
| `lib/experimental.sh`| Experimental discovery mode, give-feedback, probe logic   |
| `lib/telemetry.sh`   | NDJSON telemetry capture with safe/dangerous modes        |

---

## 6. Validated technical decisions

These decisions are locked in and tested. See `docs/reference/architecture-decisions.md`
for rationale.

1. **SQLite 3.46.1 STRICT** -- type safety at the storage layer; no ORM.
2. **Sortable hex IDs** -- `{prefix}{ms_hex}_{random_hex}` avoids UUID
   dependency while preserving temporal ordering and prefix-based validation.
3. **Pure Bash** -- zero runtime dependencies beyond bash + sqlite3.
   No Python, no jq, no Node.
4. **All-or-nothing transactions** -- `db_transaction` wraps multi-step
   mutations in BEGIN/COMMIT with ROLLBACK on failure.
5. **Engagement + visibility as independent axes** -- `engagement_state`
   (unread/read/acknowledged) and `visibility_state` (active/hidden) are
   orthogonal. Hiding does not affect engagement history.
6. **Thread visibility union** -- delivered messages + sent messages, with
   deduplication for self-send.
7. **Idempotent mutations** -- repeated ack/hide/unhide operations are
   no-ops that return `changed: false`.
8. **Flat JSON envelopes** -- `{ok: true, ...}` or `{ok: false, error: {...}}`.
   No nested response wrappers.
9. **List expansion at send time** -- lists are expanded to individual
   deliveries; delivery_sources records provenance.
10. **Experimental surfaces never mutate protocol state** -- probes return
    `coming_soon`; feedback goes to NDJSON log only.

---

## 7. Testing

### Running tests

```bash
# All gates
bash tests/runner.sh

# Single gate
bash tests/runner.sh --gate 2

# Verbose output
bash tests/runner.sh --verbose
```

### Test file conventions

- Each file is `tests/test_<name>.sh` and declares `TEST_GATE=N`.
- Each test function uses `setup_test_db` / `teardown_test_db` for isolation.
- Assertions: `assert_eq`, `assert_neq`, `assert_contains`, `assert_exit_code`,
  `assert_json_field`, `assert_json_ok`, `assert_json_error`.
- End-to-end UAT tests invoke `bin/inbox` as a subprocess.

### Quality gates

| Gate | Scope                                | Test file(s)          |
|------|--------------------------------------|-----------------------|
| 1    | Schema DDL + invariants              | `test_schema.sh`      |
| 2    | Resolution + visibility              | `test_resolve.sh`     |
| 3    | Write path + mutations               | `test_write.sh`, `test_mutate.sh` |
| 4    | CLI contracts + experimental         | `test_cli.sh`, `test_experimental.sh` |
| 5    | UAT end-to-end scenarios             | `test_uat.sh`         |

---

## 8. PR and code review

- One PR per issue. Feature branch merges into the current `dev-phase*`.
- PRs should include test coverage for any new behavior.
- Review checklist:
  - SQL uses parameterized queries or proper escaping (see Security below)
  - JSON output matches the flat envelope contract
  - Exit codes match the documented mapping
  - Mutations are idempotent
  - Thread visibility invariants are preserved

---

## 9. Security

### SQL injection prevention

All dynamic values interpolated into SQL must be escaped. The project
uses SQLite's single-quote escaping (`'` -> `''`) for string values
embedded in queries. Never concatenate raw user input into SQL.

The `json_escape` function in `lib/common.sh` handles JSON output
escaping (backslash, double-quote, control characters).

### stdin detection

Body text can come from `--body`, `--body-file`, or stdin pipe.
The CLI detects stdin availability via `[[ ! -t 0 ]]` combined with
`[[ -p /dev/stdin || -f /dev/stdin ]]`. Multiple body sources in
the same invocation are rejected (`invalid_argument`).

### Reference file size limits

`--ref-file` enforces a 1,048,576 byte (1 MiB) hard limit to prevent
resource exhaustion.

---

## 10. Progressive discovery

Detailed documentation lives under `docs/`:

| Path                                  | Contents                            |
|---------------------------------------|-------------------------------------|
| `docs/reference/architecture-decisions.md` | Key technical decisions and why |
| `docs/reference/spec-summary.md`      | Condensed spec reference            |
| `docs/guides/dev-workflow.md`         | How to develop, test, commit        |
| `docs/conventions/code-review.md`     | Review process and checklist        |

Planning documents (original spec, implementation plans) are in
`docs/planning/` for historical reference.
