/**
 * Test fixtures for Inbox contracts.
 *
 * Each fixture is a valid instance of its corresponding schema.
 * Used by contract tests and as seed data for BFF/UI development.
 */
import type {
  AddressSummary,
  ComingSoonError,
  DeliveryEvent,
  DeliveryEventListResponse,
  DirectoryListResponse,
  DirectoryMembersResponse,
  DirectoryShowResponse,
  ErrorEnvelope,
  Experiment,
  ExperimentListResponse,
  FeedbackBoardResponse,
  FeedbackEntry,
  GiveFeedbackResponse,
  ListResponse,
  MutationResponse,
  ReadResponse,
  ReplyResponse,
  SendResponse,
  SentListResponse,
  SentMutationResponse,
  SentReadResponse,
  ThreadResponse,
  WhoamiResponse,
} from "./types.js";

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

const NOW_MS = 1_775_754_070_000; // ~2026-04-10
const EARLIER_MS = NOW_MS - 3_600_000; // 1 hour earlier

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export const pmAlpha: AddressSummary = {
  address: "pm-alpha@vps-1",
  kind: "agent",
  display_name: "Project Manager Alpha",
  description: "Engineering PM agent",
  is_active: true,
  is_listed: true,
  classification: "internal",
};

export const engManager: AddressSummary = {
  address: "eng-manager@vps-1",
  kind: "agent",
  display_name: "Engineering Manager",
  description: "Eng lead agent",
  is_active: true,
  is_listed: true,
  classification: "internal",
};

export const ceo: AddressSummary = {
  address: "ceo@org",
  kind: "human",
  display_name: "CEO",
  description: null,
  is_active: true,
  is_listed: true,
  classification: "internal",
};

export const engLeadsList: AddressSummary = {
  address: "eng-leads@lists",
  kind: "list",
  display_name: "Engineering Leads",
  description: "All engineering leads",
  is_active: true,
  is_listed: true,
  classification: "internal",
};

// ---------------------------------------------------------------------------
// Whoami
// ---------------------------------------------------------------------------

export const whoamiFixture: WhoamiResponse = {
  ok: true,
  address: "pm-alpha@vps-1",
  kind: "agent",
  display_name: "Project Manager Alpha",
  is_active: true,
  is_listed: true,
  db_path: "/var/lib/inbox/inbox.db",
};

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export const sendFixture: SendResponse = {
  ok: true,
  message_id: "msg_send_001",
  conversation_id: "cnv_001",
  sender: "pm-alpha@vps-1",
  public_to: ["eng-leads@lists"],
  public_cc: ["ceo@org"],
  resolved_recipient_count: 4,
  resolution_summary: {
    logical_recipient_count: 2,
    resolved_recipient_count: 4,
    skipped_inactive_member_count: 1,
    deduped_recipient_count: 0,
  },
  sent_item_created: true,
};

// ---------------------------------------------------------------------------
// List (inbox)
// ---------------------------------------------------------------------------

export const listFixture: ListResponse = {
  ok: true,
  items: [
    {
      message_id: "msg_list_001",
      conversation_id: "cnv_001",
      sender: "pm-alpha@vps-1",
      subject: "Need engineering status",
      delivered_at_ms: NOW_MS,
      view_kind: "received",
      engagement_state: "unread",
      visibility_state: "active",
      effective_role: "to",
      body_preview: "Please send your weekly report...",
      delivery_id: "dly_001",
    },
  ],
  limit: 50,
  returned_count: 1,
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export const readFixture: ReadResponse = {
  ok: true,
  message: {
    message_id: "msg_read_001",
    conversation_id: "cnv_001",
    parent_message_id: null,
    sender: "pm-alpha@vps-1",
    subject: "Need engineering status",
    body: "Please send your weekly report by 5pm.",
    public_to: ["eng-manager@vps-1"],
    public_cc: ["ceo@org"],
    references: [],
  },
  state: {
    view_kind: "received",
    engagement_state: "read",
    visibility_state: "active",
    effective_role: "to",
    delivery_id: "dly_001",
  },
  history: [],
};

// ---------------------------------------------------------------------------
// Reply
// ---------------------------------------------------------------------------

export const replyFixture: ReplyResponse = {
  ok: true,
  message_id: "msg_reply_001",
  conversation_id: "cnv_001",
  parent_message_id: "msg_read_001",
  sender: "eng-manager@vps-1",
  resolved_recipient_count: 2,
  resolution_summary: {
    logical_recipient_count: 2,
    resolved_recipient_count: 2,
    skipped_inactive_member_count: 0,
    deduped_recipient_count: 0,
  },
  sent_item_created: true,
};

// ---------------------------------------------------------------------------
// Mutation (ack/hide/unhide)
// ---------------------------------------------------------------------------

export const ackFixture: MutationResponse = {
  ok: true,
  message_id: "msg_ack_001",
  changed: true,
  view_kind: "received",
  engagement_state: "acknowledged",
  visibility_state: "active",
};

export const hideFixture: MutationResponse = {
  ok: true,
  message_id: "msg_hide_001",
  changed: true,
  view_kind: "received",
  engagement_state: "read",
  visibility_state: "hidden",
};

// ---------------------------------------------------------------------------
// Sent list
// ---------------------------------------------------------------------------

export const sentListFixture: SentListResponse = {
  ok: true,
  items: [
    {
      message_id: "msg_sent_001",
      conversation_id: "cnv_001",
      subject: "Need engineering status",
      created_at_ms: NOW_MS,
      view_kind: "sent",
      visibility_state: "active",
    },
  ],
  limit: 50,
  returned_count: 1,
};

// ---------------------------------------------------------------------------
// Sent read
// ---------------------------------------------------------------------------

export const sentReadFixture: SentReadResponse = {
  ok: true,
  message: {
    message_id: "msg_sentread_001",
    conversation_id: "cnv_001",
    parent_message_id: null,
    sender: "pm-alpha@vps-1",
    subject: "Need engineering status",
    body: "Please send your weekly report by 5pm.",
    public_to: ["eng-manager@vps-1"],
    public_cc: [],
    references: [],
  },
  state: {
    view_kind: "sent",
    visibility_state: "active",
  },
};

// ---------------------------------------------------------------------------
// Sent mutation (hide/unhide)
// ---------------------------------------------------------------------------

export const sentHideFixture: SentMutationResponse = {
  ok: true,
  message_id: "msg_senthide_001",
  changed: true,
  view_kind: "sent",
  visibility_state: "hidden",
};

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

export const threadFixture: ThreadResponse = {
  ok: true,
  conversation_id: "cnv_001",
  items: [
    {
      message_id: "msg_thread_001",
      parent_message_id: null,
      sender: "pm-alpha@vps-1",
      subject: "Need engineering status",
      created_at_ms: EARLIER_MS,
      view_kind: "received",
      engagement_state: "read",
      visibility_state: "active",
      effective_role: "to",
      body_preview: "Please send your weekly report...",
    },
    {
      message_id: "msg_thread_002",
      parent_message_id: "msg_thread_001",
      sender: "eng-manager@vps-1",
      subject: "Re: Need engineering status",
      created_at_ms: NOW_MS,
      view_kind: "sent",
      visibility_state: "active",
      body_preview: "Status report attached...",
    },
  ],
  limit: 50,
  returned_count: 2,
  truncated: false,
  total_visible_count: 2,
};

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

export const directoryListFixture: DirectoryListResponse = {
  ok: true,
  items: [pmAlpha, engManager, ceo, engLeadsList],
  returned_count: 4,
};

export const directoryShowFixture: DirectoryShowResponse = {
  ok: true,
  address: pmAlpha,
};

export const directoryMembersFixture: DirectoryMembersResponse = {
  ok: true,
  group: "eng-leads@lists",
  members: ["eng-manager@vps-1", "vp-eng@vps-1"],
};

// ---------------------------------------------------------------------------
// Give feedback
// ---------------------------------------------------------------------------

export const giveFeedbackFixture: GiveFeedbackResponse = {
  ok: true,
  feedback_id: "fbk_001",
  feature: "search",
  recorded: true,
};

// ---------------------------------------------------------------------------
// Error fixtures
// ---------------------------------------------------------------------------

export const notFoundError: ErrorEnvelope = {
  ok: false,
  error: {
    code: "not_found",
    message: "Message not found",
    target: null,
    details: null,
  },
};

export const invalidArgumentError: ErrorEnvelope = {
  ok: false,
  error: {
    code: "invalid_argument",
    message: "ID must start with msg_",
    target: null,
    details: null,
  },
};

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

export const experimentActive: Experiment = {
  id: "exp_subject_tone_001",
  name: "Subject line tone experiment",
  description:
    "Compare friendly vs formal subject phrasings for high-urgency messages.",
  status: "active",
  variants: [
    { name: "friendly", weight: 50 },
    { name: "formal", weight: 50 },
  ],
  start_ts: EARLIER_MS,
  end_ts: null,
  metrics: {
    messages_sent: 142,
    response_rate: 0.61,
  },
};

export const experimentCompleted: Experiment = {
  id: "exp_cta_placement_042",
  name: "CTA placement",
  description: "Measure reply rate when CTA is top vs bottom of body.",
  status: "completed",
  variants: [
    { name: "top", weight: 50 },
    { name: "bottom", weight: 50 },
  ],
  start_ts: EARLIER_MS - 86_400_000,
  end_ts: NOW_MS - 86_400_000,
  metrics: {
    messages_sent: 500,
    response_rate: 0.42,
  },
};

export const experimentListFixture: ExperimentListResponse = {
  items: [experimentActive, experimentCompleted],
  returned_count: 2,
};

// ---------------------------------------------------------------------------
// Feedback board
// ---------------------------------------------------------------------------

export const feedbackPositive: FeedbackEntry = {
  id: "fbk_pos_001",
  from_address: "eng-manager@vps-1",
  subject: "Love the new thread view",
  text: "Collapsing replies really helps when triaging long threads. Thanks!",
  sentiment: "positive",
  rating: 5,
  created_ts: NOW_MS,
  message_id: "msg_thread_001",
};

export const feedbackNegative: FeedbackEntry = {
  id: "fbk_neg_002",
  from_address: "ceo@org",
  text: "Search is still missing. I can't find anything older than a week.",
  sentiment: "negative",
  rating: 2,
  created_ts: EARLIER_MS,
};

export const feedbackBoardFixture: FeedbackBoardResponse = {
  items: [feedbackPositive, feedbackNegative],
  returned_count: 2,
  summary: {
    positive_count: 1,
    neutral_count: 0,
    negative_count: 1,
    average_rating: 3.5,
  },
};

// ---------------------------------------------------------------------------
// Delivery events (inspector)
// ---------------------------------------------------------------------------

export const deliveryEventDelivered: DeliveryEvent = {
  id: "evt_001",
  delivery_id: "dly_001",
  message_id: "msg_thread_001",
  event_type: "delivered",
  actor_address: "pm-alpha@vps-1",
  from_state: null,
  to_state: "unread",
  created_ts: EARLIER_MS,
};

export const deliveryEventRead: DeliveryEvent = {
  id: "evt_002",
  delivery_id: "dly_001",
  message_id: "msg_thread_001",
  event_type: "read",
  actor_address: "eng-manager@vps-1",
  from_state: "unread",
  to_state: "read",
  created_ts: EARLIER_MS + 60_000,
  metadata: { source: "ui", client: "cpc-web" },
};

export const deliveryEventAcknowledged: DeliveryEvent = {
  id: "evt_003",
  delivery_id: "dly_001",
  message_id: "msg_thread_001",
  event_type: "acknowledged",
  actor_address: "eng-manager@vps-1",
  from_state: "read",
  to_state: "acknowledged",
  created_ts: NOW_MS,
};

export const deliveryEventListFixture: DeliveryEventListResponse = {
  items: [deliveryEventDelivered, deliveryEventRead, deliveryEventAcknowledged],
  returned_count: 3,
  filters: {
    message_id: "msg_thread_001",
    event_type: null,
    actor_address: null,
  },
};

export const comingSoonError: ComingSoonError = {
  ok: false,
  experimental: true,
  error: {
    code: "coming_soon",
    message: "feature coming soon",
    details: {
      feature: "search",
      feedback_command:
        'inbox give-feedback --feature search --kind verb --wanted "full-text search"',
    },
  },
};
