# Inbox — Roadmap and Deferrals

## Why this doc exists
The roadmap is here to defend the MVP from scope creep while still preserving the larger system direction.

Each deferred item should either:
- stay deferred
- be pulled forward only when a real usage signal forces it

That usage signal is the tripwire.

## Near-future candidate items

### Search
Deferred from MVP.

**Tripwire:** agents repeatedly need large time windows or repeatedly ask for list/thread/sent filters that cannot be handled with `--since`, `--until`, and `--limit`.

### Paging / cursors
Deferred from MVP.

**Tripwire:** thread/list outputs regularly exceed the default/max limits and date windows are no longer enough.

### Local overrides / address-book behavior
Deferred from MVP.

**Tripwire:** two actors need materially different local interpretations of the same address or list, or telemetry shows repeated manual sender/list prioritization patterns.

### Mark-unread
Deferred from MVP.

**Tripwire:** agents regularly need to re-surface previously read messages for re-triage, crash recovery, or deliberate deferred follow-up.

### Sender-visible receipts
Deferred from MVP.

**Tripwire:** orchestrator workflows genuinely require sender-visible downstream receipt state and the team is ready to make explicit privacy-policy decisions around read/ack visibility.

### Forward
Deferred from MVP.

**Tripwire:** agents repeatedly need to share existing context across different audiences without manually composing new summary/reply messages.

### Explicit fork / branch
Deferred from MVP.

**Tripwire:** reply chains with diverging audiences become confusing enough that the team needs an explicit derived-subthread action rather than plain parent-linked replies.

### Thread command refinements
Deferred from MVP beyond the base `thread` command.

Potential later refinements:
- branch-aware rendering
- tree view vs flat chronology view
- expand/collapse controls in richer clients
- “show only my visible branch” or “show ancestors/children” options

**Tripwire:** agents or humans repeatedly need more than the base latest-visible-window thread view.

## Larger-version items

### Multi-VPS / multi-host routing
Not MVP.

**Tripwire:** Inbox proves useful enough locally that cross-host routing is the next bottleneck.

### Stronger auth model
Not MVP.

**Tripwire:** multiple trust domains, multiple human operators, or enterprise-style delegated access need stronger identity and authorization controls.

### Cryptographic privacy / PGP-style model
Not MVP.

**Tripwire:** multi-host routing exists and the privacy model can no longer rely on trusted local storage and application-layer concealment.

### Hardened BCC privacy
Not MVP. Basic user-facing `--bcc` CLI behavior is also deferred; MVP only reserves schema for future private-recipient support.

**Tripwire:** hidden-recipient guarantees need to survive broader routing, stronger threat models, or cryptographic audit expectations.

### Advanced list privacy modes
Not MVP.

**Tripwire:** different teams need hidden membership, scoped membership visibility, moderated membership views, or public/subscribable list behavior.

### Managed blob / artifact storage
Not MVP.

**Tripwire:** the 1 MB reference-content cap or path/URL-style reference model is no longer sufficient for real agent workflows.

### Workflow-heavy delivery/task states
Not MVP.

Examples:
- claimed
- in_progress
- completed
- dismissed
- snoozed

**Tripwire:** telemetry shows agents repeatedly trying to use Inbox as a lightweight work queue and read/ack/hide are not enough.

## Explicit non-goals for MVP
- real-time chat
- SMTP interoperability
- enterprise admin console
- complex list moderation
- mailbox folders beyond active/hidden
- cryptographic concealment guarantees
- message editing after send


## Experimental surface graduation
Experimental discovery mode is an MVP operations feature, not a protocol feature. Candidate commands/flags graduate into the real CLI when:
- multiple agents attempt them repeatedly
- guessed syntax is reasonably consistent
- the feature fits the Inbox mental model
- the feature can be implemented without turning Inbox into a workflow engine

Near-term experimental tiers:
- core: highest-likelihood near-term features
- broad: wider discovery surface
- frontier: more speculative surfaces such as folders/tags/filtering/escalation semantics

Feedback submitted through `inbox give-feedback` and OTEL/capture logs should be used to decide what moves forward, what stays deferred, and what should be killed.
