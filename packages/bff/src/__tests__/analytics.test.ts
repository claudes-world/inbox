import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import db from "../db.js";

/**
 * Seed the test database with a small network of addresses and messages:
 *
 *   - alice@test  (acting address for most tests)
 *   - bob@test    (sends 2 msgs TO alice)
 *   - carol@test  (sends 1 msg TO alice)
 *   - dave@test   (alice sends 2 msgs TO dave)
 *
 * Messages:
 *   msg_recv_1 — bob -> alice, inside window    (alice replies via msg_reply_1)
 *   msg_recv_2 — bob -> alice, inside window    (no reply)
 *   msg_recv_3 — carol -> alice, inside window  (no reply)
 *   msg_old_1  — bob -> alice, 60 days ago      (outside day/week/month window)
 *   msg_sent_1 — alice -> dave, inside window
 *   msg_sent_2 — alice -> dave, inside window
 *   msg_reply_1 — alice -> bob, inside window, parent=msg_recv_1
 *
 * So for the `week` window:
 *   inbox_count = 3, sent_count = 3 (msg_sent_1, msg_sent_2, msg_reply_1),
 *   response_rate = 1/3, active_conversations = 3 (cnv_a, cnv_b, cnv_c),
 *   top_senders = [bob(2), carol(1)], top_recipients = [dave(2), bob(1)].
 */
function seedTestData() {
  const now = Date.now();
  const longAgo = now - 60 * 24 * 60 * 60 * 1000; // 60 days ago

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

  const insertAddr = db.prepare(
    `INSERT INTO addresses (id, local_part, host, kind, display_name, description, is_active, is_listed, classification, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, 'agent', ?, 'test', 1, 1, 'internal', ?, ?)`
  );
  insertAddr.run("addr_alice", "alice", "test", "Alice", now, now);
  insertAddr.run("addr_bob", "bob", "test", "Bob", now, now);
  insertAddr.run("addr_carol", "carol", "test", "Carol", now, now);
  insertAddr.run("addr_dave", "dave", "test", "Dave", now, now);
  insertAddr.run("addr_eve", "eve", "test", "Eve", now, now);

  const insertConv = db.prepare(
    "INSERT INTO conversations (id, created_at_ms) VALUES (?, ?)"
  );
  insertConv.run("cnv_a", now);
  insertConv.run("cnv_b", now);
  insertConv.run("cnv_c", now);
  insertConv.run("cnv_old", longAgo);

  const insertMsg = db.prepare(
    `INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, 'normal', ?)`
  );
  const insertPub = db.prepare(
    `INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)
     VALUES (?, ?, ?, 'to', 1, ?)`
  );
  const insertDelivery = db.prepare(
    `INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)
     VALUES (?, ?, ?, 'to', 'unread', 'active', ?)`
  );
  const insertSent = db.prepare(
    "INSERT INTO sent_items (message_id, visibility_state) VALUES (?, 'active')"
  );

  // msg_recv_1: bob -> alice, inside window (alice replies)
  insertMsg.run("msg_recv_1", "cnv_a", null, "addr_bob", "Hello 1", "body", now - 1000);
  insertPub.run("mpr_recv_1", "msg_recv_1", "addr_alice", now - 1000);
  insertDelivery.run("dly_recv_1", "msg_recv_1", "addr_alice", now - 1000);
  insertSent.run("msg_recv_1");

  // msg_recv_2: bob -> alice, inside window (no reply)
  insertMsg.run("msg_recv_2", "cnv_b", null, "addr_bob", "Hello 2", "body", now - 2000);
  insertPub.run("mpr_recv_2", "msg_recv_2", "addr_alice", now - 2000);
  insertDelivery.run("dly_recv_2", "msg_recv_2", "addr_alice", now - 2000);
  insertSent.run("msg_recv_2");

  // msg_recv_3: carol -> alice, inside window (no reply)
  insertMsg.run("msg_recv_3", "cnv_c", null, "addr_carol", "Hello 3", "body", now - 3000);
  insertPub.run("mpr_recv_3", "msg_recv_3", "addr_alice", now - 3000);
  insertDelivery.run("dly_recv_3", "msg_recv_3", "addr_alice", now - 3000);
  insertSent.run("msg_recv_3");

  // msg_old_1: bob -> alice, 60 days ago — outside day/week/month windows
  insertMsg.run("msg_old_1", "cnv_old", null, "addr_bob", "Old", "body", longAgo);
  insertPub.run("mpr_old_1", "msg_old_1", "addr_alice", longAgo);
  insertDelivery.run("dly_old_1", "msg_old_1", "addr_alice", longAgo);
  insertSent.run("msg_old_1");

  // msg_sent_1: alice -> dave, inside window
  insertMsg.run("msg_sent_1", "cnv_a", null, "addr_alice", "To Dave 1", "body", now - 500);
  insertPub.run("mpr_sent_1", "msg_sent_1", "addr_dave", now - 500);
  insertDelivery.run("dly_sent_1", "msg_sent_1", "addr_dave", now - 500);
  insertSent.run("msg_sent_1");

  // msg_sent_2: alice -> dave, inside window
  insertMsg.run("msg_sent_2", "cnv_b", null, "addr_alice", "To Dave 2", "body", now - 400);
  insertPub.run("mpr_sent_2", "msg_sent_2", "addr_dave", now - 400);
  insertDelivery.run("dly_sent_2", "msg_sent_2", "addr_dave", now - 400);
  insertSent.run("msg_sent_2");

  // msg_reply_1: alice -> bob, reply to msg_recv_1
  insertMsg.run(
    "msg_reply_1",
    "cnv_a",
    "msg_recv_1",
    "addr_alice",
    "Re: Hello 1",
    "reply body",
    now - 100
  );
  insertPub.run("mpr_reply_1", "msg_reply_1", "addr_bob", now - 100);
  insertDelivery.run("dly_reply_1", "msg_reply_1", "addr_bob", now - 100);
  insertSent.run("msg_reply_1");
}

const ALICE = { "X-Inbox-Address": "alice@test" };

describe("GET /api/analytics/overview", () => {
  beforeEach(() => {
    seedTestData();
  });

  it("returns 400 without X-Inbox-Address header", async () => {
    const res = await app.request("/api/analytics/overview");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("invalid_argument");
  });

  it("returns 400 for invalid window value", async () => {
    const res = await app.request("/api/analytics/overview?window=bogus", {
      headers: ALICE,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("invalid_argument");
    expect(body.error.target).toBe("window");
  });

  it("defaults to the week window when none specified", async () => {
    const res = await app.request("/api/analytics/overview", {
      headers: ALICE,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.window).toBe("week");
    // Week window should start roughly 7 days before now.
    const delta = body.window_end_ts - body.window_start_ts;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(delta - weekMs)).toBeLessThan(5000);
  });

  it("computes inbox_count and sent_count for the week window", async () => {
    const res = await app.request("/api/analytics/overview?window=week", {
      headers: ALICE,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // 3 recent received messages (msg_old_1 is 60d old, excluded)
    expect(body.inbox_count).toBe(3);
    // 3 sent messages: msg_sent_1, msg_sent_2, msg_reply_1
    expect(body.sent_count).toBe(3);
  });

  it("includes the 60-day-old message when window=all", async () => {
    const res = await app.request("/api/analytics/overview?window=all", {
      headers: ALICE,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.window).toBe("all");
    expect(body.window_start_ts).toBe(0);
    expect(body.inbox_count).toBe(4); // includes msg_old_1
  });

  it("computes response_rate from replies chained via parent_message_id", async () => {
    const res = await app.request("/api/analytics/overview?window=week", {
      headers: ALICE,
    });
    const body = await res.json();
    // 1 of 3 received messages has a reply from alice
    expect(body.response_rate).toBeCloseTo(1 / 3, 5);
  });

  it("reports response_rate=0 when the actor has no received messages in window", async () => {
    // eve has no deliveries at all in the seed, so every metric is zero.
    const res = await app.request("/api/analytics/overview?window=day", {
      headers: { "X-Inbox-Address": "eve@test" },
    });
    const body = await res.json();
    expect(body.inbox_count).toBe(0);
    expect(body.sent_count).toBe(0);
    expect(body.response_rate).toBe(0);
    expect(body.active_conversations).toBe(0);
    expect(body.top_senders).toEqual([]);
    expect(body.top_recipients).toEqual([]);
  });

  it("counts active conversations touched by the actor", async () => {
    const res = await app.request("/api/analytics/overview?window=week", {
      headers: ALICE,
    });
    const body = await res.json();
    // cnv_a, cnv_b, cnv_c — cnv_old is outside the window
    expect(body.active_conversations).toBe(3);
  });

  it("populates top_senders ordered by count descending", async () => {
    const res = await app.request("/api/analytics/overview?window=week", {
      headers: ALICE,
    });
    const body = await res.json();
    expect(body.top_senders).toEqual([
      { address: "bob@test", count: 2 },
      { address: "carol@test", count: 1 },
    ]);
  });

  it("populates top_recipients ordered by count descending", async () => {
    const res = await app.request("/api/analytics/overview?window=week", {
      headers: ALICE,
    });
    const body = await res.json();
    expect(body.top_recipients).toEqual([
      { address: "dave@test", count: 2 },
      { address: "bob@test", count: 1 },
    ]);
  });
});
