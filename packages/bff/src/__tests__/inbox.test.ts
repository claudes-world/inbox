import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import db from "../db.js";

/**
 * Seed the test database with addresses and a message for inbox testing.
 */
function seedTestData() {
  const ts = Date.now();

  // Create addresses
  // Disable FK checks during cleanup to avoid ordering issues
  db.pragma("foreign_keys = OFF");
  db.exec(`
    DELETE FROM delivery_events;
    DELETE FROM delivery_sources;
    DELETE FROM deliveries;
    DELETE FROM sent_items;
    DELETE FROM message_references;
    DELETE FROM message_public_recipients;
    DELETE FROM message_private_recipients;
    DELETE FROM messages;
    DELETE FROM conversations;
    DELETE FROM group_members;
    DELETE FROM addresses;
  `);
  db.pragma("foreign_keys = ON");

  db.prepare(
    `INSERT INTO addresses (id, local_part, host, kind, display_name, description, is_active, is_listed, classification, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "addr_alice",
    "alice",
    "test",
    "agent",
    "Alice Agent",
    "Test agent",
    1,
    1,
    "internal",
    ts,
    ts
  );

  db.prepare(
    `INSERT INTO addresses (id, local_part, host, kind, display_name, description, is_active, is_listed, classification, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "addr_bob",
    "bob",
    "test",
    "agent",
    "Bob Agent",
    "Another test agent",
    1,
    1,
    "internal",
    ts,
    ts
  );

  // Create a conversation + message + delivery (bob sent to alice)
  db.prepare(
    "INSERT INTO conversations (id, created_at_ms) VALUES (?, ?)"
  ).run("cnv_test_001", ts);

  db.prepare(
    `INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "msg_test_001",
    "cnv_test_001",
    null,
    "addr_bob",
    "Test subject",
    "Hello Alice, this is a test message body.",
    "normal",
    ts
  );

  // Public recipients
  db.prepare(
    `INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run("mpr_test_001", "msg_test_001", "addr_alice", "to", 1, ts);

  // Delivery to alice
  db.prepare(
    `INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "dly_test_001",
    "msg_test_001",
    "addr_alice",
    "to",
    "unread",
    "active",
    ts
  );

  db.prepare(
    `INSERT INTO delivery_sources (delivery_id, source_address_id, source_role, source_kind)
     VALUES (?, ?, ?, ?)`
  ).run("dly_test_001", "addr_alice", "to", "direct");

  db.prepare(
    `INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "evt_test_001",
    "dly_test_001",
    "delivered",
    "delivered",
    null,
    ts,
    "unread",
    "active"
  );

  // Sent item for bob
  db.prepare(
    "INSERT INTO sent_items (message_id, visibility_state) VALUES (?, ?)"
  ).run("msg_test_001", "active");
}

describe("Inbox routes", () => {
  beforeEach(() => {
    seedTestData();
  });

  describe("GET /api/inbox (list)", () => {
    it("returns inbox items for the acting address", async () => {
      const res = await app.request("/api/inbox", {
        headers: { "X-Inbox-Address": "alice@test" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.returned_count).toBe(1);
      expect(body.limit).toBe(50);
      expect(body.items).toHaveLength(1);

      const item = body.items[0];
      expect(item.message_id).toBe("msg_test_001");
      expect(item.conversation_id).toBe("cnv_test_001");
      expect(item.sender).toBe("bob@test");
      expect(item.subject).toBe("Test subject");
      expect(item.view_kind).toBe("received");
      expect(item.engagement_state).toBe("unread");
      expect(item.visibility_state).toBe("active");
      expect(item.effective_role).toBe("to");
      expect(item.delivery_id).toBe("dly_test_001");
      expect(item.body_preview).toBeTruthy();
    });

    it("returns empty list for address with no messages", async () => {
      const res = await app.request("/api/inbox", {
        headers: { "X-Inbox-Address": "bob@test" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.returned_count).toBe(0);
      expect(body.items).toHaveLength(0);
    });

    it("returns error without acting address", async () => {
      const res = await app.request("/api/inbox");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("invalid_argument");
    });

    it("returns 404 for unknown address", async () => {
      const res = await app.request("/api/inbox", {
        headers: { "X-Inbox-Address": "unknown@test" },
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("not_found");
    });

    it("filters by engagement state", async () => {
      const res = await app.request("/api/inbox?state=read", {
        headers: { "X-Inbox-Address": "alice@test" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      // The message is unread, so filtering by read should return 0
      expect(body.returned_count).toBe(0);
    });

    it("respects limit parameter", async () => {
      const res = await app.request("/api/inbox?limit=1", {
        headers: { "X-Inbox-Address": "alice@test" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.limit).toBe(1);
    });
  });

  describe("GET /api/inbox/:messageId (read)", () => {
    it("reads a message and marks it as read", async () => {
      const res = await app.request("/api/inbox/msg_test_001", {
        headers: { "X-Inbox-Address": "alice@test" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.message.message_id).toBe("msg_test_001");
      expect(body.message.sender).toBe("bob@test");
      expect(body.message.subject).toBe("Test subject");
      expect(body.message.body).toBe(
        "Hello Alice, this is a test message body."
      );
      expect(body.message.public_to).toEqual(["alice@test"]);
      expect(body.message.references).toEqual([]);
      expect(body.state.view_kind).toBe("received");
      expect(body.state.engagement_state).toBe("read");
      expect(body.state.delivery_id).toBe("dly_test_001");
    });

    it("peek mode does not mark as read", async () => {
      const res = await app.request("/api/inbox/msg_test_001?peek=1", {
        headers: { "X-Inbox-Address": "alice@test" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      // Peek should keep it unread
      expect(body.state.engagement_state).toBe("unread");
    });

    it("returns 404 for message not in inbox", async () => {
      const res = await app.request("/api/inbox/msg_test_001", {
        headers: { "X-Inbox-Address": "bob@test" },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/inbox/:messageId/ack", () => {
    it("acknowledges a message", async () => {
      const res = await app.request("/api/inbox/msg_test_001/ack", {
        method: "POST",
        headers: { "X-Inbox-Address": "alice@test" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.message_id).toBe("msg_test_001");
      expect(body.changed).toBe(true);
      expect(body.engagement_state).toBe("acknowledged");
    });

    it("ack is idempotent", async () => {
      // First ack
      await app.request("/api/inbox/msg_test_001/ack", {
        method: "POST",
        headers: { "X-Inbox-Address": "alice@test" },
      });
      // Second ack — should be no-op
      const res = await app.request("/api/inbox/msg_test_001/ack", {
        method: "POST",
        headers: { "X-Inbox-Address": "alice@test" },
      });
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.changed).toBe(false);
      expect(body.engagement_state).toBe("acknowledged");
    });
  });

  describe("POST /api/inbox/:messageId/hide + unhide", () => {
    it("hides and unhides a message", async () => {
      // Hide
      const hideRes = await app.request("/api/inbox/msg_test_001/hide", {
        method: "POST",
        headers: { "X-Inbox-Address": "alice@test" },
      });
      expect(hideRes.status).toBe(200);
      const hideBody = await hideRes.json();
      expect(hideBody.ok).toBe(true);
      expect(hideBody.changed).toBe(true);
      expect(hideBody.visibility_state).toBe("hidden");

      // Unhide
      const unhideRes = await app.request("/api/inbox/msg_test_001/unhide", {
        method: "POST",
        headers: { "X-Inbox-Address": "alice@test" },
      });
      expect(unhideRes.status).toBe(200);
      const unhideBody = await unhideRes.json();
      expect(unhideBody.ok).toBe(true);
      expect(unhideBody.changed).toBe(true);
      expect(unhideBody.visibility_state).toBe("active");
    });

    it("hide is idempotent", async () => {
      await app.request("/api/inbox/msg_test_001/hide", {
        method: "POST",
        headers: { "X-Inbox-Address": "alice@test" },
      });
      const res = await app.request("/api/inbox/msg_test_001/hide", {
        method: "POST",
        headers: { "X-Inbox-Address": "alice@test" },
      });
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.changed).toBe(false);
    });
  });
});
