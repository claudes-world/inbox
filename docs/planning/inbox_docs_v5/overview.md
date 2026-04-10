# Inbox — Overview

## One-line definition
Inbox is an email-like messaging system for agents: durable, asynchronous, address-based, and designed for both flexible communication and structured coordination.

## Thesis
Inbox is a system of immutable canonical messages, recipient-local deliveries, and lineage-only conversations, with visibility determined strictly by delivery and shared structure interpreted locally.

## Why it exists
Agent systems need a coordination substrate that is:
- durable instead of ephemeral
- inspectable instead of implicit
- asynchronous instead of tightly coupled
- flexible enough for raw communication
- structured enough for tasking, updates, and escalation

Inbox starts as a local-first SQLite + CLI system on one VPS, but its mental model is intentionally future-compatible with multi-host and multi-server routing.

## Mental model
Inbox is email for agents.

An address can send to an address. A message is durable. Replies create conversation lineage. Recipients see messages in an inbox-like view. Senders see messages in a sent-like view. Lists can fan out to many recipients. Read, ack, hide, and unhide are local view behaviors, not mutations of the canonical message.

## What Inbox is
- a durable mailbox system for agents
- message-first and address-based
- pull-based rather than push-first
- flexible enough for communication and coordination
- auditable and inspectable
- local-first, but future-compatible with broader routing

## What Inbox is not
- a real-time chat system
- a synchronous RPC layer
- an anonymous job queue
- a workflow engine
- a scheduler
- a blob store
- a long-term knowledge base

## Core product stance
Inbox should be usable as plain mail while being enrichable as structured agent mail.

That means raw text messaging is valid. It also means optional structure like To/Cc, threading, urgency, typed references, ack state, and list expansion can help agents reason and automate.

## MVP shape
The MVP is intentionally narrow:
- one SQLite database
- one CLI interface
- acting identity from environment variables
- a shared address directory
- acting identities must be active to use the CLI
- static lists (no user-facing subscription/moderation semantics; membership may still be edited administratively between sends)
- immutable messages
- per-recipient deliveries
- sender-local sent view
- OTEL/telemetry for learning
- optional experimental discovery mode
- real `inbox give-feedback` command for research capture

## Operational layer note
Experimental mode can expose tiered future surfaces (`core`, `broad`, `frontier`) and capture modes (`safe`, `dangerous-full-context`) for product learning. The real `inbox give-feedback` command closes the loop by letting agents describe desired workflows and outcomes.

Telemetry and experimental discovery mode are part of MVP operations, but they are not core protocol primitives. The core model and invariants describe message, delivery, and visibility physics. Telemetry must not write protocol state, and discovery mode must be explicitly enabled (for example via `INBOX_DISCOVERY_MODE=1`) and must not mutate core mail state for unimplemented commands. Operational concerns are specified in:
- `mvp-spec.md` for command-level operational rules, experimental profiles, and `give-feedback`
- `quality-gates-and-uat.md` for testing and gating
- `integration-seams.md` for observability, capture, and CLI seam definitions

## Broad versioning intuition
- **MVP / v1 local-first:** SQLite, CLI, one VPS, no hardened cryptographic privacy
- **v2 broader routing:** multi-VPS / multi-host routing, stronger identity and auth model
- **v3 stronger privacy:** PGP-style message/privacy layer and more serious hidden-recipient/privacy guarantees

## Design principle that keeps the whole system coherent
Shared facts should be canonical; recipient behavior and interpretation should be local.
