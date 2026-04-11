/**
 * Zod schemas for Inbox JSON contracts.
 *
 * These schemas encode the frozen response shapes from json-contracts.md
 * and the field names from Contract G (integration-seams.md).
 */
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Register Zod's .openapi() extension. Must happen before any .openapi(...)
// call below. Idempotent: calling extendZodWithOpenApi more than once is a
// no-op if the prototype is already extended.
extendZodWithOpenApi(z);

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Typed-prefix ID pattern (e.g. msg_abc123) */
export const prefixedId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_`), {
    message: `ID must start with "${prefix}_"`,
  });

export const messageId = prefixedId("msg");
export const conversationId = prefixedId("cnv");
export const deliveryId = prefixedId("dly");
export const feedbackId = prefixedId("fbk");

/** Unix millisecond timestamp */
export const timestampMs = z.number().int().nonnegative();

/** Address string like "pm-alpha@vps-1" */
export const addressStr = z
  .string()
  .min(1)
  .regex(/^[^@]+@[^@]+$/, { message: "Address must be in local@host format" });

// ---------------------------------------------------------------------------
// Enum schemas
// ---------------------------------------------------------------------------

export const addressKindSchema = z.enum([
  "agent",
  "human",
  "service",
  "list",
]);
export const recipientRoleSchema = z.enum(["to", "cc"]);
export const effectiveRoleSchema = z.enum(["to", "cc", "bcc"]);
export const engagementStateSchema = z.enum([
  "unread",
  "read",
  "acknowledged",
]);
export const visibilityStateSchema = z.enum(["active", "hidden"]);
export const viewKindSchema = z.enum(["received", "sent"]);
export const urgencySchema = z.enum(["low", "normal", "high", "urgent"]);
export const refKindSchema = z.enum([
  "path",
  "url",
  "json",
  "text",
  "artifact_id",
  "other",
]);
export const errorCodeSchema = z.enum([
  "not_found",
  "invalid_argument",
  "invalid_state",
  "permission_denied",
  "internal_error",
  "coming_soon",
]);

// ---------------------------------------------------------------------------
// Shared fragments (json-contracts.md)
// ---------------------------------------------------------------------------

/** Address summary — directory/whoami shape */
export const addressSummarySchema = z
  .object({
    address: addressStr,
    kind: addressKindSchema,
    display_name: z.string().nullable(),
    description: z.string().nullable(),
    is_active: z.boolean(),
    is_listed: z.boolean(),
    classification: z.string().nullable(),
  })
  .openapi("AddressSummary", {
    description: "A summary of an address (agent, human, service, or list)",
  });

/** Delivery-local state fragment */
export const deliveryStateSchema = z.object({
  view_kind: z.literal("received"),
  engagement_state: engagementStateSchema,
  visibility_state: visibilityStateSchema,
  effective_role: effectiveRoleSchema,
});

/** Sent-item-local state fragment */
export const sentStateSchema = z.object({
  view_kind: z.literal("sent"),
  visibility_state: visibilityStateSchema,
});

/** Reference object */
export const referenceSchema = z.object({
  kind: refKindSchema,
  value: z.string(),
  label: z.string().nullable(),
  mime_type: z.string().nullable(),
  metadata: z.unknown().nullable(),
});

/** Compact reference (thread full-mode only emits kind + value) */
export const threadReferenceSchema = z.object({
  kind: refKindSchema,
  value: z.string(),
});

/** Resolution summary */
export const resolutionSummarySchema = z.object({
  logical_recipient_count: z.number().int().nonnegative(),
  resolved_recipient_count: z.number().int().nonnegative(),
  skipped_inactive_member_count: z.number().int().nonnegative(),
  deduped_recipient_count: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Error envelope (Contract B)
// ---------------------------------------------------------------------------

export const errorDetailSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  target: z.string().nullable().default(null),
  details: z.unknown().nullable().default(null),
});

export const errorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: errorDetailSchema,
  })
  .openapi("ErrorEnvelope", {
    description: "Standard error envelope returned by every non-2xx response",
  });

/** Experimental coming-soon error variant */
export const comingSoonErrorSchema = z.object({
  ok: z.literal(false),
  experimental: z.literal(true).optional(),
  error: z.object({
    code: z.literal("coming_soon"),
    message: z.string(),
    details: z
      .object({
        feature: z.string(),
        feedback_command: z.string(),
      })
      .optional(),
  }),
});

// ---------------------------------------------------------------------------
// Command response schemas (json-contracts.md, Contract G)
// ---------------------------------------------------------------------------

/** inbox whoami */
export const whoamiResponseSchema = z.object({
  ok: z.literal(true),
  address: addressStr,
  kind: addressKindSchema,
  display_name: z.string().nullable(),
  is_active: z.boolean(),
  is_listed: z.boolean(),
  db_path: z.string(),
});

/** inbox send */
export const sendResponseSchema = z
  .object({
    ok: z.literal(true),
    message_id: messageId,
    conversation_id: conversationId,
    sender: addressStr,
    public_to: z.array(addressStr),
    public_cc: z.array(addressStr),
    resolved_recipient_count: z.number().int().positive(),
    resolution_summary: resolutionSummarySchema,
    sent_item_created: z.boolean(),
  })
  .openapi("SendResponse", {
    description: "Result of POST /api/send",
  });

/** inbox list — single item */
export const listItemSchema = z.object({
  message_id: messageId,
  conversation_id: conversationId,
  sender: addressStr,
  subject: z.string(),
  delivered_at_ms: timestampMs,
  view_kind: z.literal("received"),
  engagement_state: engagementStateSchema,
  visibility_state: visibilityStateSchema,
  effective_role: effectiveRoleSchema,
  body_preview: z.string(),
  delivery_id: deliveryId,
});

/** inbox list */
export const listResponseSchema = z
  .object({
    ok: z.literal(true),
    items: z.array(listItemSchema),
    limit: z.number().int().positive(),
    returned_count: z.number().int().nonnegative(),
  })
  .openapi("ListResponse", {
    description: "Result of GET /api/inbox — received message summaries",
  });

/** Message content fragment (shared by read, sent read) */
export const messageContentSchema = z.object({
  message_id: messageId,
  conversation_id: conversationId,
  parent_message_id: messageId.nullable(),
  sender: addressStr,
  subject: z.string(),
  body: z.string(),
  public_to: z.array(addressStr),
  public_cc: z.array(addressStr),
  references: z.array(referenceSchema),
});

/** inbox read */
export const readResponseSchema = z
  .object({
    ok: z.literal(true),
    message: messageContentSchema,
    state: deliveryStateSchema.extend({
      delivery_id: deliveryId,
    }),
    history: z.array(z.unknown()),
  })
  .openapi("ReadResponse", {
    description: "Result of GET /api/inbox/{messageId} — full message + state + history",
  });

/** inbox reply */
export const replyResponseSchema = z
  .object({
    ok: z.literal(true),
    message_id: messageId,
    conversation_id: conversationId,
    parent_message_id: messageId,
    sender: addressStr,
    resolved_recipient_count: z.number().int().positive(),
    resolution_summary: resolutionSummarySchema,
    sent_item_created: z.boolean(),
  })
  .openapi("ReplyResponse", {
    description: "Result of POST /api/reply/{messageId}",
  });

/** inbox ack / hide / unhide — mutation result */
export const mutationResponseSchema = z
  .object({
    ok: z.literal(true),
    message_id: messageId,
    changed: z.boolean(),
    view_kind: viewKindSchema,
    engagement_state: engagementStateSchema.optional(),
    visibility_state: visibilityStateSchema,
  })
  .openapi("MutationResponse", {
    description: "Result of inbox ack/hide/unhide mutations",
  });

/** inbox sent list — single item */
export const sentListItemSchema = z.object({
  message_id: messageId,
  conversation_id: conversationId,
  subject: z.string(),
  created_at_ms: timestampMs,
  view_kind: z.literal("sent"),
  visibility_state: visibilityStateSchema,
});

/** inbox sent list */
export const sentListResponseSchema = z
  .object({
    ok: z.literal(true),
    items: z.array(sentListItemSchema),
    limit: z.number().int().positive(),
    returned_count: z.number().int().nonnegative(),
  })
  .openapi("SentListResponse", {
    description: "Result of GET /api/sent — sent message summaries",
  });

/** inbox sent read */
export const sentReadResponseSchema = z
  .object({
    ok: z.literal(true),
    message: messageContentSchema,
    state: sentStateSchema,
  })
  .openapi("SentReadResponse", {
    description: "Result of GET /api/sent/{messageId} — full sent message",
  });

/** inbox sent hide / unhide */
export const sentMutationResponseSchema = z
  .object({
    ok: z.literal(true),
    message_id: messageId,
    changed: z.boolean(),
    view_kind: z.literal("sent"),
    visibility_state: visibilityStateSchema,
  })
  .openapi("SentMutationResponse", {
    description: "Result of sent hide/unhide mutations",
  });

/** inbox thread — single item */
export const threadItemSchema = z.object({
  message_id: messageId,
  parent_message_id: messageId.nullable(),
  sender: addressStr,
  subject: z.string(),
  created_at_ms: timestampMs,
  view_kind: viewKindSchema,
  engagement_state: engagementStateSchema.optional(),
  visibility_state: visibilityStateSchema,
  effective_role: recipientRoleSchema.optional(),
  body_preview: z.string().optional(),
  body: z.string().optional(),
  references: z.array(threadReferenceSchema).optional(),
});

/** inbox thread */
export const threadResponseSchema = z
  .object({
    ok: z.literal(true),
    conversation_id: conversationId,
    items: z.array(threadItemSchema),
    limit: z.number().int().positive(),
    returned_count: z.number().int().nonnegative(),
    truncated: z.boolean(),
    total_visible_count: z.number().int().nonnegative(),
  })
  .openapi("ThreadResponse", {
    description: "Result of GET /api/thread/{conversationId}",
  });

/** inbox directory list */
export const directoryListResponseSchema = z
  .object({
    ok: z.literal(true),
    items: z.array(addressSummarySchema),
    returned_count: z.number().int().nonnegative(),
  })
  .openapi("DirectoryListResponse", {
    description: "Result of GET /api/directory",
  });

/** inbox directory show */
export const directoryShowResponseSchema = z
  .object({
    ok: z.literal(true),
    address: addressSummarySchema,
  })
  .openapi("DirectoryShowResponse", {
    description: "Result of GET /api/directory/{address}",
  });

/** inbox directory members */
export const directoryMembersResponseSchema = z
  .object({
    ok: z.literal(true),
    group: addressStr,
    members: z.array(addressStr),
  })
  .openapi("DirectoryMembersResponse", {
    description: "Result of GET /api/directory/{address}/members — list members of a group address",
  });

/** inbox give-feedback */
export const giveFeedbackResponseSchema = z.object({
  ok: z.literal(true),
  feedback_id: feedbackId,
  feature: z.string(),
  recorded: z.boolean(),
});

// ---------------------------------------------------------------------------
// Experiments (feature flag / A/B test discovery board)
// ---------------------------------------------------------------------------

export const experimentStatusSchema = z.enum([
  "active",
  "paused",
  "completed",
]);

export const experimentVariantSchema = z.object({
  name: z.string().min(1),
  weight: z.number().int().min(0).max(100),
});

export const experimentSchema = z.object({
  id: prefixedId("exp"),
  name: z.string().min(1),
  description: z.string(),
  status: experimentStatusSchema,
  variants: z.array(experimentVariantSchema).min(2),
  start_ts: timestampMs,
  end_ts: timestampMs.nullable(),
  metrics: z
    .object({
      messages_sent: z.number().int().nonnegative(),
      response_rate: z.number().min(0).max(1),
    })
    .optional(),
});

export const experimentListResponseSchema = z.object({
  items: z.array(experimentSchema),
  returned_count: z.number().int().nonnegative(),
});

// ---------------------------------------------------------------------------
// Feedback board (user feedback entries with sentiment)
// ---------------------------------------------------------------------------

export const feedbackSentimentSchema = z.enum([
  "positive",
  "neutral",
  "negative",
]);

export const feedbackEntrySchema = z.object({
  id: feedbackId,
  from_address: addressStr,
  subject: z.string().optional(),
  text: z.string(),
  sentiment: feedbackSentimentSchema,
  rating: z.number().int().min(1).max(5).optional(),
  created_ts: timestampMs,
  message_id: messageId.optional(),
});

export const feedbackBoardResponseSchema = z.object({
  items: z.array(feedbackEntrySchema),
  returned_count: z.number().int().nonnegative(),
  summary: z.object({
    positive_count: z.number().int().nonnegative(),
    neutral_count: z.number().int().nonnegative(),
    negative_count: z.number().int().nonnegative(),
    average_rating: z.number().min(0).max(5).nullable(),
  }),
});

// ---------------------------------------------------------------------------
// Delivery events (event inspector for debugging)
// ---------------------------------------------------------------------------

export const deliveryEventTypeSchema = z.enum([
  "delivered",
  "read",
  "acknowledged",
  "replied",
  "hidden",
  "restored",
  "failed",
]);

export const deliveryEventSchema = z.object({
  id: prefixedId("evt"),
  delivery_id: deliveryId,
  message_id: messageId,
  event_type: deliveryEventTypeSchema,
  actor_address: addressStr,
  from_state: z.string().nullable(),
  to_state: z.string(),
  created_ts: timestampMs,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const deliveryEventListResponseSchema = z
  .object({
    items: z.array(deliveryEventSchema),
    returned_count: z.number().int().nonnegative(),
    filters: z
      .object({
        message_id: z.string().nullable(),
        event_type: deliveryEventTypeSchema.nullable(),
        actor_address: z.string().nullable(),
      })
      .optional(),
  })
  .openapi("DeliveryEventListResponse", {
    description: "Result of GET /api/events — delivery event history",
  });

// ---------------------------------------------------------------------------
// BFF request bodies and query schemas
// ---------------------------------------------------------------------------
//
// These schemas describe the HTTP-layer inputs to the BFF. They were added in
// the OpenAPI endpoint track so that the generated spec has a single source
// of truth for request bodies and query parameters (DA amendments 1 and 2).
//
// The BFF handlers still accept slightly looser inputs in practice (e.g. a
// missing `to` field on /api/send is rejected at runtime with a 400). The
// schemas below describe the *documented* contract — what clients SHOULD
// send — not every permissive edge case the handlers tolerate.

/** Recipient list accepted by /api/send and /api/reply */
export const recipientInputSchema = z.union([
  z.string(),
  z.array(z.string()),
]);

/** POST /api/send request body */
export const sendRequestSchema = z
  .object({
    to: recipientInputSchema,
    cc: recipientInputSchema.optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    urgency: urgencySchema.optional(),
    references: z.array(z.unknown()).optional(),
  })
  .openapi("SendRequest", {
    description:
      "Request body for POST /api/send. `to` and `cc` may be a single comma-separated string or an array of address strings.",
  });

/** POST /api/reply/{messageId} request body */
export const replyRequestSchema = z
  .object({
    body: z.string().optional(),
    subject: z.string().optional(),
    urgency: urgencySchema.optional(),
    to: recipientInputSchema.optional(),
    cc: recipientInputSchema.optional(),
    all: z.boolean().optional(),
    references: z.array(z.unknown()).optional(),
  })
  .openapi("ReplyRequest", {
    description:
      "Request body for POST /api/reply/{messageId}. When `all` is true, original To/Cc recipients are included automatically.",
  });

/** Query params for GET /api/inbox */
export const inboxQuerySchema = z
  .object({
    limit: z.string().optional(),
    state: z.enum(["any", "unread", "read", "acknowledged"]).optional(),
    visibility: z.enum(["any", "active", "hidden"]).optional(),
    since_ms: z.string().optional(),
    until_ms: z.string().optional(),
  })
  .openapi("InboxListQuery", {
    description: "Query parameters for GET /api/inbox",
  });

/** Query params for GET /api/inbox/{messageId} */
export const inboxReadQuerySchema = z
  .object({
    peek: z.enum(["0", "1", "true", "false"]).optional(),
  })
  .openapi("InboxReadQuery", {
    description:
      "Query parameters for GET /api/inbox/{messageId}. peek=1 avoids marking the message as read.",
  });

/** Query params for GET /api/sent */
export const sentQuerySchema = z
  .object({
    limit: z.string().optional(),
    visibility: z.enum(["any", "active", "hidden"]).optional(),
    since_ms: z.string().optional(),
    until_ms: z.string().optional(),
  })
  .openapi("SentListQuery", {
    description: "Query parameters for GET /api/sent",
  });

/** Query params for GET /api/thread/{conversationId} */
export const threadQuerySchema = z
  .object({
    limit: z.string().optional(),
    full: z.enum(["0", "1", "true", "false"]).optional(),
  })
  .openapi("ThreadQuery", {
    description:
      "Query parameters for GET /api/thread/{conversationId}. full=1 returns the complete body and references per item.",
  });

/** Query params for GET /api/directory */
export const directoryQuerySchema = z
  .object({
    kind: addressKindSchema.optional(),
    listed: z.enum(["0", "1", "true", "false"]).optional(),
  })
  .openapi("DirectoryListQuery", {
    description: "Query parameters for GET /api/directory",
  });

/** Query params for GET /api/events */
export const eventsQuerySchema = z
  .object({
    message_id: z.string().optional(),
    event_type: deliveryEventTypeSchema.optional(),
    limit: z.string().optional(),
  })
  .openapi("EventsQuery", {
    description: "Query parameters for GET /api/events",
  });

// ---------------------------------------------------------------------------
// Analytics overview (workflow dashboard)
// ---------------------------------------------------------------------------
//
// Server-side aggregation for the WorkflowDashboardScreen. Replaces the
// UI's prior client-side aggregation over /api/inbox + /api/sent with a
// single DB-backed query. Windows are relative to the server clock at
// request time.

export const analyticsTimeWindowSchema = z.enum([
  "day",
  "week",
  "month",
  "all",
]);

export const analyticsTopEntrySchema = z
  .object({
    address: addressStr,
    count: z.number().int().nonnegative(),
  })
  .openapi("AnalyticsTopEntry", {
    description:
      "A single top-N entry in the analytics overview: an address and its associated message count.",
  });

export const analyticsOverviewResponseSchema = z
  .object({
    window: analyticsTimeWindowSchema,
    window_start_ts: timestampMs,
    window_end_ts: timestampMs,
    inbox_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Messages received in window"),
    sent_count: z
      .number()
      .int()
      .nonnegative()
      .describe("Messages sent in window"),
    response_rate: z
      .number()
      .min(0)
      .max(1)
      .describe(
        "Fraction of inbox messages that got a reply from the user"
      ),
    active_conversations: z
      .number()
      .int()
      .nonnegative()
      .describe("Unique conversation_ids with activity in window"),
    top_senders: z
      .array(analyticsTopEntrySchema)
      .describe("Top addresses that sent TO this user"),
    top_recipients: z
      .array(analyticsTopEntrySchema)
      .describe("Top addresses this user sent TO"),
  })
  .openapi("AnalyticsOverviewResponse", {
    description:
      "Message volume, engagement, and relationship metrics for a time window",
  });

export const analyticsOverviewQuerySchema = z
  .object({
    window: analyticsTimeWindowSchema.default("week"),
  })
  .openapi("AnalyticsOverviewQuery", {
    description:
      "Query parameters for GET /api/analytics/overview. `window` defaults to `week` when omitted.",
  });

// ---------------------------------------------------------------------------
// Shared HTTP error response schema (DA amendment 3)
// ---------------------------------------------------------------------------
//
// Distinct from `errorEnvelopeSchema` (which is the CLI/BFF success=false
// envelope with an `ok: false` discriminator). `errorResponseSchema` is the
// flat HTTP-oriented error shape referenced by every OpenAPI operation's
// 4xx/5xx responses. In practice the BFF returns the fuller envelope; this
// schema advertises the minimum any client must handle.

export const errorResponseSchema = z
  .object({
    error: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi("ErrorResponse", {
    description:
      "Standard HTTP error response. The BFF currently returns the richer `ErrorEnvelope` shape, which is a superset; clients should handle both.",
  });
