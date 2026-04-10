/**
 * Playwright route handlers that mock the BFF API.
 *
 * Uses page.route() to intercept fetch requests in-browser.
 * Response payloads come from @inbox/contracts fixtures.
 */
import type { Page, Route } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixture data (mirroring @inbox/contracts/fixtures)
// We inline these to avoid importing TS from a workspace package at test time.
// ---------------------------------------------------------------------------

const NOW_MS = 1_775_754_070_000;
const EARLIER_MS = NOW_MS - 3_600_000;

const pmAlpha = {
  address: "pm-alpha@vps-1",
  kind: "agent",
  display_name: "Project Manager Alpha",
  description: "Engineering PM agent",
  is_active: true,
  is_listed: true,
  classification: "internal",
};

const engManager = {
  address: "eng-manager@vps-1",
  kind: "agent",
  display_name: "Engineering Manager",
  description: "Eng lead agent",
  is_active: true,
  is_listed: true,
  classification: "internal",
};

const ceo = {
  address: "ceo@org",
  kind: "human",
  display_name: "CEO",
  description: null,
  is_active: true,
  is_listed: true,
  classification: "internal",
};

const engLeadsList = {
  address: "eng-leads@lists",
  kind: "list",
  display_name: "Engineering Leads",
  description: "All engineering leads",
  is_active: true,
  is_listed: true,
  classification: "internal",
};

// ---------------------------------------------------------------------------
// API response bodies
// ---------------------------------------------------------------------------

export const directoryResponse = {
  ok: true,
  items: [pmAlpha, engManager, ceo, engLeadsList],
  returned_count: 4,
};

export const inboxResponse = {
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
    {
      message_id: "msg_list_002",
      conversation_id: "cnv_002",
      sender: "eng-manager@vps-1",
      subject: "Sprint planning notes",
      delivered_at_ms: EARLIER_MS,
      view_kind: "received",
      engagement_state: "read",
      visibility_state: "active",
      effective_role: "cc",
      body_preview: "Here are the notes from today's sprint planning...",
      delivery_id: "dly_002",
    },
  ],
  limit: 50,
  returned_count: 2,
};

export const emptyInboxResponse = {
  ok: true,
  items: [],
  limit: 50,
  returned_count: 0,
};

export const messageReadResponse = {
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

export const sentListResponse = {
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
    {
      message_id: "msg_sent_002",
      conversation_id: "cnv_002",
      subject: "Sprint planning notes",
      created_at_ms: EARLIER_MS,
      view_kind: "sent",
      visibility_state: "active",
    },
  ],
  limit: 50,
  returned_count: 2,
};

export const sentReadResponse = {
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

export const threadResponse = {
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

export const sendResponse = {
  ok: true,
  message_id: "msg_send_001",
  conversation_id: "cnv_001",
  sender: "pm-alpha@vps-1",
  public_to: ["eng-leads@lists"],
  public_cc: [],
  resolved_recipient_count: 4,
  resolution_summary: {
    logical_recipient_count: 1,
    resolved_recipient_count: 4,
    skipped_inactive_member_count: 0,
    deduped_recipient_count: 0,
  },
  sent_item_created: true,
};

// ---------------------------------------------------------------------------
// Route setup
// ---------------------------------------------------------------------------

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * Install standard API mock routes on a Playwright page.
 * Call this in beforeEach or at the start of each test.
 *
 * Returns overrideable route references so individual tests
 * can replace specific endpoints.
 */
export async function mockApi(page: Page) {
  // Use regex routes instead of globs so query strings are matched correctly.

  // Directory — used by useIdentity on every page load
  await page.route(/\/api\/directory/, (route) =>
    json(route, directoryResponse),
  );

  // Inbox message read + mutations (must be registered before the list route
  // so the more-specific pattern gets first crack in Playwright's LIFO order)
  await page.route(/\/api\/inbox\/msg_/, (route) => {
    if (route.request().method() === "GET") {
      return json(route, messageReadResponse);
    }
    // POST mutations (ack, hide, unhide)
    return json(route, {
      ok: true,
      message_id: "msg_read_001",
      changed: true,
      view_kind: "received",
      engagement_state: "acknowledged",
      visibility_state: "active",
    });
  });

  // Inbox list (matches /api/inbox and /api/inbox?visibility=active etc.)
  await page.route(/\/api\/inbox(\?|$)/, (route) => {
    if (route.request().method() === "GET") {
      return json(route, inboxResponse);
    }
    return route.continue();
  });

  // Sent message read + mutations
  await page.route(/\/api\/sent\/msg_/, (route) => {
    if (route.request().method() === "GET") {
      return json(route, sentReadResponse);
    }
    return json(route, {
      ok: true,
      message_id: "msg_sentread_001",
      changed: true,
      view_kind: "sent",
      visibility_state: "hidden",
    });
  });

  // Sent list
  await page.route(/\/api\/sent(\?|$)/, (route) => {
    if (route.request().method() === "GET") {
      return json(route, sentListResponse);
    }
    return route.continue();
  });

  // Thread
  await page.route(/\/api\/thread\//, (route) =>
    json(route, threadResponse),
  );

  // Send
  await page.route(/\/api\/send$/, (route) =>
    json(route, sendResponse),
  );

  // Reply
  await page.route(/\/api\/reply\//, (route) =>
    json(route, {
      ok: true,
      message_id: "msg_reply_001",
      conversation_id: "cnv_001",
      parent_message_id: "msg_read_001",
      sender: "pm-alpha@vps-1",
      resolved_recipient_count: 2,
      resolution_summary: {
        logical_recipient_count: 2,
        resolved_recipient_count: 2,
        skipped_inactive_member_count: 0,
        deduped_recipient_count: 0,
      },
      sent_item_created: true,
    }),
  );
}
