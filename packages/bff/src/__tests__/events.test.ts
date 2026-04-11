import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import db from "../db.js";
import { deliveryEventListResponseSchema } from "@inbox/contracts";

/**
 * Seed DB with two addresses, a message from bob -> alice, one delivery,
 * and a series of delivery_events (delivered + read + ack). A second
 * delivery-less recipient (carol) lets us prove the scoping filter.
 */
function seedTestData() {
  const ts = Date.now();
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
  insertAddr.run("addr_alice", "alice", "test", "Alice", ts, ts);
  insertAddr.run("addr_bob", "bob", "test", "Bob", ts, ts);
  insertAddr.run("addr_carol", "carol", "test", "Carol", ts, ts);

  db.prepare("INSERT INTO conversations (id, created_at_ms) VALUES (?, ?)").run("cnv_evt_001", ts);

  db.prepare(
    `INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
     VALUES ('msg_evt_001', 'cnv_evt_001', NULL, 'addr_bob', 'Events test', 'body', 'normal', ?)`
  ).run(ts);

  db.prepare(
    `INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)
     VALUES ('mpr_evt_001', 'msg_evt_001', 'addr_alice', 'to', 1, ?)`
  ).run(ts);

  db.prepare(
    `INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)
     VALUES ('dly_evt_001', 'msg_evt_001', 'addr_alice', 'to', 'acknowledged', 'active', ?)`
  ).run(ts);

  db.prepare(
    `INSERT INTO delivery_sources (delivery_id, source_address_id, source_role, source_kind)
     VALUES ('dly_evt_001', 'addr_alice', 'to', 'direct')`
  ).run();

  // Seed three events: delivered (NULL actor), read (alice), ack (alice).
  const insertEvent = db.prepare(
    `INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after, metadata_json)
     VALUES (?, 'dly_evt_001', ?, ?, ?, ?, ?, 'active', ?)`
  );
  insertEvent.run("evt_delivered", "delivered", "delivered", null, ts, "unread", null);
  insertEvent.run("evt_read", "state_changed", "read", "addr_alice", ts + 1000, "read", '{"source":"ui"}');
  insertEvent.run("evt_ack", "state_changed", "ack", "addr_alice", ts + 2000, "acknowledged", null);
}

const ALICE = { "X-Inbox-Address": "alice@test" };
const BOB = { "X-Inbox-Address": "bob@test" };
const CAROL = { "X-Inbox-Address": "carol@test" };

describe("GET /api/events", () => {
  beforeEach(() => {
    seedTestData();
  });

  it("returns empty list when actor has no deliveries", async () => {
    const res = await app.request("/api/events", { headers: CAROL });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.returned_count).toBe(0);
    expect(body.filters.actor_address).toBe("carol@test");
  });

  it("returns events scoped to the acting address's own deliveries", async () => {
    const res = await app.request("/api/events", { headers: ALICE });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.returned_count).toBe(3);
    expect(body.items.map((e: { id: string }) => e.id).sort()).toEqual([
      "evt_ack", "evt_delivered", "evt_read",
    ]);
    // bob is the sender but has no deliveries, so sees nothing.
    const bobRes = await app.request("/api/events", { headers: BOB });
    const bobBody = await bobRes.json();
    expect(bobBody.returned_count).toBe(0);
  });

  it("resolves actor_address: JOINed address for state_changed rows, fallback for delivered", async () => {
    const res = await app.request("/api/events", { headers: ALICE });
    const body = await res.json();
    const byId = Object.fromEntries(
      body.items.map((e: { id: string; actor_address: string }) => [e.id, e.actor_address])
    );
    expect(byId["evt_read"]).toBe("alice@test");
    expect(byId["evt_ack"]).toBe("alice@test");
    // delivered has NULL actor_address_id in DB -> falls back to acting address
    expect(byId["evt_delivered"]).toBe("alice@test");
  });

  it("maps change_kind to contract event_type", async () => {
    const res = await app.request("/api/events", { headers: ALICE });
    const body = await res.json();
    const types = Object.fromEntries(
      body.items.map((e: { id: string; event_type: string }) => [e.id, e.event_type])
    );
    expect(types["evt_delivered"]).toBe("delivered");
    expect(types["evt_read"]).toBe("read");
    expect(types["evt_ack"]).toBe("acknowledged"); // ack -> acknowledged
  });

  it("derives from_state from the previous event in delivery history", async () => {
    const res = await app.request("/api/events", { headers: ALICE });
    const body = await res.json();
    const byId = Object.fromEntries(
      body.items.map((e: { id: string; from_state: string | null; to_state: string }) => [
        e.id, { from: e.from_state, to: e.to_state },
      ])
    );
    expect(byId["evt_delivered"]).toEqual({ from: null, to: "unread" });
    expect(byId["evt_read"]).toEqual({ from: "unread", to: "read" });
    expect(byId["evt_ack"]).toEqual({ from: "read", to: "acknowledged" });
  });

  it("parses metadata_json into an object (and omits it when null)", async () => {
    const res = await app.request("/api/events", { headers: ALICE });
    const body = await res.json();
    const read = body.items.find((e: { id: string }) => e.id === "evt_read");
    const ack = body.items.find((e: { id: string }) => e.id === "evt_ack");
    expect(read.metadata).toEqual({ source: "ui" });
    expect(ack.metadata).toBeUndefined();
  });

  it("filters by message_id query param", async () => {
    const hitRes = await app.request("/api/events?message_id=msg_evt_001", { headers: ALICE });
    expect((await hitRes.json()).returned_count).toBe(3);
    const missRes = await app.request("/api/events?message_id=msg_does_not_exist", { headers: ALICE });
    const missBody = await missRes.json();
    expect(missBody.returned_count).toBe(0);
    expect(missBody.filters.message_id).toBe("msg_does_not_exist");
  });

  it("filters by event_type query param (mapped to change_kind)", async () => {
    const res = await app.request("/api/events?event_type=read", { headers: ALICE });
    const body = await res.json();
    expect(body.returned_count).toBe(1);
    expect(body.items[0].id).toBe("evt_read");
    expect(body.filters.event_type).toBe("read");

    // `acknowledged` should translate to DB change_kind = 'ack'.
    const ackRes = await app.request("/api/events?event_type=acknowledged", { headers: ALICE });
    const ackBody = await ackRes.json();
    expect(ackBody.returned_count).toBe(1);
    expect(ackBody.items[0].id).toBe("evt_ack");
  });

  it("unknown/unsupported event_type filters return empty (not 400)", async () => {
    // Unknown enum value -> empty with filter nulled out.
    const unknown = await app.request("/api/events?event_type=teleported", { headers: ALICE });
    expect(unknown.status).toBe(200);
    const unknownBody = await unknown.json();
    expect(unknownBody.returned_count).toBe(0);
    expect(unknownBody.filters.event_type).toBeNull();

    // Known contract value with no DB source -> empty but filter preserved.
    const replied = await app.request("/api/events?event_type=replied", { headers: ALICE });
    expect(replied.status).toBe(200);
    const repliedBody = await replied.json();
    expect(repliedBody.returned_count).toBe(0);
    expect(repliedBody.filters.event_type).toBe("replied");
  });

  it("respects limit parameter and caps at 500", async () => {
    const one = await app.request("/api/events?limit=1", { headers: ALICE });
    expect((await one.json()).returned_count).toBe(1);
    // Over-cap values still succeed; the hard cap is 500, the test just
    // verifies the route doesn't reject or crash on large limits.
    const big = await app.request("/api/events?limit=9999", { headers: ALICE });
    expect(big.status).toBe(200);
    expect((await big.json()).returned_count).toBe(3);
  });

  it("returns error without acting address header", async () => {
    const res = await app.request("/api/events");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("invalid_argument");
  });

  it("response validates against deliveryEventListResponseSchema", async () => {
    const res = await app.request("/api/events", { headers: ALICE });
    const body = await res.json();
    const parsed = deliveryEventListResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);
  });
});
