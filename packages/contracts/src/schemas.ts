/**
 * Zod schemas for Inbox JSON contracts.
 *
 * These schemas encode the frozen response shapes from json-contracts.md
 * and the field names from Contract G (integration-seams.md).
 */
import { z } from "zod";

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
export const addressSummarySchema = z.object({
  address: addressStr,
  kind: addressKindSchema,
  display_name: z.string().nullable(),
  description: z.string().nullable(),
  is_active: z.boolean(),
  is_listed: z.boolean(),
  classification: z.string().nullable(),
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

export const errorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: errorDetailSchema,
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
export const sendResponseSchema = z.object({
  ok: z.literal(true),
  message_id: messageId,
  conversation_id: conversationId,
  sender: addressStr,
  public_to: z.array(addressStr),
  public_cc: z.array(addressStr),
  resolved_recipient_count: z.number().int().positive(),
  resolution_summary: resolutionSummarySchema,
  sent_item_created: z.boolean(),
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
export const listResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(listItemSchema),
  limit: z.number().int().positive(),
  returned_count: z.number().int().nonnegative(),
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
export const readResponseSchema = z.object({
  ok: z.literal(true),
  message: messageContentSchema,
  state: deliveryStateSchema.extend({
    delivery_id: deliveryId,
  }),
  history: z.array(z.unknown()),
});

/** inbox reply */
export const replyResponseSchema = z.object({
  ok: z.literal(true),
  message_id: messageId,
  conversation_id: conversationId,
  parent_message_id: messageId,
  sender: addressStr,
  resolved_recipient_count: z.number().int().positive(),
  resolution_summary: resolutionSummarySchema,
  sent_item_created: z.boolean(),
});

/** inbox ack / hide / unhide — mutation result */
export const mutationResponseSchema = z.object({
  ok: z.literal(true),
  message_id: messageId,
  changed: z.boolean(),
  view_kind: viewKindSchema,
  engagement_state: engagementStateSchema.optional(),
  visibility_state: visibilityStateSchema,
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
export const sentListResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(sentListItemSchema),
  limit: z.number().int().positive(),
  returned_count: z.number().int().nonnegative(),
});

/** inbox sent read */
export const sentReadResponseSchema = z.object({
  ok: z.literal(true),
  message: messageContentSchema,
  state: sentStateSchema,
});

/** inbox sent hide / unhide */
export const sentMutationResponseSchema = z.object({
  ok: z.literal(true),
  message_id: messageId,
  changed: z.boolean(),
  view_kind: z.literal("sent"),
  visibility_state: visibilityStateSchema,
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
export const threadResponseSchema = z.object({
  ok: z.literal(true),
  conversation_id: conversationId,
  items: z.array(threadItemSchema),
  limit: z.number().int().positive(),
  returned_count: z.number().int().nonnegative(),
  truncated: z.boolean(),
  total_visible_count: z.number().int().nonnegative(),
});

/** inbox directory list */
export const directoryListResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(addressSummarySchema),
  returned_count: z.number().int().nonnegative(),
});

/** inbox directory show */
export const directoryShowResponseSchema = z.object({
  ok: z.literal(true),
  address: addressSummarySchema,
});

/** inbox directory members */
export const directoryMembersResponseSchema = z.object({
  ok: z.literal(true),
  group: addressStr,
  members: z.array(addressStr),
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

export const deliveryEventListResponseSchema = z.object({
  items: z.array(deliveryEventSchema),
  returned_count: z.number().int().nonnegative(),
  filters: z
    .object({
      message_id: z.string().nullable(),
      event_type: deliveryEventTypeSchema.nullable(),
      actor_address: z.string().nullable(),
    })
    .optional(),
});
