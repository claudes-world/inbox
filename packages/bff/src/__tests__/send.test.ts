import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import db from "../db.js";

/**
 * Seed the test database with addresses for send testing.
 */
function seedTestData() {
  const ts = Date.now();

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

  // Alice (agent)
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

  // Bob (agent)
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

  // Carol (inactive)
  db.prepare(
    `INSERT INTO addresses (id, local_part, host, kind, display_name, description, is_active, is_listed, classification, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "addr_carol",
    "carol",
    "test",
    "agent",
    "Carol Agent",
    "Inactive agent",
    0,
    1,
    "internal",
    ts,
    ts
  );
}

describe("Send routes", () => {
  beforeEach(() => {
    seedTestData();
  });

  describe("POST /api/send", () => {
    it("sends a message to a single recipient", async () => {
      const res = await app.request("/api/send", {
        method: "POST",
        headers: {
          "X-Inbox-Address": "alice@test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: "bob@test",
          subject: "Hello Bob",
          body: "This is a test message from Alice.",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.message_id).toMatch(/^msg_/);
      expect(body.conversation_id).toMatch(/^cnv_/);
      expect(body.sender).toBe("alice@test");
      expect(body.public_to).toEqual(["bob@test"]);
      expect(body.public_cc).toEqual([]);
      expect(body.resolved_recipient_count).toBe(1);
      expect(body.sent_item_created).toBe(true);
      expect(body.resolution_summary.logical_recipient_count).toBe(1);
      expect(body.resolution_summary.resolved_recipient_count).toBe(1);
      expect(body.resolution_summary.skipped_inactive_member_count).toBe(0);
      expect(body.resolution_summary.deduped_recipient_count).toBe(0);

      // Verify the message appears in bob's inbox
      const listRes = await app.request("/api/inbox", {
        headers: { "X-Inbox-Address": "bob@test" },
      });
      const listBody = await listRes.json();
      expect(listBody.ok).toBe(true);
      expect(listBody.returned_count).toBe(1);
      expect(listBody.items[0].message_id).toBe(body.message_id);
      expect(listBody.items[0].sender).toBe("alice@test");
    });

    it("sends with multiple recipients (to + cc)", async () => {
      const res = await app.request("/api/send", {
        method: "POST",
        headers: {
          "X-Inbox-Address": "alice@test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: ["bob@test"],
          cc: [],
          subject: "Multi-recipient test",
          body: "Test body",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.resolved_recipient_count).toBe(1);
    });

    it("rejects send without to recipient", async () => {
      const res = await app.request("/api/send", {
        method: "POST",
        headers: {
          "X-Inbox-Address": "alice@test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: "No recipient",
          body: "This should fail",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("invalid_argument");
    });

    it("rejects send to unknown address", async () => {
      const res = await app.request("/api/send", {
        method: "POST",
        headers: {
          "X-Inbox-Address": "alice@test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: "nobody@nowhere",
          subject: "Test",
          body: "Test",
        }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("invalid_argument");
    });

    it("rejects send to inactive address", async () => {
      const res = await app.request("/api/send", {
        method: "POST",
        headers: {
          "X-Inbox-Address": "alice@test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: "carol@test",
          subject: "Test",
          body: "Test",
        }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("invalid_state");
    });

    it("also creates a sent item visible in /api/sent", async () => {
      // Send a message
      const sendRes = await app.request("/api/send", {
        method: "POST",
        headers: {
          "X-Inbox-Address": "alice@test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: "bob@test",
          subject: "Sent item test",
          body: "Check the sent folder",
        }),
      });
      const sendBody = await sendRes.json();
      expect(sendBody.ok).toBe(true);

      // Check alice's sent list
      const sentRes = await app.request("/api/sent", {
        headers: { "X-Inbox-Address": "alice@test" },
      });
      const sentBody = await sentRes.json();
      expect(sentBody.ok).toBe(true);
      expect(sentBody.returned_count).toBe(1);
      expect(sentBody.items[0].message_id).toBe(sendBody.message_id);
    });
  });

  describe("POST /api/reply/:messageId", () => {
    it("replies to a message", async () => {
      // First send a message from alice to bob
      const sendRes = await app.request("/api/send", {
        method: "POST",
        headers: {
          "X-Inbox-Address": "alice@test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: "bob@test",
          subject: "Original message",
          body: "Please reply to this.",
        }),
      });
      const sendBody = await sendRes.json();
      const originalMsgId = sendBody.message_id;

      // Bob replies
      const replyRes = await app.request(`/api/reply/${originalMsgId}`, {
        method: "POST",
        headers: {
          "X-Inbox-Address": "bob@test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: "Here is my reply.",
        }),
      });
      expect(replyRes.status).toBe(200);
      const replyBody = await replyRes.json();
      expect(replyBody.ok).toBe(true);
      expect(replyBody.message_id).toMatch(/^msg_/);
      expect(replyBody.conversation_id).toBe(sendBody.conversation_id);
      expect(replyBody.parent_message_id).toBe(originalMsgId);
      expect(replyBody.sender).toBe("bob@test");
      expect(replyBody.resolved_recipient_count).toBeGreaterThanOrEqual(1);
      expect(replyBody.sent_item_created).toBe(true);
    });

    it("returns 404 when replying to a message not visible to actor", async () => {
      const res = await app.request("/api/reply/msg_nonexistent", {
        method: "POST",
        headers: {
          "X-Inbox-Address": "alice@test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: "Reply to nothing" }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("not_found");
    });
  });
});
