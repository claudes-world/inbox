# Inbox MVP Implementation Checklist

This checklist translates the frozen v5 spec suite into execution steps for planning and build agents.

## Phase 0: freeze prerequisites

- [ ] Normative docs frozen
- [ ] `schema.sql` published and accepted
- [ ] `json-contracts.md` published and accepted
- [ ] Command surface frozen
- [ ] Error vocabulary frozen
- [ ] Final patch list resolved

## Phase 1: persistence foundation

- [ ] Initialize SQLite with required pragmas
- [ ] Apply schema DDL
- [ ] Apply triggers
- [ ] Verify indexes exist
- [ ] Smoke-test bootstrap on empty DB
- [ ] Seed minimal fixture addresses/lists

Acceptance:
- schema loads cleanly
- trigger violations fail as expected
- basic inserts/selects succeed

## Phase 2: core resolution engines

- [ ] Actor resolver: `INBOX_ADDRESS -> addresses row`
- [ ] Inbox resolver: `(msg_id, actor) -> delivery`
- [ ] Sent resolver: `(msg_id, actor) -> sent_item`
- [ ] Thread visibility union resolver
- [ ] Direct recipient validator
- [ ] List expansion resolver (active members only)
- [ ] Recipient normalization engine
- [ ] Reply-all audience construction engine

Acceptance:
- visibility rules match invariants
- self-send resolution behaves as frozen
- reply-all uses logical headers, not expanded snapshots

## Phase 3: write path

- [ ] `send` transaction
- [ ] `reply` transaction
- [ ] `ack` mutation
- [ ] `hide` / `unhide` mutation
- [ ] `sent hide` / `sent unhide` mutation
- [ ] `give-feedback` write path
- [ ] experimental no-op path

Acceptance:
- writes are atomic where required
- no-op mutations append no events
- delivered/state_changed conventions hold

## Phase 4: read/query path

- [ ] `whoami`
- [ ] `list`
- [ ] `read`
- [ ] `thread`
- [ ] `sent list`
- [ ] `sent read`
- [ ] directory queries

Acceptance:
- output matches JSON contracts
- ordering and filters match spec
- thread/history share visibility union

## Phase 5: CLI harness

- [ ] argv parsing
- [ ] typed ID validation
- [ ] one body-source rule
- [ ] `--ref` / `--ref-file` parsing
- [ ] `--json` stdout discipline
- [ ] text output formatting
- [ ] exit code mapping
- [ ] help output

Acceptance:
- all frozen commands reachable
- invalid combinations fail deterministically

## Phase 6: experimental mode + telemetry

- [ ] experimental env handling
- [ ] core/broad/frontier help surfaces
- [ ] `coming_soon` response path
- [ ] `give-feedback` prompt path
- [ ] OTEL spans/events
- [ ] NDJSON safe capture
- [ ] NDJSON dangerous-full-context capture

Acceptance:
- experimental probes never mutate Inbox protocol state
- telemetry contracts stable

## Phase 7: quality gates

- [ ] Gate 1 schema + trigger tests
- [ ] Gate 2 resolver tests
- [ ] Gate 3 write-path tests
- [ ] Gate 4 CLI contract tests
- [ ] Gate 5 UAT scenarios

Acceptance:
- all P0/P1 must-pass tests green
- no unresolved JSON contract drift
- no unresolved visibility/privacy regressions

## Workstream ownership suggestion

- Workstream A: schema + triggers + migrations
- Workstream B: resolvers + normalization + audience construction
- Workstream C: write path
- Workstream D: read/query path
- Workstream E: CLI harness
- Workstream F: contracts + examples + output validation
- Workstream G: tests + gates + fixtures
- Workstream H: telemetry + experimental mode

## Anti-drift reminders

- Do not duplicate visibility logic across commands.
- Do not let reply-all use expanded old deliveries.
- Do not append events on no-op mutations.
- Do not let experimental mode mutate Inbox state.
- Do not fork JSON field names across commands.
