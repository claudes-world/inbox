/**
 * TypeScript types inferred from Zod schemas.
 *
 * Consumers that only need types (no runtime validation) can import from here
 * without pulling in Zod as a runtime dependency.
 */
import type { z } from "zod";
import type {
  addressSummarySchema,
  comingSoonErrorSchema,
  deliveryEventListResponseSchema,
  deliveryEventSchema,
  deliveryEventTypeSchema,
  deliveryStateSchema,
  directoryListResponseSchema,
  directoryMembersResponseSchema,
  directoryShowResponseSchema,
  errorDetailSchema,
  errorEnvelopeSchema,
  experimentListResponseSchema,
  experimentSchema,
  experimentStatusSchema,
  experimentVariantSchema,
  feedbackBoardResponseSchema,
  feedbackEntrySchema,
  feedbackSentimentSchema,
  giveFeedbackResponseSchema,
  listItemSchema,
  listResponseSchema,
  messageContentSchema,
  mutationResponseSchema,
  readResponseSchema,
  referenceSchema,
  replyResponseSchema,
  threadReferenceSchema,
  resolutionSummarySchema,
  sendResponseSchema,
  sentListItemSchema,
  sentListResponseSchema,
  sentMutationResponseSchema,
  sentReadResponseSchema,
  sentStateSchema,
  threadItemSchema,
  threadResponseSchema,
  whoamiResponseSchema,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------

export type AddressSummary = z.infer<typeof addressSummarySchema>;
export type DeliveryState = z.infer<typeof deliveryStateSchema>;
export type SentState = z.infer<typeof sentStateSchema>;
export type Reference = z.infer<typeof referenceSchema>;
export type ThreadReference = z.infer<typeof threadReferenceSchema>;
export type ResolutionSummary = z.infer<typeof resolutionSummarySchema>;

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type ComingSoonError = z.infer<typeof comingSoonErrorSchema>;

// ---------------------------------------------------------------------------
// Command response types
// ---------------------------------------------------------------------------

export type WhoamiResponse = z.infer<typeof whoamiResponseSchema>;
export type SendResponse = z.infer<typeof sendResponseSchema>;
export type ListItem = z.infer<typeof listItemSchema>;
export type ListResponse = z.infer<typeof listResponseSchema>;
export type MessageContent = z.infer<typeof messageContentSchema>;
export type ReadResponse = z.infer<typeof readResponseSchema>;
export type ReplyResponse = z.infer<typeof replyResponseSchema>;
export type MutationResponse = z.infer<typeof mutationResponseSchema>;
export type SentListItem = z.infer<typeof sentListItemSchema>;
export type SentListResponse = z.infer<typeof sentListResponseSchema>;
export type SentReadResponse = z.infer<typeof sentReadResponseSchema>;
export type SentMutationResponse = z.infer<typeof sentMutationResponseSchema>;
export type ThreadItem = z.infer<typeof threadItemSchema>;
export type ThreadResponse = z.infer<typeof threadResponseSchema>;
export type DirectoryListResponse = z.infer<
  typeof directoryListResponseSchema
>;
export type DirectoryShowResponse = z.infer<
  typeof directoryShowResponseSchema
>;
export type DirectoryMembersResponse = z.infer<
  typeof directoryMembersResponseSchema
>;
export type GiveFeedbackResponse = z.infer<typeof giveFeedbackResponseSchema>;

// ---------------------------------------------------------------------------
// Experiments (feature flag / A/B test board)
// ---------------------------------------------------------------------------

export type ExperimentStatus = z.infer<typeof experimentStatusSchema>;
export type ExperimentVariant = z.infer<typeof experimentVariantSchema>;
export type Experiment = z.infer<typeof experimentSchema>;
export type ExperimentListResponse = z.infer<
  typeof experimentListResponseSchema
>;

// ---------------------------------------------------------------------------
// Feedback board
// ---------------------------------------------------------------------------

export type FeedbackSentiment = z.infer<typeof feedbackSentimentSchema>;
export type FeedbackEntry = z.infer<typeof feedbackEntrySchema>;
export type FeedbackBoardResponse = z.infer<typeof feedbackBoardResponseSchema>;

// ---------------------------------------------------------------------------
// Delivery events (event inspector)
// ---------------------------------------------------------------------------

// Note: DeliveryEventType is already exported from enums.ts with different
// values. The inspector-facing event kind is re-named to avoid the collision.
export type DeliveryEventKind = z.infer<typeof deliveryEventTypeSchema>;
export type DeliveryEvent = z.infer<typeof deliveryEventSchema>;
export type DeliveryEventListResponse = z.infer<
  typeof deliveryEventListResponseSchema
>;

// ---------------------------------------------------------------------------
// Discriminated union for all CLI responses
// ---------------------------------------------------------------------------

export type SuccessResponse =
  | WhoamiResponse
  | SendResponse
  | ListResponse
  | ReadResponse
  | ReplyResponse
  | MutationResponse
  | SentListResponse
  | SentReadResponse
  | SentMutationResponse
  | ThreadResponse
  | DirectoryListResponse
  | DirectoryShowResponse
  | DirectoryMembersResponse
  | GiveFeedbackResponse;

export type CliResponse = SuccessResponse | ErrorEnvelope | ComingSoonError;
