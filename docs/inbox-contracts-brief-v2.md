# Inbox Contracts Package — Brief v2

**Status:** Working draft for implementation (v2 patched)  
**Audience:** UI engineers, API engineers, tooling/fixture authors  
**Purpose:** Freeze the first local BFF contract boundary so the UI can be built against stable read/write seams using deterministic fake data first, then swapped to SQLite-backed adapters without page rewrites.

---

## 1. Scope

This brief defines the first contract boundary for the Inbox dev tooling app. Version 2 patches type-level issues found in the first brief review before contracts ship.

It covers:

- shared enums and ID conventions
- request context objects
- the BFF envelope shape
- first-wave read and write endpoint contracts
- visibility/highlighting annotations for god mode
- timestamp format rules
- fixture/scenario rules
- adapter parity requirements
- mock-mode switching rules

It does **not** redefine the Inbox protocol itself.

---

## 2. Core contract principles

### 2.1 Protocol vs BFF are different contract layers

The Inbox protocol / CLI contract remains frozen to its own flat `{"ok": true, ...}` shape.

The local API server is a **BFF contract layer** optimized for the React UI. It may use a richer envelope, but that is an intentional distinction and must be documented everywhere as such.

### 2.2 UI never computes protocol truth

The UI must **not** derive or reconstruct:

- list expansion
- deduplication
- effective role precedence
- visibility / access
- allowed actions
- engagement state transitions
- event timelines

That logic belongs in the service layer / BFF.

### 2.3 God mode is a first-class scope, not a hack

All read endpoints accept a view scope. MVP can default to god mode, but contracts must already support future actor-scoped reads without changing endpoint shape.

### 2.4 Public mutation handle is `messageId`

Normal UI write actions use message IDs, not delivery IDs.

Delivery IDs may appear in god-mode/debug payloads, but they are not the default public mutation seam.

### 2.5 Deterministic, scenario-driven fake data

Fake data must be seeded from realistic scenarios mapped to quality-gates/invariant tests. Do not use random filler as the primary source.

---

## 3. Package layout

```text
packages/
  inbox-contracts/
    src/
      ids.ts
      enums.ts
      contexts.ts
      envelopes.ts
      entities/
      read-models/
      actions/
      schemas/
      fixtures/
      scenario-library/
      contract-tests/
```

### Ownership rules

`inbox-contracts` owns:

- shared TypeScript types
- Zod schemas / JSON schemas
- endpoint request/response schemas
- fixture naming conventions
- scenario metadata
- contract validation tests

The UI and API both depend on this package.

---

## 4. ID conventions

All IDs are opaque strings.

```ts
export type MessageId = string;       // e.g. msg_000123
export type DeliveryId = string;      // internal/debug only
export type ConversationId = string;  // e.g. cnv_000044
export type AddressId = string;       // e.g. adr_000051
export type GroupId = string;         // same domain as AddressId for list-kind addresses if desired
export type RunId = string;           // e.g. run_000019
export type TraceId = string;
export type EventId = string;
```

### Rules

- IDs are stable and deterministic in fixture packs.
- IDs are linkable across the UI.
- Delivery IDs may appear in inspector/debug models, but normal mutation routes do not require them.

---

## 5. Enums

```ts
export type EnvironmentRef =
  | "local"
  | "dev"
  | "staging"
  | "prod"
  | "experimental";

export type AddressKind = "agent" | "human" | "service" | "list";

export type Urgency = "low" | "normal" | "high" | "urgent";

export type EngagementState = "unread" | "read" | "acknowledged";

export type VisibilityState = "active" | "hidden";

// MVP CLI does not expose bcc, but the protocol schema reserves it.
// EffectiveRole is "to" | "cc" at the BFF v1 contract layer; bcc support
// will be added in a future contract version when --bcc graduates.
export type EffectiveRole = "to" | "cc";

export type ViewKind = "received" | "sent";

export type Ratio01 = number; // frozen as a 0..1 ratio, never 0..100

export type CommandSource = "cli" | "ui" | "sandbox" | "system";

export type CommandStatus = "success" | "error" | "rejected";

export type ProtocolErrorCode =
  | "invalid_argument"
  | "invalid_state"
  | "not_found"
  | "permission_denied"
  | "internal_error";

export type ExperimentalErrorCode = "coming_soon";

export type PublicErrorCode = ProtocolErrorCode | ExperimentalErrorCode;
```

### Important freeze

Urgency is **exactly**:

- `low`
- `normal`
- `high`
- `urgent`

No `critical`.

---

## 6. Timestamp format

The contract layer uses **Unix milliseconds**.

```ts
export type TimestampMs = number;
```

### Rules

- BFF request/response contracts use `*_at_ms` fields.
- Fixtures use Unix milliseconds.
- Replay uses ordered event timestamps in milliseconds.
- Any ISO rendering happens in the UI formatting layer, not in the shared contracts package.

This keeps parity with the Inbox protocol spec and avoids conversion drift.

---

## 7. Request contexts

## 7.1 Read context

```ts
export type ViewScope =
  | { mode: "actor"; addressId: AddressId }
  | { mode: "god"; highlightAddressId?: AddressId | null };

export type QueryContext = {
  env: EnvironmentRef;
  scope: ViewScope;
  asOfMs?: TimestampMs | null;
};
```

### Semantics

- `actor` mode = results are scoped to the actor.
- `god` mode = canonical/global view.
- `god + highlightAddressId` = canonical/global view **plus** per-message or per-delivery visibility highlighting for the selected actor.

## 7.2 Write/action context

```ts
export type ActionContext = {
  env: EnvironmentRef;
  actorAddressId: AddressId;
  asOfMs?: TimestampMs | null;
};
```

### Semantics

- Write actions never infer the acting identity from the read scope.
- Compose and dry-run explicitly provide the sender / actor.
- The UI may be viewing as one actor while sending as another.

---

## 8. BFF envelope

The BFF envelope is intentionally distinct from the CLI/protocol envelope.

```ts
export type BffMeta = {
  env: EnvironmentRef;
  scope?: ViewScope;
  asOfMs: TimestampMs | null;
  requestId: string;
};

export type BffSuccess<T> = {
  ok: true;
  result: T;
  meta: BffMeta;
};

export type BffFailure = {
  ok: false;
  error: {
    code: PublicErrorCode;
    // Stable production paths should map to ProtocolErrorCode.
    // Experimental discovery flows may return "coming_soon".
    message: string;
    details?: Record<string, unknown>;
  };
  meta: BffMeta;
};

export type BffResponse<T> = BffSuccess<T> | BffFailure;
```

### Rules

- The BFF may add metadata useful for the UI.
- The BFF does not change the underlying Inbox protocol rules.
- `requestId` should correlate to logging/OTEL where possible.

---

## 9. Shared entity summaries

These are shared fragments used across multiple read models.

```ts
export type AddressSummary = {
  addressId: AddressId;
  address: string;
  displayName: string | null;
  kind: AddressKind;
  isActive: boolean;
  isListed: boolean;
  classification: string | null;
};

export type VisibilityAnnotation = {
  isVisibleToHighlightedActor?: boolean | null;
};

export type PublicRecipientDisplay = VisibilityAnnotation & {
  ordinal: number;
  role: EffectiveRole;
  addressId: AddressId;
  address: string;
  displayName: string | null;
  kind: AddressKind;
};

export type DeliverySourceDisplay = {
  kind: "direct" | "list";
  role: EffectiveRole;
  listAddressId?: AddressId;
  listAddress?: string;
};

export type DeliveryTimelineEvent = {
  // Matches the protocol delivery_events.change_kind vocabulary exactly.
  kind: "delivered" | "read" | "ack" | "hide" | "unhide";
  atMs: TimestampMs;
  actorAddressId?: AddressId | null;
};

export type ReferenceDisplay = {
  kind: string;
  value: string;
  label?: string | null;
  mimeType?: string | null;
};

export type ParentLinkDisplay = {
  // "redacted" matters in actor-scoped views.
  // Pure god-mode responses never produce "redacted".
  state: "visible" | "redacted" | "none";
  messageId?: MessageId;
  subject?: string;
};

export type ResolutionSummary = {
  logicalRecipientCount: number;
  resolvedRecipientCount: number;
  skippedInactiveMemberCount: number;
  dedupedRecipientCount: number;
};

export type DryRunResolutionSummary = ResolutionSummary & {
  expandedCandidateCount: number;
};
```

### Visibility annotation rules

- `actor` scope: `isVisibleToHighlightedActor` is computed.
- `god` scope with `highlightAddressId`: computed.
- `god` scope with no highlight: `null` or omitted.

The UI never computes this field itself.

---

## 10. Read models


## 10.0 Session / whoami

```ts
export type SessionModel = {
  env: EnvironmentRef;
  dbPath: string;
  defaultViewScope: ViewScope;
  defaultSendIdentity: AddressId | null;
  resolvedActingAddressId: AddressId | null;
  asOfMs: TimestampMs | null;
};
```

This is the BFF analogue of `inbox whoami`.

## 10.1 Inbox list

### Request

```ts
export type InboxFolder =
  | "inbox"
  | "sent"
  | "unread"
  | "ack_needed"
  | "hidden"
  | "all";

export type InboxListRequest = {
  context: QueryContext;
  filter: {
    folder?: InboxFolder;
    state?: EngagementState | "any";
    visibility?: VisibilityState | "all";
    senderAddressId?: AddressId;
    senderKinds?: AddressKind[];
    timeWindow?: { fromMs: TimestampMs; toMs: TimestampMs };
    sort?: {
      field: "deliveredAtMs" | "sender" | "urgency" | "engagementState";
      direction: "asc" | "desc";
    };
  };
  page?: {
    limit: number;
    cursor?: string;
  };
};
```

### Note on pagination

Cursor pagination is a **BFF/UI convenience**, not a protocol requirement.

### Response

```ts
export type InboxRow = VisibilityAnnotation & {
  deliveryId?: DeliveryId; // optional debug field, not required for normal UI actions
  messageId: MessageId;
  conversationId: ConversationId;
  sender: AddressSummary;
  subject: string;
  previewText: string;
  deliveredAtMs: TimestampMs;
  engagementState: EngagementState;
  visibilityState: VisibilityState;
  effectiveRole: EffectiveRole;
  participantCount: number;
  badgeFlags: {
    urgent: boolean;
    hasReferences: boolean;
    listDelivered: boolean;
    threaded: boolean;
  };
};

export type InboxListResult = {
  rows: InboxRow[];
  nextCursor: string | null;
  totalApprox?: number;
};
```

## 10.2 Message reader

```ts
export type MessageReaderModel = VisibilityAnnotation & {
  messageId: MessageId;
  conversationId: ConversationId;
  viewKind: ViewKind;
  sender: AddressSummary;
  publicRecipients: PublicRecipientDisplay[];
  subject: string;
  body: {
    format: "plain";
    text: string;
  };
  urgency: Urgency;
  createdAtMs: TimestampMs;
  currentDelivery?: VisibilityAnnotation & {
    deliveryId?: DeliveryId; // debug only
    engagementState: EngagementState;
    visibilityState: VisibilityState;
    effectiveRole: EffectiveRole;
    sourceBreakdown: DeliverySourceDisplay[];
    timeline: DeliveryTimelineEvent[];
  };
  references: ReferenceDisplay[];
  parent: ParentLinkDisplay;
  threadPreview: {
    mode: "chronological" | "tree";
    nodes: ThreadNode[];
  };
  actions: {
    canReply: boolean;
    canReplyAll: boolean;
    canAck: boolean;
    canHide: boolean;
    canUnhide: boolean;
    canPeek: boolean;
  };
};
```

### Message reader note

- `viewKind` is explicit and mirrors the protocol-facing read distinction.
- `currentDelivery` may be absent for sent-only views.

## 10.3 Thread preview node

```ts
export type ThreadNode = VisibilityAnnotation & {
  messageId: MessageId;
  conversationId: ConversationId;
  parentMessageId: MessageId | null;
  sender: AddressSummary;
  subject: string;
  bodyPreview: string;
  urgency: Urgency;
  createdAtMs: TimestampMs;
  engagementState?: EngagementState | null;
  visibilityState?: VisibilityState | null;
  parent: ParentLinkDisplay;
  depth: number;
  childCount: number;
};
```

## 10.4 Agent directory

```ts
export type AgentDirectoryRow = {
  address: AddressSummary;
  inboxVolume: number;
  sentVolume: number;
  avgTimeToReadMs: number | null;
  ackRate: Ratio01 | null;
  lastActiveAtMs: TimestampMs | null;
  createdAtMs: TimestampMs;
};

export type AgentDirectoryRequest = {
  context: QueryContext;
  filter?: {
    kinds?: AddressKind[];
    isActive?: boolean;
    isListed?: boolean;
    classification?: string;
    search?: string;
  };
  page?: {
    limit: number;
    cursor?: string;
  };
};

export type AgentDirectoryResult = {
  rows: AgentDirectoryRow[];
  nextCursor: string | null;
};

### Ack-rate units

`ackRate` is always a `0..1` ratio, never a percentage.
```

## 10.5 Agent profile

```ts
export type GroupMemberDisplay = {
  ordinal: number;
  member: AddressSummary;
};

export type AgentProfileModel = {
  address: AddressSummary & {
    description: string | null;
    createdAtMs: TimestampMs;
    lastActiveAtMs: TimestampMs | null;
  };
  membership?: {
    members: GroupMemberDisplay[];
    zeroActiveMembersWarning: boolean;
  };
  communicationSummary: {
    inboundTopPeers: Array<{ peer: AddressSummary; messageCount: number }>;
    outboundTopPeers: Array<{ peer: AddressSummary; messageCount: number }>;
    messagesOverTime: Array<{ bucketStartMs: TimestampMs; sent: number; received: number }>;
    avgResponseLatencyMs: number | null;
    ackRate: Ratio01 | null;
  };
  recentActivity: {
    recentConversationIds: ConversationId[];
    recentSentMessageIds: MessageId[];
    recentErrors: Array<{ atMs: TimestampMs; code: PublicErrorCode; message: string }>;
  };
  actions: {
    canEditProfile: boolean;
    canEditMembership: boolean;
    canDeactivate: boolean;
    canClone: boolean;
    canSendTestMessage: boolean;
  };
};
```

## 10.6 Dashboard summary

```ts
export type DashboardSummaryModel = {
  nowMs: TimestampMs;
  windows: {
    last24h: {
      totalMessagesSent: number;
      messagesByHuman: number;
      messagesByAgent: number;
      unreadBacklog: number;
      ackNeededBacklog: number;
      failedSends: number;
      medianTimeToReadMs: number | null;
      medianTimeToAckMs: number | null;
    };
  };
  activeAgents: {
    active: number;
    total: number;
  };
  charts: {
    messageVolume: Array<{ bucketStartMs: TimestampMs; count: number }>;
    topCommunicators: Array<{ address: AddressSummary; messageCount: number }>;
    threadDepthDistribution: Array<{ depth: number; count: number }>;
    errorRateByAgent: Array<{ address: AddressSummary; errorCount: number }>;
  };
};
```

## 10.7 Conversation inspector (god mode first)

```ts
export type VisibilityMatrixCell = {
  addressId: AddressId;
  delivery: {
    engagement: EngagementState;
    visibility: VisibilityState;
  } | null;
  isVisibleToHighlightedActor?: boolean | null;
};

export type VisibilityMatrixRow = {
  messageId: MessageId;
  cells: VisibilityMatrixCell[];
};

export type ParticipantTimelineEntry = {
  address: AddressSummary;
  firstSeenAtMs: TimestampMs;
};

export type DerivedAnomaly = {
  code:
    | "zero_reads_after_threshold"
    | "ack_without_prior_read"
    | "hidden_immediately_after_delivery"
    // v1 may not always detect this from DB state alone; required bookkeeping is TBD.
    | "reply_all_audience_changed"
    | "direct_list_overlap";
  severity: "info" | "warning" | "error";
  message: string;
  relatedMessageIds?: MessageId[];
};

export type ConversationInspectorModel = {
  conversationId: ConversationId;
  summary: {
    subjectRoot: string | null;
    messageCount: number;
    participantCount: number;
    firstMessageAtMs: TimestampMs;
    lastMessageAtMs: TimestampMs;
  };
  // Flat array sorted by createdAtMs ASC. UI builds the tree from parentMessageId references.
  tree: ThreadNode[];
  visibilityMatrix: VisibilityMatrixRow[];
  participantTimeline: ParticipantTimelineEntry[];
  anomalies: DerivedAnomaly[];
};
```

## 10.8 Command runs

This is a **BFF-layer/dev-tooling entity**, not a protocol entity.

```ts
export type CommandRun = {
  runId: RunId;
  startedAtMs: TimestampMs;
  completedAtMs: TimestampMs | null;
  actorAddressId: AddressId | null;
  environment: EnvironmentRef;
  source: CommandSource;
  commandName: string;
  argsSummary: Record<string, unknown>;
  status: CommandStatus;
  errorCode: PublicErrorCode | null;
  affectedEntityIds: string[];
  traceId: TraceId | null;
};

export type CommandRunListResult = {
  rows: CommandRun[];
  nextCursor: string | null;
};
```

---

## 11. Write/action models

## 11.1 Compose dry-run

### Endpoint

```text
POST /api/v1/messages/dry-run
```

### Request

```ts
export type ComposeDryRunRequest = {
  context: ActionContext;
  input: {
    senderAddressId: AddressId;
    to: string[];
    cc: string[];
    subject: string;
    bodyText: string;
    urgency: Urgency;
    references?: Array<{
      kind: string;
      value: string;
      label?: string | null;
      mimeType?: string | null;
    }>;
  };
};
```

### Response

```ts
export type ComposeDryRunResult = {
  validation: {
    senderIsActive: boolean;
    hasAtLeastOneTo: boolean;
    bodyPresent: boolean;
    allLogicalRecipientsKnown: boolean;
    resolvesToAtLeastOneActualRecipient: boolean;
    ok: boolean;
  };
  logicalRecipients: Array<{
    inputOrdinal: number;
    role: EffectiveRole;
    address: string;
    addressId: AddressId | null;
    status: "known" | "unknown" | "inactive";
  }>;
  expansion: Array<{
    logicalRecipientOrdinal: number;
    logicalAddress: string;
    logicalRole: EffectiveRole;
    expandedAddressId: AddressId;
    expandedAddress: string;
    expandedVia:
      | { kind: "direct" }
      | { kind: "list"; listAddressId: AddressId; listAddress: string; memberOrdinal: number };
    recipientStatus: "active" | "inactive";
  }>;
  resolvedRecipients: Array<{
    addressId: AddressId;
    address: string;
    effectiveRole: EffectiveRole;
    sourceBreakdown: Array<
      | { kind: "direct"; role: EffectiveRole }
      | { kind: "list"; role: EffectiveRole; listAddressId: AddressId; listAddress: string }
    >;
    included: boolean;
    exclusionReason?: "inactive" | "deduped_lower_precedence";
  }>;
  warnings: Array<{
    code:
      | "unknown_recipient"
      | "inactive_acting_address"
      | "inactive_recipient"
      | "inactive_list"
      | "all_inactive_list_members"
      | "zero_resolution"
      | "duplicate_same_role_deduped"
      | "cross_role_overlap_preserved";
    message: string;
  }>;
  resolutionSummary: DryRunResolutionSummary;
};
```

### Notes

- This powers the compose preview panel.
- This must reuse the same resolution logic as the real send path.
- This is the preferred place to expose source breakdown and effective roles before commit.

## 11.2 Send message

```ts
export type SendMessageRequest = {
  context: ActionContext;
  input: {
    senderAddressId: AddressId;
    to: string[];
    cc: string[];
    subject: string;
    bodyText: string;
    urgency: Urgency;
    references?: Array<{
      kind: string;
      value: string;
      label?: string | null;
      mimeType?: string | null;
    }>;
  };
};

export type SendMessageResult = {
  messageId: MessageId;
  conversationId: ConversationId;
  resolutionSummary: ResolutionSummary;
  publicRecipients: PublicRecipientDisplay[];
};
```

## 11.3 Ack / hide / unhide

### Endpoints

```text
POST /api/v1/messages/:messageId/ack
POST /api/v1/messages/:messageId/hide
POST /api/v1/messages/:messageId/unhide
```

### Request

```ts
export type MessageActionRequest = {
  context: ActionContext;
};
```

### Response

```ts
export type MessageActionResult = {
  messageId: MessageId;
  conversationId: ConversationId;
  resultingEngagementState?: EngagementState;
  resultingVisibilityState?: VisibilityState;
  eventRecorded: boolean;
};
```

### Rules

- These endpoints accept `messageId`, not `deliveryId`.
- The backend resolves the correct delivery using `messageId + actorAddressId + env`.
- If no address-specific delivery can be resolved, return a normal public error.

## 11.4 Update address profile

```ts
export type UpdateAddressProfileRequest = {
  context: ActionContext;
  input: {
    addressId: AddressId;
    displayName: string | null;
    description: string | null;
    isActive: boolean;
    isListed: boolean;
    classification: string | null;
  };
};

export type UpdateAddressProfileResult = {
  address: AddressSummary & {
    description: string | null;
    updatedAtMs: TimestampMs;
  };
};
```

## 11.5 Update group membership

```ts
export type UpdateGroupMembershipRequest = {
  context: ActionContext;
  input: {
    groupAddressId: AddressId;
    members: Array<{
      addressId: AddressId;
      ordinal: number;
    }>;
  };
};

export type UpdateGroupMembershipResult = {
  groupAddressId: AddressId;
  members: GroupMemberDisplay[];
  updatedAtMs: TimestampMs;
};
```

---

## 12. First endpoint set

```text
GET  /api/v1/session
GET  /api/v1/inbox/list
GET  /api/v1/messages/:messageId/reader
POST /api/v1/messages/dry-run
POST /api/v1/messages/send
POST /api/v1/messages/:messageId/ack
POST /api/v1/messages/:messageId/hide
POST /api/v1/messages/:messageId/unhide

GET  /api/v1/agents/directory
GET  /api/v1/agents/:addressId/profile
POST /api/v1/agents/:addressId/update-profile
POST /api/v1/groups/:groupAddressId/update-membership

GET  /api/v1/dashboard/summary
GET  /api/v1/explorer/conversations/:conversationId/inspect
GET  /api/v1/explorer/command-runs
```

These are sufficient for:

- session / whoami
- inbox list
- reader
- compose preview and send
- agent directory/profile/editor
- basic dashboard
- god-mode conversation inspector
- request/run history

---

## 13. Fake data architecture

## 13.1 Two fixture layers

### Layer A — canonical scenario fixtures

These are protocol-shaped source fixtures.

```text
src/fixtures/scenarios/
  scenario-01-normal-team/
    addresses.json
    groups.json
    messages.json
    deliveries.json
    delivery-events.json
    command-runs.json
```

### Layer B — derived endpoint fixtures

These are exact API response fixtures for UI pages.

```text
src/fixtures/derived/
  inbox-list.god.default.json
  inbox-list.actor.alice.json
  message-reader.msg_000123.god.json
  conversation-inspector.cnv_000044.god.json
```

### Rules

- Derived fixtures must be generated from canonical fixtures where practical.
- Hand-authored derived fixtures are allowed for early UI work, but must validate against schemas.
- Adapter parity tests should compare fake-adapter outputs to SQLite-backed outputs for the same scenario inputs.

## 13.2 Scenario metadata

Every scenario must include metadata linking it to spec test coverage.

```ts
export type ScenarioMeta = {
  scenarioId: string;
  title: string;
  description: string;
  seed: number;
  qualityGateRefs: number[];
  invariantRefs?: string[];
};
```

### Required scenario mapping examples

- `scenario-02-reply-all-membership-change`
  - quality gate refs: `4`, `6`
- `scenario-10-direct-list-overlap-dedup`
  - quality gate refs: `11`

This traceability is required.

## 13.3 Initial scenario library

At minimum:

1. normal team coordination
2. reply-all with membership change
3. hidden but active message
4. self-send note chain
5. zero-recipient resolution failure
6. busy incident thread
7. human + agent collaboration
8. experimental probe attempts
9. stalled urgent thread
10. direct + list overlap dedup

---

## 14. Mock modes

The UI must support three data modes via config, not code rewrites.

## 14.1 Static fixture mode

UI imports fixture JSON directly.

Use for:

- Storybook
- component work
- layout work
- screenshot generation

## 14.2 Mock API mode

Local fake API server serves the exact endpoint contracts.

Use for:

- page integration
- router/query-state work
- loading/empty/error state handling

## 14.3 Hybrid mode

Some endpoints fake, some real.

Use for:

- gradual backend replacement
- bringing real endpoints online page-by-page

---

## 15. Contract testing requirements

## 15.1 Schema validation

- Every request/response schema must validate via Zod/JSON schema.
- Every published fixture must validate against its declared contract.

## 15.2 Adapter parity

For selected seeded scenarios, compare:

- fake adapter output
- SQLite-backed adapter output

They must match on:

- field presence
- enums
- ordering rules
- derived state semantics
- action availability
- visibility annotations

Not necessarily byte-for-byte, but semantically equivalent.

## 15.3 Snapshot/UI state packs

Every first-wave page must have fixture packs for:

- happy path
- empty state
- error state
- dense/pathological state

## 15.4 Time determinism

- fixed seeds
- fixed base timestamps
- deterministic ID generation
- deterministic ordering

This is required for replay, graphs, visual regression, and Storybook stability.

---

## 16. Contract boundary rules

### UI must not

- query SQLite directly
- derive visibility
- derive effective roles
- expand lists
- decide action availability
- infer event sequences from raw rows

### BFF must

- expose page-shaped read models
- expose explicit command-shaped writes
- compute visibility annotations
- compute action availability
- keep protocol semantics centralized

### Debug surfaces may expose

- raw IDs
- delivery IDs
- raw rows
- linked row graphs

But those are debug affordances, not normal page mutation seams.

---

## 17. Recommended next implementation steps

1. create `inbox-contracts` package
2. add shared enums, IDs, contexts, envelopes
3. add Zod schemas for first endpoint set
4. add canonical scenario fixtures for scenarios 1–4
5. generate first derived fixtures for:
   - session / whoami
- inbox list
   - reader
   - compose dry-run
   - agent directory
   - conversation inspector
6. implement fake adapter against those scenarios
7. wire mock API server to serve the contracts
8. build UI against mock API mode first
9. add SQLite adapter parity tests before swapping endpoints live

---

## 18. Non-goals for v1

Not frozen here:

- full OTEL explorer schema
- graph/replay payload schemas
- incident review export format
- full config editor schema
- multi-tenant auth model
- transport protocol beyond the local BFF

Those can be added in later contract versions.

---

## 19. Bottom line

This brief freezes the first safe seam:

- protocol remains authoritative
- BFF is explicitly a UI-oriented layer
- god mode is supported now without becoming permanent drift
- fake and real adapters are required to converge on the same page contracts
- UI agents can begin immediately against stable endpoint schemas and deterministic fixture packs

