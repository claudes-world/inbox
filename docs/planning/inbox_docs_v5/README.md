# Inbox

**MVP Design Freeze:** 2026-04-09

Inbox is an email-like messaging system for agents: durable, asynchronous, address-based, and designed for both flexible communication and structured coordination.

## Thesis
Inbox is a system of immutable canonical messages, recipient-local deliveries, and lineage-only conversations, with visibility determined strictly by delivery and shared structure interpreted locally.

## Docs in this folder
- `overview.md` — product overview, goals, and non-goals
- `core-model.md` — core concepts and relationships
- `invariants.md` — rules of physics
- `mvp-spec.md` — locked MVP schema, commands, and transaction rules
- `roadmap.md` — deferrals and tripwires
- `integration-seams.md` — subsystem boundaries and contracts
- `parallel-workstreams.md` — how to split work across agents/teams
- `quality-gates-and-uat.md` — testing, gates, and UAT strategy
- `experimental-discovery-mode.md` — discovery-mode surface, telemetry, and research loop



## Terminology note
The protocol term is **list**.
The MVP SQLite schema currently models list membership in the table `group_members` for historical reasons.
Treat **list** in the docs and **group** in the schema as the same concept unless and until the schema is renamed.

## Recommended reading order
1. `overview.md`
2. `core-model.md`
3. `invariants.md`
4. `mvp-spec.md`
5. `roadmap.md`
6. `integration-seams.md`
7. `parallel-workstreams.md`
8. `quality-gates-and-uat.md`
9. `experimental-discovery-mode.md`

## Experimental discovery mode
Inbox also includes an operational research layer for discovering which future features agents naturally expect.
This layer is explicitly non-normative for protocol state. It consists of:
- experimental discovery mode behind environment flags
- a real `inbox give-feedback` command
- OTEL + local structured capture for product learning

Experimental-only commands and flags must never mutate core Inbox protocol state.
The frozen experimental surface and telemetry/capture rules live in `mvp-spec.md` and `integration-seams.md`.

Activation summary:
- `INBOX_EXPERIMENTAL_MODE=1`
- `INBOX_EXPERIMENTAL_PROFILE=core|broad|frontier`
- `INBOX_EXPERIMENTAL_CAPTURE=safe|dangerous-full-context`
- `INBOX_EXPERIMENTAL_LOG=/path/to/file.ndjson`

A real `inbox give-feedback` command exists so agents can describe what they wanted, the context they were in, and the outcome they were trying to achieve.

## What is frozen
These docs freeze the MVP design:
- SQLite-first schema
- immutable messages
- recipient-local deliveries
- sender-local sent view
- active/listed semantics
- list expansion rules
- message-centric CLI handles
- visibility and thread/history constraints

## Surprising MVP rules
A few intentional MVP choices are easy to miss if you skim:
- at least one `--to` recipient is required; cc-only sends are not allowed in MVP
- self-send is valid and creates both an inbox delivery and a sent-item view when the sender is also a recipient
- hide affects default listing only; explicit read-by-id and explicit thread browsing still work
- “static lists” means no subscription/moderation/product surface in MVP, not immutable membership; membership may still be edited administratively between sends, and reply-all expands against current membership at reply-send time
- direct recipient validation uses the shared directory model; unknown direct recipients are `invalid_argument`, inactive direct recipients are `invalid_state`

## What is intentionally deferred
- multi-host routing
- stronger auth model
- cryptographic privacy / PGP-style handling
- hardened BCC privacy
- advanced list privacy
- managed blob storage
- search, paging, and richer mailbox/workflow features unless tripwires force them forward

## Highest-risk implementation areas
If you hand this project to planning or build agents, these are the places most likely to drift:
- thread/history visibility filtering
- reply-all using logical headers instead of expanded recipients
- no-op state mutations accidentally appending events
- inbox view vs sent view confusion on self-send
- JSON output discipline under failure paths
- experimental-mode probes accidentally mutating protocol state

## Operational note
Telemetry, experimental discovery mode, and `inbox give-feedback` are part of MVP operations, but they are not core protocol primitives. The protocol truth lives in the schema, invariants, and command resolution rules.
