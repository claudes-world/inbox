/**
 * Adapter parity tests — validate BFF responses against @inbox/contracts Zod schemas.
 *
 * Seed an in-memory SQLite DB, call endpoints via app.request(), parse
 * through the corresponding schema (.parse() throws on mismatch).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import db from "../db.js";
import {
  listResponseSchema,
  readResponseSchema,
  sendResponseSchema,
  sentListResponseSchema,
  sentReadResponseSchema,
  threadResponseSchema,
  directoryListResponseSchema,
  directoryShowResponseSchema,
} from "@inbox/contracts";

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

interface SeedResult {
  alice: string; bob: string; carol: string; dave: string;
  msg1: string; msg2: string; cnv1: string; cnv2: string;
}

function seedParityData(): SeedResult {
  db.pragma("foreign_keys = OFF");
  db.exec(`DELETE FROM delivery_events; DELETE FROM delivery_sources;
    DELETE FROM deliveries; DELETE FROM sent_items; DELETE FROM message_references;
    DELETE FROM message_public_recipients; DELETE FROM message_private_recipients;
    DELETE FROM messages; DELETE FROM conversations; DELETE FROM group_members;
    DELETE FROM addresses;`);
  db.pragma("foreign_keys = ON");

  const ts = 1_775_754_000_000;
  const ins = db.prepare(
    `INSERT INTO addresses (id,local_part,host,kind,display_name,description,is_active,is_listed,classification,created_at_ms,updated_at_ms)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  ins.run("addr_pa","alice","pt","agent","Alice PM","PM agent",1,1,"internal",ts,ts);
  ins.run("addr_pb","bob","pt","agent","Bob Eng","Eng agent",1,1,"internal",ts,ts);
  ins.run("addr_pc","carol","pt","human","Carol CEO",null,1,1,"internal",ts,ts);
  ins.run("addr_pd","dave","pt","service","Dave Bot","CI bot",1,0,"external",ts,ts);

  const ts2 = ts + 60_000, ts3 = ts + 120_000;
  // Conversation 1: alice -> bob
  db.prepare("INSERT INTO conversations (id,created_at_ms) VALUES (?,?)").run("cnv_p01",ts);
  db.prepare(
    `INSERT INTO messages (id,conversation_id,parent_message_id,sender_address_id,subject,body,sender_urgency,created_at_ms)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run("msg_p01","cnv_p01",null,"addr_pa","Status update needed","Please send your weekly status report.",  "normal",ts2);
  db.prepare(
    `INSERT INTO message_public_recipients (id,message_id,recipient_address_id,recipient_role,ordinal,created_at_ms)
     VALUES (?,?,?,?,?,?)`).run("mpr_p01","msg_p01","addr_pb","to",1,ts2);
  db.prepare(
    `INSERT INTO deliveries (id,message_id,recipient_address_id,effective_role,engagement_state,visibility_state,delivered_at_ms)
     VALUES (?,?,?,?,?,?,?)`).run("dly_p01","msg_p01","addr_pb","to","unread","active",ts2);
  db.prepare("INSERT INTO delivery_sources (delivery_id,source_address_id,source_role,source_kind) VALUES (?,?,?,?)").run("dly_p01","addr_pb","to","direct");
  db.prepare(
    `INSERT INTO delivery_events (id,delivery_id,event_type,change_kind,actor_address_id,event_at_ms,engagement_state_after,visibility_state_after)
     VALUES (?,?,?,?,?,?,?,?)`).run("evt_p01","dly_p01","delivered","delivered",null,ts2,"unread","active");
  db.prepare("INSERT INTO sent_items (message_id,visibility_state) VALUES (?,?)").run("msg_p01","active");

  // Conversation 2: carol -> alice
  db.prepare("INSERT INTO conversations (id,created_at_ms) VALUES (?,?)").run("cnv_p02",ts3);
  db.prepare(
    `INSERT INTO messages (id,conversation_id,parent_message_id,sender_address_id,subject,body,sender_urgency,created_at_ms)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run("msg_p02","cnv_p02",null,"addr_pc","Board meeting prep","Schedule the board meeting.","high",ts3);
  db.prepare(
    `INSERT INTO message_public_recipients (id,message_id,recipient_address_id,recipient_role,ordinal,created_at_ms)
     VALUES (?,?,?,?,?,?)`).run("mpr_p02","msg_p02","addr_pa","to",1,ts3);
  db.prepare(
    `INSERT INTO deliveries (id,message_id,recipient_address_id,effective_role,engagement_state,visibility_state,delivered_at_ms)
     VALUES (?,?,?,?,?,?,?)`).run("dly_p02","msg_p02","addr_pa","to","unread","active",ts3);
  db.prepare("INSERT INTO delivery_sources (delivery_id,source_address_id,source_role,source_kind) VALUES (?,?,?,?)").run("dly_p02","addr_pa","to","direct");
  db.prepare(
    `INSERT INTO delivery_events (id,delivery_id,event_type,change_kind,actor_address_id,event_at_ms,engagement_state_after,visibility_state_after)
     VALUES (?,?,?,?,?,?,?,?)`).run("evt_p02","dly_p02","delivered","delivered",null,ts3,"unread","active");
  db.prepare("INSERT INTO sent_items (message_id,visibility_state) VALUES (?,?)").run("msg_p02","active");

  return {
    alice: "alice@pt", bob: "bob@pt", carol: "carol@pt", dave: "dave@pt",
    msg1: "msg_p01", msg2: "msg_p02", cnv1: "cnv_p01", cnv2: "cnv_p02",
  };
}

/** Helper: POST JSON to a route */
function postJson(path: string, addr: string, body: object) {
  return app.request(path, {
    method: "POST",
    headers: { "X-Inbox-Address": addr, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Adapter parity — BFF vs contract schemas", () => {
  let s: SeedResult;
  beforeEach(() => { s = seedParityData(); });

  // -- GET /api/inbox → listResponseSchema ----------------------------------
  describe("GET /api/inbox (ListResponse)", () => {
    it("schema-validates and returned_count matches items.length", async () => {
      const res = await app.request("/api/inbox", { headers: { "X-Inbox-Address": s.bob } });
      expect(res.status).toBe(200);
      const body = listResponseSchema.parse(await res.json());
      expect(body.returned_count).toBe(body.items.length);
    });

    it("items sorted DESC by delivered_at_ms", async () => {
      const body = listResponseSchema.parse(
        await (await app.request("/api/inbox", { headers: { "X-Inbox-Address": s.alice } })).json());
      for (let i = 1; i < body.items.length; i++)
        expect(body.items[i - 1].delivered_at_ms).toBeGreaterThanOrEqual(body.items[i].delivered_at_ms);
    });

    it("engagement_state, visibility_state, view_kind enums valid", async () => {
      const body = listResponseSchema.parse(
        await (await app.request("/api/inbox", { headers: { "X-Inbox-Address": s.bob } })).json());
      for (const it of body.items) {
        expect(["unread", "read", "acknowledged"]).toContain(it.engagement_state);
        expect(["active", "hidden"]).toContain(it.visibility_state);
        expect(it.view_kind).toBe("received");
      }
    });

    it("ID prefixes and timestamp format correct", async () => {
      const body = listResponseSchema.parse(
        await (await app.request("/api/inbox", { headers: { "X-Inbox-Address": s.bob } })).json());
      for (const it of body.items) {
        expect(it.delivery_id).toMatch(/^dly_/);
        expect(it.message_id).toMatch(/^msg_/);
        expect(it.conversation_id).toMatch(/^cnv_/);
        expect(Number.isInteger(it.delivered_at_ms)).toBe(true);
        expect(it.delivered_at_ms).toBeGreaterThan(1e12);
      }
    });
  });

  // -- GET /api/inbox/:id → readResponseSchema ------------------------------
  describe("GET /api/inbox/:messageId (ReadResponse)", () => {
    it("schema-validates with all required fields", async () => {
      const res = await app.request(`/api/inbox/${s.msg1}?peek=1`, { headers: { "X-Inbox-Address": s.bob } });
      expect(res.status).toBe(200);
      const body = readResponseSchema.parse(await res.json());
      expect(body.message.message_id).toBe(s.msg1);
      expect(body.message.conversation_id).toBe(s.cnv1);
      expect(body.message.sender).toBe(s.alice);
      expect(typeof body.message.body).toBe("string");
      expect(Array.isArray(body.message.public_to)).toBe(true);
      expect(Array.isArray(body.message.public_cc)).toBe(true);
      expect(Array.isArray(body.message.references)).toBe(true);
    });

    it("state has delivery_id prefix and correct enums", async () => {
      const body = readResponseSchema.parse(
        await (await app.request(`/api/inbox/${s.msg1}?peek=1`, { headers: { "X-Inbox-Address": s.bob } })).json());
      expect(body.state.delivery_id).toMatch(/^dly_/);
      expect(body.state.view_kind).toBe("received");
      expect(["unread", "read", "acknowledged"]).toContain(body.state.engagement_state);
      expect(["to", "cc", "bcc"]).toContain(body.state.effective_role);
    });

    it("history is an array", async () => {
      const body = readResponseSchema.parse(
        await (await app.request(`/api/inbox/${s.msg1}?peek=1`, { headers: { "X-Inbox-Address": s.bob } })).json());
      expect(Array.isArray(body.history)).toBe(true);
    });
  });

  // -- POST /api/send → sendResponseSchema ----------------------------------
  describe("POST /api/send (SendResponse)", () => {
    it("schema-validates with typed ID prefixes", async () => {
      const res = await postJson("/api/send", s.alice, { to: s.bob, subject: "Test", body: "Test" });
      expect(res.status).toBe(200);
      const body = sendResponseSchema.parse(await res.json());
      expect(body.message_id).toMatch(/^msg_/);
      expect(body.conversation_id).toMatch(/^cnv_/);
    });

    it("resolution_summary fields are non-negative integers", async () => {
      const body = sendResponseSchema.parse(
        await (await postJson("/api/send", s.alice, { to: s.bob, subject: "T", body: "T" })).json());
      const rs = body.resolution_summary;
      for (const v of [rs.logical_recipient_count, rs.resolved_recipient_count,
                        rs.skipped_inactive_member_count, rs.deduped_recipient_count]) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });

    it("sender matches acting address", async () => {
      const body = sendResponseSchema.parse(
        await (await postJson("/api/send", s.carol, { to: s.alice, subject: "T", body: "T" })).json());
      expect(body.sender).toBe(s.carol);
    });
  });

  // -- GET /api/sent → sentListResponseSchema -------------------------------
  describe("GET /api/sent (SentListResponse)", () => {
    it("schema-validates and returned_count matches items.length", async () => {
      const res = await app.request("/api/sent", { headers: { "X-Inbox-Address": s.alice } });
      expect(res.status).toBe(200);
      const body = sentListResponseSchema.parse(await res.json());
      expect(body.returned_count).toBe(body.items.length);
    });

    it("all items have view_kind=sent and valid timestamps", async () => {
      const body = sentListResponseSchema.parse(
        await (await app.request("/api/sent", { headers: { "X-Inbox-Address": s.alice } })).json());
      for (const it of body.items) {
        expect(it.view_kind).toBe("sent");
        expect(Number.isInteger(it.created_at_ms)).toBe(true);
        expect(it.created_at_ms).toBeGreaterThan(1e12);
      }
    });
  });

  // -- GET /api/thread/:id → threadResponseSchema ---------------------------
  describe("GET /api/thread/:conversationId (ThreadResponse)", () => {
    it("schema-validates and conversation_id matches param", async () => {
      const res = await app.request(`/api/thread/${s.cnv1}`, { headers: { "X-Inbox-Address": s.bob } });
      expect(res.status).toBe(200);
      const body = threadResponseSchema.parse(await res.json());
      expect(body.conversation_id).toBe(s.cnv1);
    });

    it("items in chronological order after reply", async () => {
      await postJson(`/api/reply/${s.msg1}`, s.bob, { body: "Status update attached." });
      const body = threadResponseSchema.parse(
        await (await app.request(`/api/thread/${s.cnv1}`, { headers: { "X-Inbox-Address": s.bob } })).json());
      expect(body.items.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < body.items.length; i++)
        expect(body.items[i].created_at_ms).toBeGreaterThanOrEqual(body.items[i - 1].created_at_ms);
    });

    it("returned_count and total_visible_count consistent when not truncated", async () => {
      const body = threadResponseSchema.parse(
        await (await app.request(`/api/thread/${s.cnv1}`, { headers: { "X-Inbox-Address": s.bob } })).json());
      expect(body.returned_count).toBe(body.items.length);
      if (!body.truncated) expect(body.total_visible_count).toBe(body.returned_count);
    });
  });

  // -- GET /api/directory → directoryListResponseSchema ---------------------
  describe("GET /api/directory (DirectoryListResponse)", () => {
    it("schema-validates and returned_count matches items.length", async () => {
      const res = await app.request("/api/directory");
      expect(res.status).toBe(200);
      const body = directoryListResponseSchema.parse(await res.json());
      expect(body.returned_count).toBe(body.items.length);
    });

    it("all seeded listed addresses present with valid enums", async () => {
      const body = directoryListResponseSchema.parse(
        await (await app.request("/api/directory")).json());
      const addrs = body.items.map((i) => i.address);
      expect(addrs).toContain(s.alice);
      expect(addrs).toContain(s.bob);
      expect(addrs).toContain(s.carol);
      for (const it of body.items)
        expect(["agent", "human", "service", "list"]).toContain(it.kind);
    });

    it("is_active and is_listed are booleans (including unlisted)", async () => {
      const body = directoryListResponseSchema.parse(
        await (await app.request("/api/directory?listed=0")).json());
      for (const it of body.items) {
        expect(typeof it.is_active).toBe("boolean");
        expect(typeof it.is_listed).toBe("boolean");
      }
    });
  });

  // -- GET /api/directory/:address → directoryShowResponseSchema ------------
  describe("GET /api/directory/:address (DirectoryShowResponse)", () => {
    it("schema-validates and address matches param", async () => {
      const res = await app.request(`/api/directory/${s.alice}`);
      expect(res.status).toBe(200);
      const body = directoryShowResponseSchema.parse(await res.json());
      expect(body.address.address).toBe(s.alice);
    });
  });

  // -- Cross-endpoint coherence ---------------------------------------------
  describe("Cross-endpoint schema coherence", () => {
    it("send → inbox list → read → sent list → sent read all schema-valid", async () => {
      const sendBody = sendResponseSchema.parse(
        await (await postJson("/api/send", s.bob, { to: s.alice, subject: "XC", body: "Cross-check." })).json());

      const listBody = listResponseSchema.parse(
        await (await app.request("/api/inbox", { headers: { "X-Inbox-Address": s.alice } })).json());
      expect(listBody.items.find((i) => i.message_id === sendBody.message_id)).toBeDefined();

      const readBody = readResponseSchema.parse(
        await (await app.request(`/api/inbox/${sendBody.message_id}`, { headers: { "X-Inbox-Address": s.alice } })).json());
      expect(readBody.message.message_id).toBe(sendBody.message_id);

      const sentBody = sentListResponseSchema.parse(
        await (await app.request("/api/sent", { headers: { "X-Inbox-Address": s.bob } })).json());
      expect(sentBody.items.find((i) => i.message_id === sendBody.message_id)).toBeDefined();

      const srBody = sentReadResponseSchema.parse(
        await (await app.request(`/api/sent/${sendBody.message_id}`, { headers: { "X-Inbox-Address": s.bob } })).json());
      expect(srBody.message.message_id).toBe(sendBody.message_id);
      expect(srBody.state.view_kind).toBe("sent");
    });
  });
});
