/**
 * Frozen enums from the Inbox MVP spec.
 * These match the CHECK constraints in schema.sql and the integration-seams contracts.
 */

/** Address kind — determines routing and membership eligibility */
export const AddressKind = {
  Agent: "agent",
  Human: "human",
  Service: "service",
  List: "list",
} as const;
export type AddressKind = (typeof AddressKind)[keyof typeof AddressKind];

/** Recipient role on public headers */
export const RecipientRole = {
  To: "to",
  Cc: "cc",
} as const;
export type RecipientRole = (typeof RecipientRole)[keyof typeof RecipientRole];

/** Private recipient role (reserved for future BCC) */
export const PrivateRecipientRole = {
  Bcc: "bcc",
} as const;
export type PrivateRecipientRole =
  (typeof PrivateRecipientRole)[keyof typeof PrivateRecipientRole];

/** Effective role on a delivery — union of public + private */
export const EffectiveRole = {
  To: "to",
  Cc: "cc",
  Bcc: "bcc",
} as const;
export type EffectiveRole = (typeof EffectiveRole)[keyof typeof EffectiveRole];

/** Engagement state on a delivery */
export const EngagementState = {
  Unread: "unread",
  Read: "read",
  Acknowledged: "acknowledged",
} as const;
export type EngagementState =
  (typeof EngagementState)[keyof typeof EngagementState];

/** Visibility state on a delivery or sent item */
export const VisibilityState = {
  Active: "active",
  Hidden: "hidden",
} as const;
export type VisibilityState =
  (typeof VisibilityState)[keyof typeof VisibilityState];

/** View kind — distinguishes inbox from sent surfaces */
export const ViewKind = {
  Received: "received",
  Sent: "sent",
} as const;
export type ViewKind = (typeof ViewKind)[keyof typeof ViewKind];

/** Sender-declared urgency */
export const Urgency = {
  Low: "low",
  Normal: "normal",
  High: "high",
  Urgent: "urgent",
} as const;
export type Urgency = (typeof Urgency)[keyof typeof Urgency];

/** Reference kind for typed message references */
export const RefKind = {
  Path: "path",
  Url: "url",
  Json: "json",
  Text: "text",
  ArtifactId: "artifact_id",
  Other: "other",
} as const;
export type RefKind = (typeof RefKind)[keyof typeof RefKind];

/** Frozen error codes from Contract A (integration-seams.md) */
export const ErrorCode = {
  NotFound: "not_found",
  InvalidArgument: "invalid_argument",
  InvalidState: "invalid_state",
  PermissionDenied: "permission_denied",
  InternalError: "internal_error",
  ComingSoon: "coming_soon",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** CLI exit codes from Contract H (integration-seams.md) */
export const ExitCode = {
  Success: 0,
  InvalidArgument: 1,
  NotFound: 2,
  InvalidState: 3,
  PermissionDenied: 4,
  InternalError: 5,
  ComingSoon: 6,
} as const;
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/** Map from ErrorCode to ExitCode */
export const errorToExit: Record<ErrorCode, ExitCode> = {
  [ErrorCode.NotFound]: ExitCode.NotFound,
  [ErrorCode.InvalidArgument]: ExitCode.InvalidArgument,
  [ErrorCode.InvalidState]: ExitCode.InvalidState,
  [ErrorCode.PermissionDenied]: ExitCode.PermissionDenied,
  [ErrorCode.InternalError]: ExitCode.InternalError,
  [ErrorCode.ComingSoon]: ExitCode.ComingSoon,
};

/** Delivery event types */
export const DeliveryEventType = {
  Delivered: "delivered",
  StateChanged: "state_changed",
} as const;
export type DeliveryEventType =
  (typeof DeliveryEventType)[keyof typeof DeliveryEventType];

/** Change kind for delivery events */
export const ChangeKind = {
  Delivered: "delivered",
  Read: "read",
  Ack: "ack",
  Hide: "hide",
  Unhide: "unhide",
} as const;
export type ChangeKind = (typeof ChangeKind)[keyof typeof ChangeKind];

/** Delivery source kind */
export const SourceKind = {
  Direct: "direct",
  List: "list",
} as const;
export type SourceKind = (typeof SourceKind)[keyof typeof SourceKind];

/** Address classification (user-defined, no CHECK constraint) */
export const Classification = {
  Internal: "internal",
  External: "external",
} as const;
export type Classification =
  (typeof Classification)[keyof typeof Classification];
