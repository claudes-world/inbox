# Inbox MVP Test Matrix

This matrix maps the frozen spec to executable checks.

## Legend
- Severity: P0 / P1 / P2
- Gate: 1 schema, 2 resolvers, 3 write path, 4 CLI contracts, 5 UAT

## A. Schema and trigger tests

| ID | Severity | Gate | Scenario | Expected result |
|---|---|---:|---|---|
| SCH-01 | P0 | 1 | list address used as sender | insert rejected |
| SCH-02 | P0 | 1 | nested list member insert | rejected |
| SCH-03 | P0 | 1 | address.kind mutation | rejected |
| SCH-04 | P0 | 1 | duplicate delivery for same `(message_id, recipient)` | rejected |
| SCH-05 | P1 | 1 | group ordering determinism | sorted by `(ordinal, member_address_id)` or unique ordinal enforced |
| SCH-06 | P1 | 1 | delivered event with non-null actor | rejected |
| SCH-07 | P1 | 1 | state_changed event with null actor | rejected |

## B. Visibility and lineage tests

| ID | Severity | Gate | Scenario | Expected result |
|---|---|---:|---|---|
| VIS-01 | P0 | 2 | A→B, A→B+C, A→B; C reads middle with history | C sees only middle + actor-visible context |
| VIS-02 | P0 | 2 | thread on mixed visibility conversation | only delivery/sent-item visible messages included |
| VIS-03 | P0 | 2 | hidden message read by explicit ID | succeeds |
| VIS-04 | P0 | 2 | hidden messages in explicit thread/history browse | included if actor-owned |
| VIS-05 | P0 | 2 | parent hidden from actor | output parent_message_id is null |
| VIS-06 | P1 | 2 | self-send thread view | one message entry, received view wins |

## C. Send and reply tests

| ID | Severity | Gate | Scenario | Expected result |
|---|---|---:|---|---|
| WR-01 | P0 | 3 | inactive direct recipient | invalid_state |
| WR-02 | P0 | 3 | inactive list addressed directly | invalid_state |
| WR-03 | P0 | 3 | active list with zero active members | invalid_state: no recipients resolved |
| WR-04 | P0 | 3 | direct + list overlap | one delivery, multiple delivery_sources |
| WR-05 | P0 | 3 | reply-all after list membership change | reply expands current list membership, not old snapshot |
| WR-06 | P1 | 3 | reply-all plus explicit extra recipients | extras additive, acting address excluded |
| WR-07 | P1 | 3 | reply to sent message | succeeds via sent resolver |
| WR-08 | P1 | 3 | self-only reply to self-sent message | allowed and deterministic |
| WR-09 | P1 | 3 | duplicate logical recipients same role | normalized deterministically |
| WR-10 | P1 | 3 | duplicate cross-role recipients | preserved logically, effective_role by precedence |

## D. State mutation tests

| ID | Severity | Gate | Scenario | Expected result |
|---|---|---:|---|---|
| MUT-01 | P0 | 3 | read unread delivery | becomes read, event appended |
| MUT-02 | P0 | 3 | read command on acknowledged delivery | no-op, changed=false, no event |
| MUT-03 | P0 | 3 | ack unread delivery | acknowledged directly |
| MUT-04 | P0 | 3 | hide already hidden | no-op |
| MUT-05 | P0 | 3 | unhide already active | no-op |
| MUT-06 | P0 | 3 | sent hide / unhide | visibility toggles, hidden_at semantics correct |
| MUT-07 | P1 | 3 | no-op mutation event suppression | no delivery_events row appended |

## E. CLI contract tests

| ID | Severity | Gate | Scenario | Expected result |
|---|---|---:|---|---|
| CLI-01 | P0 | 4 | flat success envelope | `{\"ok\": true, ...}` |
| CLI-02 | P0 | 4 | flat error envelope | `{\"ok\": false, \"error\": ...}` |
| CLI-03 | P0 | 4 | `--json` mode stderr discipline | stderr silent |
| CLI-04 | P0 | 4 | wrong ID prefix | invalid_argument |
| CLI-05 | P0 | 4 | multiple body sources provided | invalid_argument before deeper validation |
| CLI-06 | P1 | 4 | `--ref-file` exactly 1,048,576 bytes | succeeds |
| CLI-07 | P1 | 4 | `--ref-file` 1,048,577 bytes | invalid_argument |
| CLI-08 | P1 | 4 | `directory show` for unlisted existing address | succeeds |
| CLI-09 | P1 | 4 | `directory show` nonexistent address | not_found |
| CLI-10 | P1 | 4 | inactive acting address | behavior matches frozen `is_active` rule |

## F. Experimental mode tests

| ID | Severity | Gate | Scenario | Expected result |
|---|---|---:|---|---|
| EXP-01 | P1 | 4 | experimental help in core profile | only core surfaces shown |
| EXP-02 | P1 | 4 | experimental help in frontier profile | frontier surfaces shown |
| EXP-03 | P1 | 4 | probe experimental command | `coming_soon`, no Inbox state mutation |
| EXP-04 | P1 | 4 | `coming_soon` response includes feedback prompt | yes |
| EXP-05 | P1 | 4 | `give-feedback` writes record | success + feedback_id |
| EXP-06 | P1 | 4 | safe capture mode | minimal structured capture only |
| EXP-07 | P1 | 4 | dangerous-full-context capture mode | rich local capture enabled |

## G. UAT scenarios

| ID | Severity | Gate | Scenario | Expected result |
|---|---|---:|---|---|
| UAT-01 | P1 | 5 | PM requests report from eng lead | inbox flow feels natural |
| UAT-02 | P1 | 5 | threat brief to multiple agents | communication flow works |
| UAT-03 | P1 | 5 | self-send and dual hide/unhide | inbox/sent independence clear |
| UAT-04 | P1 | 5 | agent tries search in experimental mode | gets `coming_soon` + feedback prompt |
| UAT-05 | P1 | 5 | agent submits workflow feedback | record captured and correlated |

## Notes

- History ordering: select N prior visible messages and return oldest-to-newest.
- Thread ordering: select newest N visible messages, then return oldest-to-newest within that selected window.
- Time windows use half-open semantics: `since >=`, `until <`.
