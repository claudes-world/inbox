# Inbox — Quality Gates, Testing Strategy, and UAT

This doc defines when and how to test the system so errors do not compound as parallel workstreams merge.

## Testing philosophy
Inbox has a few load-bearing invariants. Those need to be tested early and repeatedly, not only at the end.

The biggest risks are:
- visibility leaks
- list expansion mistakes
- reply audience mistakes
- state-transition/event drift
- CLI output drift between text and JSON

## Test layers

### 1. Schema / persistence tests
Purpose:
- prove triggers and constraints actually enforce the locked rules

Examples:
- cannot mutate `addresses.kind`
- list cannot send
- nested lists rejected
- group must reference a list
- composite parent/conversation relationship enforced
- duplicate delivery per `(message_id, recipient_address_id)` rejected
- deterministic list-member ordering enforced (unique ordinal or documented secondary sort)
- immutable/append-only core enforcement behaves as documented

### 2. Resolver tests
Purpose:
- prove message-to-local-view resolution works exactly as specified

Examples:
- inbox resolver finds only actor deliveries
- sent resolver finds only actor sent items
- delivery wins over sent-item resolution when both exist
- thread visibility union includes actor-visible received + actor-sent messages only
- read `--history` uses the same visibility union as `thread`
- parent-link redaction/nulling is correct when parent is not visible
- not-found conflates nonexistent and inaccessible cases

### 3. Transaction tests
Purpose:
- prove write-path atomicity and state semantics

Examples:
- send is all-or-nothing
- inactive actor fails with `permission_denied` before deeper validation (if inactive actors are fully disabled in MVP)
- inactive direct recipient fails
- inactive list addressed directly fails
- active list with zero active members fails
- mixed active/inactive list members resolves only active members
- direct + list overlap creates one delivery and multiple delivery_sources
- every successful send creates exactly one sent_item
- read transitions unread -> read unless `--peek`
- ack can jump unread -> acknowledged
- no-op transitions append no event
- delivered events always record unread/active
- state_changed events always carry a non-null actor and a stable semantic discriminator (`change_kind` or equivalent frozen metadata shape)

### 4. CLI contract tests
Purpose:
- prove agent-facing behavior is stable

Examples:
- `--json` sends all output to stdout and nothing to stderr
- text output stays concise and stable
- bad ID prefixes fail with `invalid_argument`
- body-source ambiguity fails loudly
- `reply --all` uses logical headers, not expanded delivery snapshot
- whoami includes the resolved DB path / acting identity context
- experimental `coming_soon` responses never mutate protocol state
- `inbox give-feedback` records feedback without touching protocol-state tables

### 5. End-to-end scenario tests
Purpose:
- prove the real workflows feel correct

Examples:
- PM sends to a list
- engineer receives via list and replies
- sender hides from sent, recipient still sees inbox item
- self-send creates both sent and inbox views independently
- self-send thread view does not duplicate the message and prefers received view semantics
- hidden message still reads by explicit id
- thread shows hidden-but-owned messages

## Gating plan

### Gate 0 — design freeze
Required before implementation branches proliferate:
- spec docs frozen for MVP
- schema names frozen
- command names frozen
- error vocabulary frozen

### Gate 1 — schema gate
Required before command implementation proceeds broadly:
- migrations run cleanly on empty DB
- triggers proven with tests
- seed data loads cleanly

### Gate 2 — resolver gate
Required before send/reply/read/thread merge:
- actor resolution stable
- inbox vs sent resolution stable
- thread visibility filter tested

### Gate 3 — write-path gate
Required before CLI polishing:
- send transaction passes atomicity tests
- reply semantics pass logical-header tests
- delivery_sources multi-source cases pass
- no-op event suppression works

### Gate 4 — CLI gate
Required before wider agent usage:
- all commands return stable JSON/text
- `--json` discipline holds universally
- exit code mapping stable
- whoami / list / read / thread outputs stable enough for downstream agents

### Gate 5 — UAT gate
Required before broader planning/build-agent handoff or live usage:
- golden-path workflows all pass
- invariant regression suite green
- telemetry visible and useful
- no known visibility leak bugs

## Recommended must-pass invariant tests

### Visibility tests
1. Conversation is lineage, not access:
   - A sends msg1 to B
   - A sends msg2 to B and C
   - A sends msg3 to B
   - C reads msg2 with `--history` and also browses the thread
   - C must see msg2 only; C must not see msg1 or msg3

2. Hidden-but-owned direct read:
   - B hides msg2
   - B can still read msg2 by ID

3. Thread includes hidden-but-owned:
   - B runs `thread` on the conversation
   - hidden messages still appear

### Reply tests
4. Reply-all uses logical headers:
   - original sent to `eng-leads@lists` when membership is [A, B]
   - membership changes to [A, C]
   - reply-all must target `eng-leads@lists`, not frozen prior member set
   - reply fanout must reach current member C and not stale member B

5. Reply resolution order:
   - actor both sent and received same message
   - delivery path wins
6. Reply-all with explicit additions is deterministic:
   - original public headers preserved in stored order
   - original sender inserted at the frozen position
   - explicit `--to` / `--cc` additions remain additive
   - acting address excluded

### Send/list expansion tests
7. Inactive direct recipient fails
8. Inactive list addressed directly fails
9. Active list with zero active members fails
10. Mixed active/inactive list members resolves only active members
11. Direct + list overlap creates one delivery and multiple delivery_sources
12. Duplicate-recipient normalization is deterministic
   - exact duplicates in the same role collapse to one stored logical header row
   - cross-role duplicates remain separate logical header rows
13. `--ref-file` at 1,048,576 bytes succeeds and 1,048,577 bytes fails with `invalid_argument`
14. `directory show` returns an unlisted address by direct lookup if it exists

### State/event tests
15. Read changes unread -> read
16. Peek leaves unread unchanged
17. Ack unread -> acknowledged directly
18. The `read` command on an acknowledged delivery is a no-op
19. Hide/unhide do not alter engagement state
20. No-op transitions append no event
21. `delivered` and `state_changed` event combinations follow the frozen matrix
22. Hidden sent item unhide clears `hidden_at_ms` back to `NULL`

### CLI discipline tests
23. `--json` errors still emit valid JSON to stdout only
24. Success responses use the flat `{ "ok": true, ... }` envelope with no nested `data` wrapper
25. Default list/read/thread outputs do not accidentally dump giant payloads
26. Typed ID validation rejects wrong prefixes cleanly
27. Body ambiguity (`--body` + stdin, etc.) fails loudly
28. `read --history` returns prior visible messages oldest-to-newest
29. Experimental mode `coming_soon` responses are valid JSON on stdout under `--json` and append no protocol-state mutations
30. `inbox give-feedback` records a feedback artifact / telemetry event without modifying Inbox protocol tables
31. `reply --all` plus explicit recipient additions preserves frozen audience-construction order
32. Self-send message appears in inbox list when a delivery exists
33. `coming_soon` results suggest `inbox give-feedback` with the requested feature name

## UAT recommendation
Before broader handoff, run a small human-guided acceptance pass:
- send to one direct recipient
- send to one list
- read with and without `--peek`
- reply and reply-all
- self-send and verify both inbox + sent views behave independently
- hide / unhide in inbox and sent views
- thread browse on a mixed sent/received conversation
- self-send browse and independent hide semantics
- experimental-mode feedback submission without protocol-state mutation
- verify JSON outputs are parse-friendly

## Drift-control recommendation
Every merge that changes any of these must update docs + tests together:
- schema shape
- command names/flags
- visibility rules
- reply audience construction
- error codes
- JSON output shape
