# Inbox — Core Invariants

## Thesis
Inbox is a system of immutable canonical messages, recipient-local deliveries, and lineage-only conversations, with visibility determined strictly by delivery and shared structure interpreted locally.

## Structural invariants
1. Every message belongs to exactly one conversation.
2. A parentless message creates a new conversation.
3. A message with a parent inherits the parent’s conversation.
4. A conversation is lineage, not access control.
5. A message exists canonically once.
6. Every delivery belongs to exactly one message and one recipient address.
7. A delivery can exist for the same canonical message only once per recipient address.
8. Every message has exactly one sender address, fixed at send time.
9. Every successfully sent message has exactly one sent item for its sender.
10. Sent messages are immutable.
11. Parent links create lineage, not visibility.
12. A list is an addressable recipient abstraction, not a mailbox-state holder.

## Visibility and privacy invariants
1. A recipient may access a message only if a delivery exists for that recipient.
2. Adding a recipient later does not grant retroactive access to prior messages.
3. Re-shared history must be explicit.
4. Parent links must not leak inaccessible history in visible rendering. If a parent is not visible through the same actor-visibility union used by `thread` and `read --history`, outputs must return `null` (JSON) or a redacted placeholder / omission (text), not the hidden parent id.
5. BCC is private routing metadata, not part of the public canonical header snapshot.
6. Once a message is sent, read access is determined only by delivery existence, not by current group membership or conversation membership.
7. Sender access to a message in the sent view comes from sender authorship plus the sent item. If the sender is also a recipient, they additionally have inbox access via their delivery. These are independent access paths.

## Send-time invariants
1. Group/list expansion happens at send time, not read time.
2. A successful send creates:
   - one canonical message
   - one sent item for the sender
   - one delivery per actual resolved recipient
   - one initial delivered event per delivery
3. Partial fanout is invalid in MVP. Send is all-or-nothing.
4. Public headers preserve logical addressees after deterministic MVP normalization: exact duplicates within the same role are deduped; duplicates across roles are preserved.
5. Deliveries preserve actual resolved recipients.
6. Delivery sources preserve why each delivery exists.
7. If a recipient is reached multiple ways, one delivery is created and all source causes are preserved.
8. Effective role precedence is `to > cc > bcc`.
9. If zero actual recipients resolve after validation, expansion, active-member filtering, and dedupe, send fails with `invalid_state`.

## Active/listed invariants
1. `is_active` controls routing eligibility and CLI acting-identity eligibility in MVP.
2. `is_listed` controls default directory visibility only.
3. The acting address must have `is_active = 1`; inactive actors are denied command execution until reactivated. Historical data remains immutable in storage.
4. Direct recipients must have `is_active = 1`.
5. An inactive list addressed directly is an inactive direct recipient and causes send failure.
6. During list expansion, member addresses with `is_active = 0` are skipped.
7. An active list that expands to zero active members does not silently succeed; it contributes zero actual recipients toward resolution and may cause a zero-resolution send failure.

## Delivery state invariants
1. Delivery engagement state and visibility state are separate dimensions.
2. Delivery current state is mutable.
3. Delivery state changes are recorded in append-only history.
3a. Initial delivered events are recorded with `event_type = delivered`, `change_kind = delivered`, `actor_address_id = NULL`, `engagement_state_after = unread`, and `visibility_state_after = active`.
3b. `state_changed` events must use `change_kind in {read, ack, hide, unhide}` and include a non-null actor address. The `delivered` event is the sole actor-null exception.
4. All state mutators are idempotent.
5. No-op state requests return success with `changed = false` and append no event.
6. `ack` may move directly from `unread` to `acknowledged`.
7. `read` never downgrades `acknowledged` back to `read`.
8. Hide affects default list views, not direct read-by-ID or explicit thread browsing.
9. Explicit context browsing commands (`thread` and `read --history`) use the same visibility union: actor deliveries plus actor sent items, including hidden-but-owned messages.

## Operational invariants
1. If `--json` is passed, all output is valid JSON on stdout and stderr remains silent.
2. `not_found` intentionally conflates nonexistent and inaccessible object lookups to reduce existence probing. Direct-recipient validation in the shared-directory MVP remains explicit: unknown direct recipients are `invalid_argument`, inactive direct recipients are `invalid_state`.
3. Telemetry is not protocol state.
4. MVP may use richer high-context telemetry in explicitly enabled research mode.
5. Experimental discovery mode must be explicitly enabled and must not mutate core mail state for unimplemented commands.
6. `inbox give-feedback` is a real command in MVP operations, but it records research feedback only and does not mutate protocol-state tables.
7. Experimental capture modes are `safe` and `dangerous-full-context`; the latter is explicitly opt-in and may record richer local workflow context outside protocol state.
