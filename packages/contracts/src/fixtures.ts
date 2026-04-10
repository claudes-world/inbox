/**
 * Test fixtures for Inbox contracts.
 *
 * Each fixture is a valid instance of its corresponding schema.
 * Used by contract tests and as seed data for BFF/UI development.
 */
import type {
  AddressSummary,
  ComingSoonError,
  DirectoryListResponse,
  DirectoryMembersResponse,
  DirectoryShowResponse,
  ErrorEnvelope,
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
  },
};

export const invalidArgumentError: ErrorEnvelope = {
  ok: false,
  error: {
    code: "invalid_argument",
    message: "ID must start with msg_",
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
