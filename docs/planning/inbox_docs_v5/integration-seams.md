# Inbox — Integration Seams and Contracts

This doc identifies the boundaries between subsystems so multiple agents or workstreams can build in parallel without drifting.

## Why seams matter
Inbox is small enough that one person could build it end-to-end, but if multiple planning or implementation agents work in parallel, drift will happen unless a few contracts are frozen early.

The most important frozen contracts are:
- schema names and table ownership
- command request/response DTOs
- error-code vocabulary and scenario mapping
- visibility resolution rules
- JSON output discipline

## Primary seams

### 1. Storage seam
The storage layer owns:
- SQLite connection and transaction handling
- schema initialization / migrations
- trigger installation
- low-level CRUD/query helpers

The storage layer must not silently reinterpret protocol rules.
It should be a faithful persistence implementation of the MVP spec.

### 2. Resolution seam
The resolution layer owns:
- acting-address lookup from env
- inbox visibility resolution: `message -> actor delivery`
- sent visibility resolution: `message -> actor sent_item`
- thread visibility union
- list expansion
- direct recipient validation
- active-member filtering

This seam is load-bearing. Most visibility bugs happen here.

### 3. Command/service seam
The service layer owns:
- command-level validation
- send/reply transaction orchestration
- state transitions
- idempotency behavior
- event append rules

This layer should call the resolution layer rather than re-implementing visibility logic ad hoc.

### 4. CLI seam
The CLI layer owns:
- argv parsing
- environment handling
- stdin/body-file/body precedence
- text output rendering
- JSON output rendering
- exit code mapping

The CLI layer should be thin. It should not contain message-routing or visibility business logic.

### 5. Telemetry seam
The telemetry layer owns:
- OTEL event emission
- timing
- success/failure metrics
- research-mode attempted-command capture
- `inbox give-feedback` capture and correlation
- local NDJSON capture for high-context experimental runs

Telemetry must observe operations, not become a source of truth. Experimental capture must live outside protocol-state tables.

## Contract checklist

### Contract A — error vocabulary
Frozen error codes:
- `not_found`
- `invalid_argument`
- `invalid_state`
- `permission_denied`
- `internal_error`

### Contract B — JSON discipline
If `--json` is set:
- stdout contains valid JSON only
- stderr is silent
- both success and failure payloads are JSON objects

Canonical shapes to freeze:
- success envelope: `{ "ok": true, ... }`
- error envelope: `{ "ok": false, "error": { "code": ..., "message": ..., "target": ..., "details": ... } }`
- experimental coming-soon envelope: `{ "ok": false, "experimental": true, "error": { "code": "coming_soon", ... } }`

### Contract C — message-centric handles
Public command handles are:
- `msg_...`
- `cnv_...`

`delivery_id` may appear in JSON/debug output but is not the primary public handle.

### Contract D — visibility resolution
Inbox commands resolve:
- `message_id + acting address -> delivery`

Sent commands resolve:
- `message_id + acting address -> sent_item`

Reply resolves:
- try delivery first
- fall back to sent item
- if both exist, delivery wins

Thread and `read --history` resolve:
- the same visibility union of actor-visible deliveries and actor-sent sent items
- including hidden-but-owned messages

### Contract E — list expansion
- direct recipient list addresses must themselves be active
- expansion includes only active members
- inactive members are skipped
- send/reply code must call shared resolution helpers for list expansion and recipient validation rather than reimplementing them
- zero actual recipients after full resolution is an `invalid_state` send failure

### Contract F — reply-all audience
`reply --all` uses:
- original public logical `To`/`Cc` headers
- not old expanded recipient snapshots

## Seams that should not be crossed casually
- CLI parsing should not reimplement visibility filtering
- send/reply code should not bypass list-expansion helpers
- thread/history should not query messages without actor visibility filtering
- telemetry should not mutate state

### Contract G — canonical response field names
Freeze these field names so parallel workstreams do not invent variants:
- whoami: `ok`, `address`, `kind`, `display_name`, `is_active`, `is_listed`, `db_path`
- list item: `message_id`, `conversation_id`, `sender`, `subject`, `engagement_state`, `visibility_state`, `effective_role`, `delivered_at_ms`
- send/reply success: `ok`, `message_id`, `conversation_id`, `resolved_recipient_count`, `resolution_summary`
- read success: `ok`, `message_id`, `conversation_id`, `view_kind`, `subject`, `body`, local state fields, optional `history`
- thread item: `message_id`, `parent_message_id`, `sender`, `subject`, `created_at_ms`, `view_kind`, local state fields
- mutation result: `ok`, `message_id`, `changed`, resulting local state fields
- give-feedback success: `ok`, `feedback_id`, `feature`, `recorded`

Response shapes are flat `{ "ok": true, ... }` objects. The MVP does not use a nested `data` wrapper.

### Contract H — exit codes
Freeze the CLI exit-code mapping:
- `0` success
- `1` invalid_argument
- `2` not_found
- `3` invalid_state
- `4` permission_denied
- `5` internal_error
- `6` coming_soon (experimental mode only)

The JSON error envelope and the exit code must agree on the same high-level outcome class.

### Contract I — experimental discovery and feedback
Experimental mode is enabled via environment flags, not protocol-state mutation. Freeze these operational names:
- `INBOX_EXPERIMENTAL_MODE=1`
- `INBOX_EXPERIMENTAL_PROFILE=core|broad|frontier`
- `INBOX_EXPERIMENTAL_CAPTURE=safe|dangerous-full-context`
- `INBOX_EXPERIMENTAL_LOG=/path/to/file.ndjson`

Recommended stable telemetry names:
- `cli.give-feedback`
- `cli.experimental.probe`
- `cli.experimental.feedback_prompted`

Recommended stable attributes:
- `command.name`
- `experimental.mode`
- `experimental.profile`
- `capture.mode`
- `feature.name`
- `feature.kind`
- `result.ok`
- `error.code`
- `probe_id`

Experimental-only commands and flags may appear in help, but must return a stable `coming_soon` result and must never mutate Inbox protocol state. `inbox give-feedback` is a real command and records research feedback outside protocol tables.
