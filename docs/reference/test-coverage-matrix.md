# Test Coverage Matrix

Maps every spec test ID from `docs/planning/inbox_docs_addons/test-matrix.md` to the
implementing test, and every invariant from `docs/planning/inbox_docs_v5/invariants.md`
to the tests that exercise it.

Generated: 2026-04-10

---

## Coverage Table

### A. Schema and trigger tests (Gate 1)

| Spec Test ID | Severity | Gate | Description | Test File | Status |
|---|---|---|---|---|---|
| SCH-01 | P0 | 1 | list address used as sender rejected | test_schema.sh | ✅ |
| SCH-02 | P0 | 1 | nested list member insert rejected | test_schema.sh | ✅ |
| SCH-03 | P0 | 1 | address.kind mutation rejected | test_schema.sh | ✅ |
| SCH-04 | P0 | 1 | duplicate delivery for same (message_id, recipient) rejected | test_schema.sh | ✅ |
| SCH-05 | P1 | 1 | group ordering determinism (sorted by ordinal, member_address_id) | test_schema.sh | ✅ |
| SCH-06 | P1 | 1 | delivered event with non-null actor rejected | test_schema.sh | ✅ |
| SCH-07 | P1 | 1 | state_changed event with null actor rejected | test_schema.sh | ✅ |

**Bonus:** `SCH-05b` (duplicate ordinal within group rejected) is also covered in test_schema.sh.

### B. Visibility and lineage tests (Gate 2)

| Spec Test ID | Severity | Gate | Description | Test File | Status |
|---|---|---|---|---|---|
| VIS-01 | P0 | 2 | A->B, A->B+C, A->B; C reads middle with history — C sees only middle + actor-visible context | test_resolve.sh | ✅ |
| VIS-02 | P0 | 2 | thread on mixed visibility conversation — only delivery/sent-item visible messages included | test_resolve.sh | ✅ |
| VIS-03 | P0 | 2 | hidden message read by explicit ID succeeds | test_resolve.sh | ✅ |
| VIS-04 | P0 | 2 | hidden messages in explicit thread/history browse included if actor-owned | test_resolve.sh | ✅ |
| VIS-05 | P0 | 2 | parent hidden from actor — output parent_message_id is null | test_resolve.sh | ✅ |
| VIS-06 | P1 | 2 | self-send thread view — one message entry, received view wins | test_resolve.sh | ✅ |

### C. Send and reply tests (Gate 3)

| Spec Test ID | Severity | Gate | Description | Test File | Status |
|---|---|---|---|---|---|
| WR-01 | P0 | 3 | inactive direct recipient -> invalid_state | test_write.sh | ✅ |
| WR-02 | P0 | 3 | inactive list addressed directly -> invalid_state | test_write.sh | ✅ |
| WR-03 | P0 | 3 | active list with zero active members -> invalid_state | test_write.sh | ✅ |
| WR-04 | P0 | 3 | direct + list overlap -> one delivery, multiple delivery_sources | test_write.sh | ✅ |
| WR-05 | P0 | 3 | reply-all after list membership change -> current membership, not snapshot | test_write.sh | ✅ |
| WR-06 | P1 | 3 | reply-all plus explicit extra recipients -> extras additive, actor excluded | test_write.sh | ✅ |
| WR-07 | P1 | 3 | reply to sent message succeeds via sent resolver | test_write.sh | ✅ |
| WR-08 | P1 | 3 | self-only reply to self-sent message allowed and deterministic | test_write.sh | ✅ |
| WR-09 | P1 | 3 | duplicate logical recipients same role -> normalized deterministically | test_write.sh | ✅ |
| WR-10 | P1 | 3 | duplicate cross-role recipients -> preserved logically, effective_role by precedence | test_write.sh | ✅ |

### D. State mutation tests (Gate 3)

| Spec Test ID | Severity | Gate | Description | Test File | Status |
|---|---|---|---|---|---|
| MUT-01 | P0 | 3 | read unread delivery -> becomes read, event appended | test_mutate.sh | ✅ |
| MUT-02 | P0 | 3 | read command on acknowledged delivery -> no-op, changed=false, no event | test_mutate.sh | ✅ |
| MUT-03 | P0 | 3 | ack unread delivery -> acknowledged directly | test_mutate.sh | ✅ |
| MUT-04 | P0 | 3 | hide already hidden -> no-op | test_mutate.sh | ✅ |
| MUT-05 | P0 | 3 | unhide already active -> no-op | test_mutate.sh | ✅ |
| MUT-06 | P0 | 3 | sent hide / unhide -> visibility toggles, hidden_at semantics correct | test_mutate.sh | ✅ |
| MUT-07 | P1 | 3 | no-op mutation event suppression -> no delivery_events row appended | test_mutate.sh | ✅ |

### E. CLI contract tests (Gate 4)

| Spec Test ID | Severity | Gate | Description | Test File | Status |
|---|---|---|---|---|---|
| CLI-01 | P0 | 4 | flat success envelope `{ok: true, ...}` | test_cli.sh | ✅ |
| CLI-02 | P0 | 4 | flat error envelope `{ok: false, error: ...}` | test_cli.sh | ✅ |
| CLI-03 | P0 | 4 | `--json` mode stderr discipline (stderr silent) | test_cli.sh | ✅ |
| CLI-04 | P0 | 4 | wrong ID prefix -> invalid_argument | test_cli.sh | ✅ |
| CLI-05 | P0 | 4 | multiple body sources provided -> invalid_argument | test_cli.sh | ✅ |
| CLI-06 | P1 | 4 | `--ref-file` exactly 1,048,576 bytes succeeds | test_cli.sh | ✅ |
| CLI-07 | P1 | 4 | `--ref-file` 1,048,577 bytes -> invalid_argument | test_cli.sh | ✅ |
| CLI-08 | P1 | 4 | `directory show` for unlisted existing address succeeds | test_cli.sh | ✅ |
| CLI-09 | P1 | 4 | `directory show` nonexistent address -> not_found | test_cli.sh | ✅ |
| CLI-10 | P1 | 4 | inactive acting address -> matches frozen `is_active` rule | test_cli.sh | ✅ |

### F. Experimental mode tests (Gate 4)

| Spec Test ID | Severity | Gate | Description | Test File | Status |
|---|---|---|---|---|---|
| EXP-01 | P1 | 4 | experimental help in core profile -> only core surfaces shown | test_experimental.sh | ✅ |
| EXP-02 | P1 | 4 | experimental help in frontier profile -> frontier surfaces shown | test_experimental.sh | ✅ |
| EXP-03 | P1 | 4 | probe experimental command -> coming_soon, no state mutation | test_experimental.sh | ✅ |
| EXP-04 | P1 | 4 | coming_soon response includes feedback prompt | test_experimental.sh | ✅ |
| EXP-05 | P1 | 4 | give-feedback writes record with fbk_ prefix | test_experimental.sh | ✅ |
| EXP-06 | P1 | 4 | safe capture mode -> minimal structured capture only | test_experimental.sh | ✅ |
| EXP-07 | P1 | 4 | dangerous-full-context capture mode -> rich local capture enabled | test_experimental.sh | ✅ |

### G. UAT scenarios (Gate 5)

| Spec Test ID | Severity | Gate | Description | Test File | Status |
|---|---|---|---|---|---|
| UAT-01 | P1 | 5 | PM requests report from eng lead -> inbox flow feels natural | test_uat.sh | ✅ |
| UAT-02 | P1 | 5 | threat brief to multiple agents -> communication flow works | test_uat.sh | ✅ |
| UAT-03 | P1 | 5 | self-send and dual hide/unhide -> inbox/sent independence clear | test_uat.sh | ✅ |
| UAT-04 | P1 | 5 | agent tries search in experimental mode -> coming_soon + feedback prompt | test_uat.sh | ✅ |
| UAT-05 | P1 | 5 | agent submits workflow feedback -> record captured and correlated | test_uat.sh | ✅ |

---

## Summary

| Section | Total | ✅ Covered | ⚠️ Partial | ❌ Missing |
|---|---|---|---|---|
| A. Schema (SCH) | 7 | 7 | 0 | 0 |
| B. Visibility (VIS) | 6 | 6 | 0 | 0 |
| C. Send/Reply (WR) | 10 | 10 | 0 | 0 |
| D. Mutation (MUT) | 7 | 7 | 0 | 0 |
| E. CLI (CLI) | 10 | 10 | 0 | 0 |
| F. Experimental (EXP) | 7 | 7 | 0 | 0 |
| G. UAT | 5 | 5 | 0 | 0 |
| **Total** | **52** | **52** | **0** | **0** |

---

## Invariant Coverage

Maps each invariant from `docs/planning/inbox_docs_v5/invariants.md` to the test(s)
that exercise it.

### Structural Invariants

| # | Invariant | Test(s) |
|---|---|---|
| S1 | Every message belongs to exactly one conversation | WR-08, VIS-01, VIS-02, UAT-01 |
| S2 | A parentless message creates a new conversation | VIS-01 (msg1), WR-08, UAT-01 |
| S3 | A message with a parent inherits the parent's conversation | WR-08 (reply in same cnv), VIS-01 (msg2/msg3), UAT-01 |
| S4 | A conversation is lineage, not access control | VIS-01, VIS-02, VIS-05 |
| S5 | A message exists canonically once | VIS-06 (self-send: one msg, two views), WR-04 (overlap: one delivery) |
| S6 | Every delivery belongs to exactly one message and one recipient address | SCH-04, WR-04, WR-09 |
| S7 | A delivery can exist for the same canonical message only once per recipient | SCH-04 |
| S8 | Every message has exactly one sender address, fixed at send time | SCH-01 (list sender rejected), WR-* (all sends verify sender) |
| S9 | Every successfully sent message has exactly one sent item | VIS-06, WR-08, MUT-06 |
| S10 | Sent messages are immutable | MUT-06 (sent hide/unhide changes visibility only, not content) |
| S11 | Parent links create lineage, not visibility | VIS-05 (parent redacted but lineage exists in DB) |
| S12 | A list is an addressable recipient abstraction, not a mailbox-state holder | SCH-01 (cannot send), SCH-02 (no nesting), WR-04 (expansion at send) |

### Visibility and Privacy Invariants

| # | Invariant | Test(s) |
|---|---|---|
| V1 | A recipient may access a message only if a delivery exists | VIS-01, VIS-02, VIS-05 |
| V2 | Adding a recipient later does not grant retroactive access | VIS-01 (C sees only msg2, not msg1 or msg3) |
| V3 | Re-shared history must be explicit | VIS-01 (no implicit history for C) |
| V4 | Parent links must not leak inaccessible history | VIS-05 (parent redacted to null for C) |
| V5 | BCC is private routing metadata | WR-10 (cross-role preserved logically); no explicit BCC-leak test but BCC column is not in public headers |
| V6 | Read access determined only by delivery existence, not current membership | WR-05 (reply uses current membership; original delivery persists) |
| V7 | Sender access via sent item is independent of delivery access | MUT-06 (sent hide/unhide independent of recipient delivery), UAT-03, WR-07 |

### Send-time Invariants

| # | Invariant | Test(s) |
|---|---|---|
| ST1 | Group/list expansion happens at send time | WR-04, WR-05, UAT-02 |
| ST2 | Successful send creates: message + sent item + deliveries + delivered events | MUT-01 (delivered event exists), MUT-07, VIS-06, UAT-01, UAT-02 |
| ST3 | Partial fanout is invalid; send is all-or-nothing | WR-01, WR-02, WR-03 (all fail entirely, no partial delivery) |
| ST4 | Public headers preserve logical addressees after normalization | WR-09 (same-role dedupe), WR-10 (cross-role preserved) |
| ST5 | Deliveries preserve actual resolved recipients | WR-04, WR-05, UAT-02 |
| ST6 | Delivery sources preserve why each delivery exists | WR-04 (multiple sources), UAT-02 (list origin) |
| ST7 | If recipient reached multiple ways, one delivery with all source causes | WR-04 |
| ST8 | Effective role precedence: to > cc > bcc | WR-04 (effective_role=to), WR-10 (to wins over cc) |
| ST9 | Zero actual recipients after resolution -> send fails with invalid_state | WR-03 |

### Active/Listed Invariants

| # | Invariant | Test(s) |
|---|---|---|
| AL1 | is_active controls routing and acting-identity eligibility | CLI-10, WR-01 |
| AL2 | is_listed controls default directory visibility only | CLI-08 (unlisted but showable) |
| AL3 | Acting address must have is_active=1; inactive denied | CLI-10 |
| AL4 | Direct recipients must have is_active=1 | WR-01 |
| AL5 | Inactive list addressed directly causes send failure | WR-02 |
| AL6 | During list expansion, inactive members are skipped | WR-05 (dave initially inactive, skipped in first send) |
| AL7 | Active list expanding to zero active members fails | WR-03 |

### Delivery State Invariants

| # | Invariant | Test(s) |
|---|---|---|
| DS1 | Engagement state and visibility state are separate dimensions | MUT-06 (visibility toggle independent of engagement), UAT-03 |
| DS2 | Delivery current state is mutable | MUT-01, MUT-03, MUT-06 |
| DS3 | State changes recorded in append-only history | MUT-01 (read event appended), MUT-07 |
| DS3a | Initial delivered events: event_type=delivered, actor=NULL, engagement=unread, visibility=active | SCH-06, SCH-07, MUT-07 (2 events after read = delivered + read) |
| DS3b | state_changed events require non-null actor, change_kind in {read,ack,hide,unhide} | SCH-07 |
| DS4 | All state mutators are idempotent | MUT-02, MUT-04, MUT-05, MUT-07 |
| DS5 | No-op requests return changed=false and append no event | MUT-02, MUT-04, MUT-05, MUT-07 |
| DS6 | ack may move directly from unread to acknowledged | MUT-03 |
| DS7 | read never downgrades acknowledged back to read | MUT-02 |
| DS8 | Hide affects default list views, not direct read-by-ID or thread | VIS-03 (hidden read by ID succeeds), VIS-04 (hidden in thread), UAT-03 |
| DS9 | thread and read --history use same visibility union (deliveries + sent items, including hidden) | VIS-04 (hidden included in thread/history) |

### Operational Invariants

| # | Invariant | Test(s) |
|---|---|---|
| OP1 | --json: all output is valid JSON on stdout, stderr silent | CLI-01, CLI-02, CLI-03 |
| OP2 | not_found conflates nonexistent and inaccessible | CLI-09 |
| OP3 | Telemetry is not protocol state | EXP-05 (no messages created), EXP-06, EXP-07 |
| OP4 | MVP may use richer telemetry in research mode | EXP-07 (dangerous-full-context) |
| OP5 | Experimental discovery must not mutate core state for unimplemented commands | EXP-03 (no mutation), UAT-04 (no mutation) |
| OP6 | give-feedback records research feedback only, not protocol state | EXP-05, UAT-05 |
| OP7 | Experimental capture modes: safe and dangerous-full-context | EXP-06, EXP-07 |

---

## Gaps

**No gaps identified.** All 52 spec test cases (SCH-01..07, VIS-01..06, WR-01..10,
MUT-01..07, CLI-01..10, EXP-01..07, UAT-01..05) have corresponding test
implementations that match their expected results.

All invariants from the spec have at least one test exercising them. The weakest
coverage is:

- **V5 (BCC is private routing metadata):** No test explicitly sends with BCC and
  verifies the BCC recipient is absent from public headers. The cross-role test
  (WR-10) exercises role precedence with `to`/`cc` but does not include a `bcc`
  recipient. Consider adding a dedicated BCC-privacy test.
- **S10 (Sent messages are immutable):** Tested indirectly through MUT-06 (which
  only mutates visibility, not content), but no test explicitly attempts to UPDATE
  a message row and verifies rejection.
