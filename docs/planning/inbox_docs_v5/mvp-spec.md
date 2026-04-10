# Inbox — MVP Spec

## Scope
This doc defines the locked MVP implementation target:
- SQLite-first
- one VPS / one local system scope
- CLI-first
- immutable canonical messages
- recipient-local deliveries
- sender-local sent view
- static lists (no user-facing subscription/moderation surface; membership may still be edited administratively between sends)
- no enterprise auth model yet
- no hardened cryptographic privacy yet
- no nested lists
- no paging yet
- no user-facing BCC CLI in MVP (`message_private_recipients` remains reserved schema for later private-routing work)

## Physical schema (MVP)
The following DDL is the final locked MVP schema.

```sql
PRAGMA foreign_keys = ON;

-- IDs are application-generated, stored in the DB with their public prefixes intact
-- (for example `msg_...`, `cnv_...`).
-- Recommendation: UUIDv7-style sortable IDs.

CREATE TABLE addresses (
  id              TEXT PRIMARY KEY,
  local_part      TEXT NOT NULL,
  host            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('agent', 'human', 'service', 'list')),

  display_name    TEXT,
  description     TEXT,

  is_listed       INTEGER NOT NULL DEFAULT 1 CHECK (is_listed IN (0, 1)),
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  classification  TEXT,

  created_at_ms   INTEGER NOT NULL,
  updated_at_ms   INTEGER NOT NULL,

  UNIQUE (local_part, host)
) STRICT;

-- Protocol term: list. Current schema table name uses `group_members` for historical reasons.
CREATE TABLE group_members (
  group_address_id  TEXT NOT NULL,
  member_address_id TEXT NOT NULL,
  ordinal           INTEGER NOT NULL,
  added_at_ms       INTEGER NOT NULL,

  PRIMARY KEY (group_address_id, member_address_id),
  UNIQUE (group_address_id, ordinal),
  FOREIGN KEY (group_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,
  FOREIGN KEY (member_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,
  CHECK (group_address_id <> member_address_id)
) STRICT;

CREATE INDEX idx_group_members_group_ordinal
  ON group_members (group_address_id, ordinal);

CREATE TABLE conversations (
  id             TEXT PRIMARY KEY,
  created_at_ms  INTEGER NOT NULL
) STRICT;

CREATE TABLE messages (
  id                  TEXT PRIMARY KEY,
  conversation_id     TEXT NOT NULL,
  parent_message_id   TEXT,
  sender_address_id   TEXT NOT NULL,

  subject             TEXT NOT NULL DEFAULT '',
  body                TEXT NOT NULL,

  sender_urgency      TEXT NOT NULL DEFAULT 'normal'
                       CHECK (sender_urgency IN ('low', 'normal', 'high', 'urgent')),

  created_at_ms       INTEGER NOT NULL,

  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE RESTRICT,
  FOREIGN KEY (sender_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_message_id, conversation_id)
    REFERENCES messages(id, conversation_id) ON DELETE RESTRICT,

  UNIQUE (id, conversation_id)
) STRICT;

CREATE INDEX idx_messages_conversation_created
  ON messages (conversation_id, created_at_ms);

CREATE INDEX idx_messages_sender_created
  ON messages (sender_address_id, created_at_ms);

CREATE INDEX idx_messages_parent
  ON messages (parent_message_id)
  WHERE parent_message_id IS NOT NULL;

-- Recipient header rows currently have standalone IDs even though no other table FKs to them.
-- This is an intentional MVP tradeoff: keep stable row IDs available for future audit/event references.
-- Exact duplicates within the same role are normalized away before insert; duplicates across roles may remain as separate logical rows.
CREATE TABLE message_public_recipients (
  id                   TEXT PRIMARY KEY,
  message_id           TEXT NOT NULL,
  recipient_address_id TEXT NOT NULL,
  recipient_role       TEXT NOT NULL CHECK (recipient_role IN ('to', 'cc')),
  ordinal              INTEGER NOT NULL,
  created_at_ms        INTEGER NOT NULL,

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT,
  FOREIGN KEY (recipient_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,

  UNIQUE (message_id, ordinal)
) STRICT;

CREATE INDEX idx_message_public_recipients_message_ordinal
  ON message_public_recipients (message_id, ordinal);

CREATE TABLE message_private_recipients (
  id                   TEXT PRIMARY KEY,
  message_id           TEXT NOT NULL,
  recipient_address_id TEXT NOT NULL,
  recipient_role       TEXT NOT NULL CHECK (recipient_role = 'bcc'),
  ordinal              INTEGER NOT NULL,
  created_at_ms        INTEGER NOT NULL,

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT,
  FOREIGN KEY (recipient_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,

  UNIQUE (message_id, ordinal)
) STRICT;

CREATE INDEX idx_message_private_recipients_message_ordinal
  ON message_private_recipients (message_id, ordinal);

CREATE TABLE message_references (
  id             TEXT PRIMARY KEY,
  message_id     TEXT NOT NULL,
  ordinal        INTEGER NOT NULL,

  ref_kind       TEXT NOT NULL
                 CHECK (ref_kind IN ('path', 'url', 'json', 'text', 'artifact_id', 'other')),
  ref_value      TEXT NOT NULL,
  label          TEXT,
  mime_type      TEXT,
  metadata_json  TEXT,

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT,
  UNIQUE (message_id, ordinal)
) STRICT;

CREATE INDEX idx_message_references_message_ordinal
  ON message_references (message_id, ordinal);

CREATE TABLE deliveries (
  id                   TEXT PRIMARY KEY,
  message_id           TEXT NOT NULL,
  recipient_address_id TEXT NOT NULL,

  effective_role       TEXT NOT NULL CHECK (effective_role IN ('to', 'cc', 'bcc')),

  engagement_state     TEXT NOT NULL DEFAULT 'unread'
                       CHECK (engagement_state IN ('unread', 'read', 'acknowledged')),

  visibility_state     TEXT NOT NULL DEFAULT 'active'
                       CHECK (visibility_state IN ('active', 'hidden')),

  delivered_at_ms      INTEGER NOT NULL,

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT,
  FOREIGN KEY (recipient_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,

  UNIQUE (message_id, recipient_address_id)
) STRICT;

CREATE INDEX idx_deliveries_mailbox
  ON deliveries (recipient_address_id, visibility_state, engagement_state, delivered_at_ms DESC);

CREATE INDEX idx_deliveries_message
  ON deliveries (message_id);

CREATE TABLE delivery_sources (
  delivery_id        TEXT NOT NULL,
  source_address_id  TEXT NOT NULL,
  source_role        TEXT NOT NULL CHECK (source_role IN ('to', 'cc', 'bcc')),
  source_kind        TEXT NOT NULL CHECK (source_kind IN ('direct', 'list')),

  PRIMARY KEY (delivery_id, source_address_id, source_role),
  FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE RESTRICT,
  FOREIGN KEY (source_address_id) REFERENCES addresses(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_delivery_sources_source
  ON delivery_sources (source_address_id);

CREATE TABLE delivery_events (
  id                      TEXT PRIMARY KEY,
  delivery_id             TEXT NOT NULL,
  event_type              TEXT NOT NULL
                          CHECK (event_type IN ('delivered', 'state_changed')),
  change_kind             TEXT NOT NULL
                          CHECK (change_kind IN ('delivered', 'read', 'ack', 'hide', 'unhide')),

  actor_address_id        TEXT,
  event_at_ms             INTEGER NOT NULL,

  engagement_state_after  TEXT NOT NULL
                          CHECK (engagement_state_after IN ('unread', 'read', 'acknowledged')),

  visibility_state_after  TEXT NOT NULL
                          CHECK (visibility_state_after IN ('active', 'hidden')),

  metadata_json           TEXT,

  FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_address_id) REFERENCES addresses(id) ON DELETE RESTRICT,
  CHECK (
    (event_type = 'delivered' AND change_kind = 'delivered' AND actor_address_id IS NULL)
    OR
    (event_type = 'state_changed' AND change_kind IN ('read', 'ack', 'hide', 'unhide') AND actor_address_id IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_delivery_events_delivery_time
  ON delivery_events (delivery_id, event_at_ms);

CREATE TABLE sent_items (
  message_id        TEXT PRIMARY KEY,
  visibility_state  TEXT NOT NULL DEFAULT 'active'
                    CHECK (visibility_state IN ('active', 'hidden')),
  hidden_at_ms      INTEGER,

  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE RESTRICT
) STRICT;

-- Sent-item timestamps are intentionally derived from messages.created_at_ms in MVP.
-- MVP also intentionally does not define sent_item_events; sent hide/unhide audit symmetry is deferred.

CREATE INDEX idx_sent_items_visibility
  ON sent_items (visibility_state);

-- Note: sent_items intentionally derives owner through messages.sender_address_id.
-- Query sent views via sent_items JOIN messages ON message_id.

CREATE TRIGGER trg_addresses_kind_immutable
BEFORE UPDATE OF kind ON addresses
FOR EACH ROW
WHEN OLD.kind <> NEW.kind
BEGIN
  SELECT RAISE(ABORT, 'address kind is immutable');
END;

CREATE TRIGGER trg_messages_sender_not_list_insert
BEFORE INSERT ON messages
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM addresses
  WHERE id = NEW.sender_address_id
    AND kind = 'list'
)
BEGIN
  SELECT RAISE(ABORT, 'list address cannot send messages');
END;

CREATE TRIGGER trg_messages_sender_not_list_update
BEFORE UPDATE OF sender_address_id ON messages
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM addresses
  WHERE id = NEW.sender_address_id
    AND kind = 'list'
)
BEGIN
  SELECT RAISE(ABORT, 'list address cannot send messages');
END;

CREATE TRIGGER trg_group_members_group_must_be_list_insert
BEFORE INSERT ON group_members
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM addresses
  WHERE id = NEW.group_address_id
    AND kind = 'list'
)
BEGIN
  SELECT RAISE(ABORT, 'group_address_id must reference a list address');
END;

CREATE TRIGGER trg_group_members_member_not_list_insert
BEFORE INSERT ON group_members
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM addresses
  WHERE id = NEW.member_address_id
    AND kind = 'list'
)
BEGIN
  SELECT RAISE(ABORT, 'nested lists are not allowed in MVP');
END;

CREATE TRIGGER trg_group_members_group_must_be_list_update
BEFORE UPDATE OF group_address_id ON group_members
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM addresses
  WHERE id = NEW.group_address_id
    AND kind = 'list'
)
BEGIN
  SELECT RAISE(ABORT, 'group_address_id must reference a list address');
END;

CREATE TRIGGER trg_group_members_member_not_list_update
BEFORE UPDATE OF member_address_id ON group_members
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM addresses
  WHERE id = NEW.member_address_id
    AND kind = 'list'
)
BEGIN
  SELECT RAISE(ABORT, 'nested lists are not allowed in MVP');
END;
```

## Routing and visibility rules
- `is_active` controls routing eligibility **and** acting-identity eligibility in MVP.
- Inactive actors cannot run CLI commands until reactivated. Existing stored messages and deliveries remain immutable in storage.
- `is_listed` affects default directory visibility only.
- `thread` and `read --history` use the same actor-visibility union:
  - actor deliveries
  - plus actor sent items
  - including hidden-but-owned messages
- Parent links must be redacted in output when the parent is not visible through that same union.
- Stable ordering rules:
  - inbox list: `ORDER BY deliveries.delivered_at_ms DESC, deliveries.id DESC`
  - sent list: `ORDER BY messages.created_at_ms DESC, messages.id DESC`
  - thread window selection: newest visible `N` by `created_at_ms DESC, id DESC`, then return oldest-to-newest within that selected window
  - delivery event history: `ORDER BY event_at_ms ASC, id ASC`

## Enforcement boundary
The MVP intentionally mixes DB-enforced, service-enforced, and test-enforced guarantees.

| Invariant / rule | Enforcement layer | Mechanism |
|---|---|---|
| `addresses.kind` immutable | DB | trigger |
| list cannot send | DB | trigger |
| nested lists forbidden | DB | trigger |
| parent message must stay in same conversation | DB | composite FK |
| no duplicate deliveries per `(message_id, recipient_address_id)` | DB | UNIQUE constraint |
| deterministic list member order | DB/query | UNIQUE `(group_address_id, ordinal)` plus ordered queries |
| sent messages immutable | service + tests | insert-only service rules; regression tests |
| recipient header / reference rows immutable after send | service + tests | insert-only service rules; regression tests |
| `delivery_events` append-only | service + tests | insert-only service rules; regression tests |
| no-op state changes append no event | service + tests | command logic + tests |
| `thread` / `read --history` visibility filtering | service + tests | shared resolver + tests |
| JSON output discipline | service + tests | CLI layer + contract tests |

Direct DB writes that bypass the service layer are out of MVP contract. Where a rule is marked service-enforced, compliant implementations must route mutations through the service layer and its regression suite rather than treating raw SQL writes as supported protocol operations.

- `is_active` controls routing eligibility
- `is_listed` controls default directory visibility only
- MVP “static lists” means there is no end-user subscription/moderation surface; membership may still be edited administratively between sends, and reply-all expands against current membership at the new send time
- acting address must be active
- sender must be active
- direct recipients must exist and be active
- a list addressed directly is still a direct recipient and must itself be active
- list expansion includes only active member addresses
- inactive members are skipped during expansion
- if no actual recipients resolve after validation, expansion, active-member filtering, and dedupe, send fails with `invalid_state`

## Operational layer in MVP
### Telemetry
MVP includes telemetry, but telemetry is not protocol state.

Recommended stable telemetry event names:
- `cli.whoami`
- `cli.send`
- `cli.list`
- `cli.read`
- `cli.reply`
- `cli.ack`
- `cli.hide`
- `cli.unhide`
- `cli.sent.list`
- `cli.sent.read`
- `cli.sent.hide`
- `cli.sent.unhide`
- `cli.thread`
- `cli.directory.list`
- `cli.directory.show`
- `cli.directory.members`
- `cli.give-feedback`
- `cli.experimental.probe`
- `cli.experimental.feedback_prompted`

Telemetry should capture at minimum:
- command name
- success/failure
- duration
- actor address id or stable address string
- error code if failed
- experimental profile/capture mode when applicable

### Experimental discovery mode
Experimental discovery mode is an explicitly enabled research mode that surfaces plausible future commands and flags in help, returns stable `coming_soon` responses, and records product-learning signals without mutating protocol state.

Activation env vars:
- `INBOX_EXPERIMENTAL_MODE=1`
- `INBOX_EXPERIMENTAL_PROFILE=core|broad|frontier`
- `INBOX_EXPERIMENTAL_CAPTURE=safe|dangerous-full-context`
- `INBOX_EXPERIMENTAL_LOG=/path/to/file.ndjson`

Capture modes:
- `safe`: OTEL + minimal structured local capture
- `dangerous-full-context`: OTEL + richer local capture including recent command/result context; use only in controlled research windows

Experimental profiles:
- `core`: `forward`, `fork`, `search`, `snooze`, `archive`, `mark-unread`; nouns `rules`, `stats`; flags `--bcc`, `--send-at`, `--receipt`, `--tag`, `--sort`, `--cursor`, `--branch`, `--ancestors`, `--descendants`, `--tree`
- `broad`: everything in `core`, plus `watch`, `unwatch`, `export`, `mute`, `unmute`; nouns `telemetry`, `config`; flags `--follow-up`, `--quote`, `--template`, `--branch-only`, `--unread-first`
- `frontier`: everything in `broad`, plus verbs `filter`, `escalate`, `alert`, `report`, `scan`, `move`, `create-folder`, `create-tag`; nouns `filters`, `addresses`, `config`, `api`, `tags`, `folders`; flags `--signature`, `--cid`, `--public`, `--self-destruct`, `--scan`

Experimental commands/flags may appear in help with minimal syntax guidance. Invoking an experimental-only surface must:
- return a stable `coming_soon` result
- suggest `inbox give-feedback`
- append OTEL / local research capture
- never mutate Inbox protocol state

### Real operational feedback command
`inbox give-feedback` is a real MVP command for collecting product-learning feedback from agents. It does not touch protocol-state tables.

Purpose:
- record what feature an agent wanted
- record the workflow context they were in
- record the desired outcome
- correlate feedback with experimental probes when possible

Recommended shape:
- `inbox give-feedback --feature <name> --kind verb|noun|flag|workflow --wanted <text> [--context <text>] [--outcome <text>] [--command <text>] [--json]`
- allow stdin or file-backed long feedback using the same “exactly one body source” rule as `send`

Feedback capture lives outside protocol-state tables (for example local NDJSON + OTEL).

## Command surface
- `inbox whoami`
- `inbox send`
- `inbox list`
- `inbox read <message-id>`
- `inbox reply <message-id>`
- `inbox ack <message-id>`
- `inbox hide <message-id>`
- `inbox unhide <message-id>`
- `inbox sent list`
- `inbox sent read <message-id>`
- `inbox sent hide <message-id>`
- `inbox sent unhide <message-id>`
- `inbox thread <conversation-id>`
- `inbox directory list`
- `inbox directory show <address>`
- `inbox directory members <list-address>`
- `inbox give-feedback`

Note: MVP command surface intentionally does not expose `--bcc`.

## Shared command rules

### Identity
Acting identity comes from `INBOX_ADDRESS`.
SQLite location comes from `INBOX_DB`.
An acting address must resolve to an existing row and have `is_active = 1`.

### JSON discipline
If `--json` is present:
- all output must be valid JSON
- all output goes to stdout
- stderr remains silent

### ID discipline
Public CLI handles are stored in the database with their prefixes intact.
Required public prefixes:
- `msg_...`
- `cnv_...`

Operational prefix:
- `fbk_...` (feedback subsystem, not protocol state)

Recommendation: UUIDv7-style sortable IDs with prefixes applied at creation time.
Delivery IDs remain internal. They may appear in JSON/debug output, but they are not the public handle.

### Time filters
- `--since` is inclusive (`>=`)
- `--until` is exclusive (`<`)
- accepted input: ISO 8601 or Unix milliseconds
- normalize internally to Unix milliseconds
- commands that accept time filters in MVP: `inbox list`, `inbox sent list`, and `inbox thread`

### Limits
- default limit: `50`
- max limit: `200`

### Exit codes
- `0` success
- `1` invalid_argument
- `2` not_found
- `3` invalid_state
- `4` permission_denied
- `5` internal_error
- `6` coming_soon (experimental mode only)

### Error envelope and mapping
Canonical JSON error envelope:

```json
{
  "ok": false,
  "error": {
    "code": "not_found",
    "message": "Human-readable summary",
    "target": "message_id",
    "details": null
  }
}
```

Scenario mapping:
- missing or malformed required flags -> `invalid_argument`
- wrong public ID prefix for a command -> `invalid_argument`
- unknown direct recipient address on send/reply -> `invalid_argument`
- inactive acting address -> `permission_denied`
- inactive direct recipient / inactive list addressed directly -> `invalid_state`
- zero recipients resolved after expansion/dedupe -> `invalid_state`
- nonexistent or inaccessible message/conversation/address lookup -> `not_found`
- internal DB or transaction failure -> `internal_error`

`not_found` conflation applies to object-access lookups. Direct-recipient validation is intentionally explicit in the shared-directory MVP because sender-side address naming is already a discovery-capable surface: unknown direct recipients are `invalid_argument`, inactive direct recipients are `invalid_state`.

### Hide semantics
Hide suppresses default listing only.
Hide does not block:
- explicit read by message id
- explicit sent read by message id
- explicit thread browsing by conversation id

### Idempotency
All state-mutating commands are idempotent.
If already in target state:
- return success
- `changed = false`
- append no new state-change event

### Canonical success result patterns
Success responses are flat `{ "ok": true, ... }` objects. MVP does not use a nested `data` wrapper.
- mutation result (`ack`, `hide`, `unhide`, sent hide/unhide):
  - `ok`
  - `message_id`
  - `changed`
  - local state after mutation
- read result:
  - `ok`
  - canonical message fields
  - actor-local view state
  - optional history payload
- thread result:
  - `ok`
  - `items[]`
  - truncation metadata
- directory results:
  - `ok`
  - requested object(s)

## Whoami query

### Purpose
Return the resolved acting identity and runtime context.

### Validation
- `INBOX_ADDRESS` must be set and resolve to an existing address
- acting address must have `is_active = 1`
- `INBOX_DB` must resolve to a readable SQLite database

### Output
Text mode includes:
- acting address
- address kind
- display name if present
- active/listed state summary
- resolved `INBOX_DB` path

JSON mode includes:
- `ok`
- `address`
- `kind`
- `display_name`
- `is_active`
- `is_listed`
- `db_path`

## Inbox list query

### Purpose
List inbox-visible messages for the acting address.

### Filters and defaults
- source of truth: deliveries owned by the acting address
- default visibility filter: `active`
- default state filter: `any`
- default sort: `delivered_at_ms DESC, id DESC`
- supports `--state`, `--visibility`, `--since`, `--until`, `--limit`, and optional sender filtering
- if the acting address self-sent and also received the message, the message appears in inbox list because a delivery exists

### Output
Text mode returns concise summary rows.
Each item includes at minimum:
- `message_id`
- sender
- subject
- delivery-local engagement/visibility state
- delivered timestamp

JSON mode returns:
- `ok`
- `items[]`
- `limit`
- `returned_count`
- optional `truncated`

Each list item includes:
- `message_id`
- `conversation_id`
- `sender`
- `subject`
- `engagement_state`
- `visibility_state`
- `effective_role`
- `delivered_at_ms`
- optional `delivery_id` as internal/debug field only

## Send transaction

### Validation
1. acting address exists and is active
2. acting address kind is not `list`
3. at least one `--to` exists
4. exactly one body source is present:
   - `--body`
   - `--body-file`
   - piped stdin (stdin counts as a body source when stdin is not a TTY)
   - if more than one source is detected, fail with `invalid_argument` before any deeper validation
   - empty body is valid and may be the empty string
5. all directly addressed recipients exist and are active
   - includes list addresses named in `--to` / `--cc`
   - unknown direct recipient address is `invalid_argument`
6. urgency is one of `low|normal|high|urgent`
7. references are valid:
   - `--ref <kind>:<value>` splits on first colon only
   - `--ref-file <kind>:<path>` splits on first colon only
   - paths are resolved relative to current working directory unless already absolute
   - symlinks are allowed if the resolved file is readable
   - nonexistent or unreadable paths are `invalid_argument`
   - `/dev/stdin` is allowed if explicitly passed as a path
   - `--ref-file` reads file contents and stores content as `ref_value`
   - file path itself is not preserved unless explicitly sent as `--ref path:/actual/path`
   - max file content size for `--ref-file`: 1,048,576 bytes
8. public logical headers are normalized deterministically before storage:
   - exact duplicates within the same role are deduped, first-seen ordinal wins
   - duplicates across roles are preserved as separate logical header rows
   - actual delivery role is still chosen later by precedence `to > cc > bcc`

### Steps (one DB transaction)
1. resolve acting address id
2. create conversation
3. create message
4. insert normalized public logical recipient headers
5. do not populate `message_private_recipients` from the MVP CLI (`--bcc` is deferred); table remains reserved schema
6. insert message references
7. validate all directly addressed recipients are active before any list expansion (including list addresses)
8. expand direct recipients and active list members into actual recipient candidates
9. skip inactive list members
10. if zero actual recipient candidates remain, fail with `invalid_state`
11. dedupe actual recipients by address
12. assign one effective role per actual recipient using precedence `to > cc > bcc`
13. insert one delivery row per actual recipient
    - if the sender is also a recipient, this is valid and the sender receives both a delivery and a sent item
14. insert one or more delivery source rows per delivery
    - if one recipient was reached multiple ways, preserve all source causes
    - if the same source address appears in multiple logical roles, preserve all distinct `(source_address_id, source_role)` causes
15. insert one delivered event per delivery with:
    - `event_type = 'delivered'`
    - `actor_address_id = NULL`
    - `engagement_state_after = 'unread'`
    - `visibility_state_after = 'active'`
16. insert one sent item row for the sender
17. commit

### Atomicity
If any step fails:
- rollback everything

Partial fanout is invalid.

### Send-time edge cases
- inactive direct recipient -> `invalid_state`
- inactive list addressed directly -> `invalid_state`
- active list with zero active members -> contributes zero actual recipients
- zero resolved recipients after full resolution -> `invalid_state`
- direct + list overlap -> one delivery, many delivery_sources

### Response
Text mode should stay concise.

JSON mode should include at minimum:
- `ok`
- `message_id`
- `conversation_id`
- `public_recipients` summary
- `resolved_recipient_count`
- `resolution_summary`

JSON mode should include a resolution summary. In MVP, the sender sees counts only in this response, not the fully expanded recipient-address list.

JSON mode should include a resolution summary:

```json
{
  "resolution_summary": {
    "logical_recipient_count": 3,
    "resolved_recipient_count": 7,
    "skipped_inactive_member_count": 2,
    "deduped_recipient_count": 1
  }
}
```

## Read transaction

### Resolution
`inbox read <message-id>` resolves:
- acting address delivery for that message

If not found:
- return `not_found`
- text mode may hint: try `inbox sent read` if you sent this message

### State change
- if `--peek`: no mutation
- else:
  - `unread -> read`
  - `read -> no-op`
  - `acknowledged -> no-op`

### History
`--history N` returns up to `N` earlier messages in the same conversation using the same visibility union as `thread`:
- actor deliveries
- plus actor sent items

History includes actor-visible hidden messages too, because history is explicit context browsing, not a default list view.
The count `N` refers to additional earlier messages before the current message; the current message itself is not counted toward `N`.
Window selection: select the N messages with the highest `created_at_ms` (tiebreaker: `id` descending) that are strictly earlier than the current message's `created_at_ms`, then return them oldest-to-newest.
Returned history items are ordered oldest-to-newest within the selected prior window.
In JSON output, `parent_message_id` is returned as `null` when the parent is not visible through the same union. In text output, hide the parent id and either omit the parent line or render a redacted placeholder.

JSON read response should include:
- `ok`
- canonical message fields
- actor-local state (`view_kind = received`, engagement/visibility)
- optional `delivery_id` as internal/debug field only
- optional `history[]`

## Reply transaction

### Resolution order
1. try acting address delivery for the target message
2. if none, try actor sent-item access for the target message
3. if both exist, delivery wins
4. if neither exists, `not_found`

### Conversation rules
- reply inherits target conversation
- reply sets `parent_message_id = target message id`

### Subject
Default reply subject is the original subject unchanged.
If the original subject is the empty string, the reply default is also the empty string.
MVP does not automatically prepend `Re:`.
If explicit `--subject` is provided on `reply`, it overrides the default.
Reply urgency defaults to `normal` unless explicitly set by the replier.

### Audience rules
Without `--all`:
- default audience is original sender only
- explicit `--to` / `--cc` are additive, not replacing

With `--all`:
- use original public logical `To` / `Cc` headers in stored ordinal order
- do not use old expanded delivery snapshots
- append the original sender as an implicit `to` reply target after those stored public headers if not already present
- append any explicit `--to` / `--cc` additions in argv order
- remove the acting address from the candidate reply-all audience regardless of how they originally received the message
- then apply the same logical-header normalization rules as `send` (exact same-role duplicates deduped, cross-role duplicates preserved)
- if list membership changed since the original send, the reply expands against current membership at reply-send time

If replying from sent view or replying to a self-sent message without `--all` and without explicit recipients, self-only reply is allowed in MVP. In that case the reply audience is literally the acting address, producing a self-send addressed to the actor.

## Ack transaction
`ack` resolves acting address delivery for the message.

Transitions:
- `unread -> acknowledged`
- `read -> acknowledged`
- `acknowledged -> no-op`

Visibility unchanged.

## Hide / unhide transactions
`hide` and `unhide` resolve acting address delivery for the message.

Transitions:
- `hide`: `active -> hidden`
- `unhide`: `hidden -> active`

Engagement state is unchanged.

## Sent-view transactions

### Sent list
Query:
- messages sent by actor
- joined with sent_items
- default visibility filter is active only
- supports `--since`, `--until`, and `--limit`
- sort newest first
- timestamps come from `messages.created_at_ms`, not a separate sent-item created timestamp

### Sent read
Resolves:
- message authored by actor
- matching sent_item exists

Hidden sent items are still directly readable by id.
JSON sent-read responses use `view_kind = sent`.

### Sent hide / unhide
Operate only on `sent_items`.
They do not touch recipient deliveries.

Unhide clears `sent_items.hidden_at_ms` back to `NULL` in MVP.
MVP does not define a `sent_item_events` audit trail; this is an intentional asymmetry from delivery events.

If the actor both sent and received the same message, inbox hide and sent hide remain independent.

## Thread query

### Visibility
A thread item is included if either:
- actor has a delivery for the message
- actor is the sender and has a sent item for the message

No message is included based on conversation membership alone.
Hidden-but-owned messages remain visible in thread output.
Thread does not accept `--visibility`; hidden-but-owned items are always included.
If both received and sent views exist for the same message (self-send/self-inclusion), include the message once and prefer `view_kind = received`.

### Windowing
`thread` supports `--since`, `--until`, `--limit`, and optional `--full`.
Apply time bounds first. Time bounds (`--since`/`--until`) filter against `messages.created_at_ms`, the canonical message timestamp. Then select the newest visible `N` messages from the remaining set.
Default behavior:
- select newest visible `N` messages in the conversation (`ORDER BY created_at_ms DESC, id DESC LIMIT N`)
- then return those selected messages oldest-to-newest within that window

Example: if visible messages are M1..M100 and limit is 10, select M91..M100 and return M91,M92,...,M100.

### Output
Default thread output should be summary-shaped, not full-body by default.

Per item include:
- `message_id`
- `parent_message_id` (or `null` if the parent is not visible through the same union)
- sender
- subject
- created_at
- `view_kind = received | sent`
- local state for the acting address
- optional `body_preview`

If `--full`:
- include full body
- include references

`--full` is thread-only in MVP. `read --history` does not take a `--full` flag.

### Truncation metadata
Always include in JSON:
- `limit`
- `returned_count`
- `truncated`
- optionally `total_visible_count` if inexpensive to compute

## Directory queries

### Directory list
Defaults:
- only active addresses
- only listed addresses
- sort by canonical address ascending

Flags:
- `--include-inactive`
- `--include-unlisted`
- `--kind`

JSON items include:
- `address`
- `kind`
- `display_name`
- `description`
- `is_active`
- `is_listed`
- `classification`

### Directory show
Shows one address by direct lookup.
Like all commands, the acting address must already be active.
Direct lookup may return an unlisted address if it exists; `is_listed` only affects default directory browsing.
If the named address does not exist, return `not_found`.

### Directory members
Shows deterministic ordered membership for a list.
MVP does not implement list privacy controls here.


## Give-feedback command

### Purpose
Collect structured product-learning feedback from agents without mutating Inbox protocol tables.

### Validation
- acting address must resolve and be active
- `--feature` is required
- `--kind` is required and must be one of `verb|noun|flag|workflow`
- `--wanted`, `--wanted-file`, and piped stdin are mutually exclusive body sources, following the same 'exactly one body source' rule as `send`. If more than one is detected, fail with `invalid_argument`.
- feedback body uses the same “exactly one body source” rule as `send` if stdin/file support is used

### Behavior
- records feedback outside protocol-state tables (for example local NDJSON + OTEL)
- may include the triggering experimental feature name and attempted command
- never creates messages, deliveries, sent items, or delivery events

### Output
JSON mode includes at minimum:
- `ok`
- `feedback_id`
- `feature`
- `recorded`

## Experimental `coming_soon` response
When an experimental-only command/flag is invoked, return a stable result and suggest `inbox give-feedback`.

Text mode example:
```text
feature coming soon: search

please describe how you would like to use this 'search' feature in your workflow by submitting feedback:
  inbox give-feedback --feature search --kind verb --wanted "<what you wanted to do>"
```

JSON mode example:
```json
{
  "ok": false,
  "experimental": true,
  "error": {
    "code": "coming_soon",
    "message": "feature coming soon",
    "details": {
      "feature": "search",
      "feedback_command": "inbox give-feedback --feature search --kind verb --wanted \"<what you wanted to do>\""
    }
  }
}
```

## Delivery event matrix
Freeze the allowed combinations exactly:

| event_type | change_kind | actor_address_id | Meaning |
|---|---|---|---|
| `delivered` | `delivered` | `NULL` | initial system-created delivery event |
| `state_changed` | `read` | non-null | explicit or implicit read transition |
| `state_changed` | `ack` | non-null | ack transition |
| `state_changed` | `hide` | non-null | hide transition |
| `state_changed` | `unhide` | non-null | unhide transition |

Any other combination is invalid in MVP.

## Canonical response field names
Use these exact field names in JSON output:
- whoami: `ok`, `address`, `kind`, `display_name`, `is_active`, `is_listed`, `db_path`
- inbox list item: `message_id`, `conversation_id`, `sender`, `subject`, `engagement_state`, `visibility_state`, `effective_role`, `delivered_at_ms`
- send/reply success: `ok`, `message_id`, `conversation_id`, `resolved_recipient_count`, `resolution_summary`
- read result: `ok`, `message_id`, `conversation_id`, `view_kind`, `subject`, `body`, local state fields, optional `history`
- thread item: `message_id`, `parent_message_id`, `sender`, `subject`, `created_at_ms`, `view_kind`, local state fields
- mutation result: `ok`, `message_id`, `changed`, resulting local state fields
- give-feedback result: `ok`, `feedback_id`, `feature`, `recorded`

## Error vocabulary
Stable JSON error codes:
- `not_found`
- `invalid_argument`
- `invalid_state`
- `permission_denied`
- `internal_error`

`not_found` intentionally conflates nonexistent and inaccessible objects to reduce existence probing.

Suggested success envelope:
```json
{ "ok": true, "message_id": "msg_..." }
```

Suggested error envelope:
```json
{ "ok": false, "error": { "code": "not_found", "message": "...", "target": "message_id", "details": null } }
```
