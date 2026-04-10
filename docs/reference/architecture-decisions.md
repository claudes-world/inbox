# Architecture decisions

Key technical decisions made during Inbox development and the reasoning
behind them. These are locked in -- changing any would require updating
tests, schema, and library code across the project.

## AD-1: SQLite 3.46.1 STRICT tables

**Decision:** Use SQLite with STRICT mode for all tables.

**Why:** STRICT tables enforce column types at the storage layer, catching
type mismatches that would silently succeed in regular SQLite. This gives
us type safety without an ORM or application-layer validation for every
read path. The 3.46.1 version requirement ensures JSON1 extension support
and WAL journal mode.

**Trade-off:** STRICT mode means we cannot store flexible JSON in TEXT
columns without explicit casting. We accept this for the type safety
guarantee.

## AD-2: Sortable hex IDs with typed prefixes

**Decision:** Application-generated IDs in the format
`{prefix}{timestamp_ms_hex_12}_{random_hex_8}`.

**Why:**
- Typed prefixes (`msg_`, `cnv_`, `dly_`) enable prefix validation at
  the CLI layer without a database round-trip.
- Hex-encoded millisecond timestamps make IDs naturally sortable by
  creation time, which simplifies ordering queries.
- 8 random hex bytes provide sufficient uniqueness for single-node
  operation.
- No UUID library dependency -- generated from `/dev/urandom` and `date`.

## AD-3: Pure Bash, no runtime dependencies

**Decision:** The CLI uses only Bash 4.4+ and `sqlite3`. No Python, jq,
Node, or other runtimes.

**Why:** Inbox targets agentic environments where the runtime stack is
minimal. Bash + sqlite3 are available on virtually every Linux system.
Eliminating external dependencies reduces attack surface, simplifies
deployment, and makes the tool self-contained.

**Trade-off:** JSON construction is manual (printf-based). We accept
this complexity in exchange for zero dependency installation.

## AD-4: All-or-nothing transactions

**Decision:** Multi-step mutations (send, reply) use `db_transaction`
which wraps SQL in BEGIN/COMMIT with ROLLBACK on failure.

**Why:** A send operation creates a conversation, message, public
recipients, deliveries, delivery sources, delivery events, and a
sent_item. Partial writes would leave the database in an inconsistent
state. The `-bail` flag ensures SQLite stops at the first error.

## AD-5: Engagement and visibility as independent axes

**Decision:** `engagement_state` (unread/read/acknowledged) and
`visibility_state` (active/hidden) are orthogonal columns on deliveries.

**Why:** Hiding a message should not erase the fact that it was read or
acknowledged. These are independent user intents: "I have processed this"
vs "I do not want to see this in my list." Separating them also
simplifies the mutation logic -- each axis has its own transition rules.

## AD-6: Thread visibility union

**Decision:** Thread view shows the union of messages where the actor
has a delivery OR is the sender with a sent_item.

**Why:** An actor should see their own sent messages in a thread even if
they were not a recipient. Self-send (sending to yourself) produces both
a delivery and a sent_item; the union deduplicates automatically.

## AD-7: Idempotent mutations

**Decision:** Repeated ack/hide/unhide operations are no-ops that return
`changed: false` without error.

**Why:** Agents may retry operations due to timeouts or restarts. Making
mutations idempotent means retries are safe -- the same operation
produces the same end state without duplicate events in the audit log.

## AD-8: Flat JSON envelopes

**Decision:** All JSON output uses `{ok: true, ...data}` or
`{ok: false, error: {code, message, target, details}}`.

**Why:** Flat envelopes are trivially parseable by agents. The `ok` field
provides a single boolean check. Error codes are stable strings that map
to exit codes (1-6), enabling both JSON and exit-code-based error handling.

## AD-9: List expansion at send time

**Decision:** Distribution lists are expanded into individual deliveries
when a message is sent. `delivery_sources` records which list the
delivery came from.

**Why:** Recipients should see the message in their personal inbox
regardless of list membership changes after send. Expanding at send time
captures the membership snapshot. The delivery_sources table preserves
provenance for auditing.

## AD-10: Experimental surfaces never mutate protocol state

**Decision:** Experimental commands (search, forward, snooze, etc.)
return `coming_soon` responses. Feedback goes to an NDJSON log file,
never to the SQLite database.

**Why:** Experimental surfaces are probes for future features. They
must not create messages, deliveries, or events. The NDJSON log captures
agent interest signals without polluting the protocol state.
