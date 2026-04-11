/**
 * Coverage fill for routes/sent.ts.
 *
 * PR #129 coverage baseline flagged sent.ts at 47.3% line coverage.
 * These tests target the uncovered branches identified by the coverage tool:
 * - visibility filter validation + hidden/any paths
 * - since_ms/until_ms time window filters
 * - GET /:messageId 404 + parent redaction branches
 * - message_references serialization (valid + malformed metadata_json)
 * - POST /:messageId/hide + /unhide (success, idempotent no-op, 404)
 *
 * The handlers never check sender_address_id for the parent lookup on a
 * message whose row is missing after the sent_items JOIN already matched it
 * (reply.ts line 59-63 analogue), so the "msg row missing after sent_item
 * match" branch (sent.ts 144-148) is defensive and not targeted here —
 * it would require corrupting the DB between queries.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../app.js";
import db from "../db.js";

function resetDb() {
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
}

function insertAddress(
  id: string,
  localPart: string,
  opts: { kind?: string; isActive?: number } = {}
) {
  const ts = Date.now();
  db.prepare(
    `INSERT INTO addresses (id, local_part, host, kind, display_name, description, is_active, is_listed, classification, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    localPart,
    "test",
    opts.kind ?? "agent",
    `${localPart} Agent`,
    "seeded",
    opts.isActive ?? 1,
    1,
    "internal",
    ts,
    ts
  );
}

function seedBasic() {
  resetDb();
  insertAddress("addr_alice", "alice");
  insertAddress("addr_bob", "bob");
}

/**
 * Send a message via the API so we exercise the real executeSend path and
 * get a valid sent_item + deliveries to operate on.
 */
async function sendMessage(from: string, to: string, subject = "S", body = "B") {
  const res = await app.request("/api/send", {
    method: "POST",
    headers: {
      "X-Inbox-Address": from,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, subject, body }),
  });
  const json = (await res.json()) as { message_id: string; conversation_id: string };
  return json;
}

describe("Sent routes — coverage fill", () => {
  beforeEach(() => {
    seedBasic();
  });

  // -------------------------------------------------------------------------
  // GET /api/sent — filters
  // -------------------------------------------------------------------------

  it("GET /api/sent rejects invalid visibility filter (400)", async () => {
    const res = await app.request("/api/sent?visibility=bogus", {
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("invalid_argument");
  });

  it("GET /api/sent?visibility=hidden returns only hidden sent items", async () => {
    const sent1 = await sendMessage("alice@test", "bob@test", "Keep me");
    const sent2 = await sendMessage("alice@test", "bob@test", "Hide me");

    // Hide the second one
    const hideRes = await app.request(`/api/sent/${sent2.message_id}/hide`, {
      method: "POST",
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(hideRes.status).toBe(200);

    const res = await app.request("/api/sent?visibility=hidden", {
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      items: Array<{ message_id: string; visibility_state: string }>;
    };
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.message_id).toBe(sent2.message_id);
    expect(body.items[0]!.visibility_state).toBe("hidden");
    // sanity: active filter excludes it
    void sent1;
  });

  it("GET /api/sent?visibility=any returns both active and hidden", async () => {
    const a = await sendMessage("alice@test", "bob@test", "Active");
    const b = await sendMessage("alice@test", "bob@test", "Hidden");
    await app.request(`/api/sent/${b.message_id}/hide`, {
      method: "POST",
      headers: { "X-Inbox-Address": "alice@test" },
    });

    const res = await app.request("/api/sent?visibility=any", {
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ message_id: string; visibility_state: string }>;
    };
    const ids = body.items.map((i) => i.message_id).sort();
    expect(ids).toEqual([a.message_id, b.message_id].sort());
  });

  it("GET /api/sent honors since_ms and until_ms time-window filters", async () => {
    const before = await sendMessage("alice@test", "bob@test", "Before");

    // Read the created_at_ms for the first message so we can build a precise
    // window that excludes it.
    const row = db
      .prepare("SELECT created_at_ms FROM messages WHERE id = ?")
      .get(before.message_id) as { created_at_ms: number };

    // Pause just enough to make subsequent nowMs() > before.created_at_ms
    // (Date.now() is ms-resolution, so a busy loop is the most reliable way
    // to avoid flaky sub-ms equality without blocking on setTimeout).
    const t0 = Date.now();
    while (Date.now() <= row.created_at_ms) {
      /* spin */
      if (Date.now() - t0 > 50) break;
    }

    const after = await sendMessage("alice@test", "bob@test", "After");

    // since_ms > before.created_at_ms should drop the 'Before' row.
    const sinceRes = await app.request(
      `/api/sent?since_ms=${row.created_at_ms + 1}`,
      { headers: { "X-Inbox-Address": "alice@test" } }
    );
    const sinceBody = (await sinceRes.json()) as {
      items: Array<{ message_id: string }>;
    };
    const sinceIds = sinceBody.items.map((i) => i.message_id);
    expect(sinceIds).toContain(after.message_id);
    expect(sinceIds).not.toContain(before.message_id);

    // until_ms <= before.created_at_ms + 1 should keep only 'Before' row.
    const untilRes = await app.request(
      `/api/sent?until_ms=${row.created_at_ms + 1}`,
      { headers: { "X-Inbox-Address": "alice@test" } }
    );
    const untilBody = (await untilRes.json()) as {
      items: Array<{ message_id: string }>;
    };
    const untilIds = untilBody.items.map((i) => i.message_id);
    expect(untilIds).toContain(before.message_id);
    // 'after' may or may not be filtered out depending on clock resolution;
    // assert only the 'before' inclusion is deterministic.
  });

  it("GET /api/sent ignores malformed since_ms/until_ms (NaN)", async () => {
    const sent = await sendMessage("alice@test", "bob@test");
    const res = await app.request(
      "/api/sent?since_ms=notanumber&until_ms=alsojunk",
      { headers: { "X-Inbox-Address": "alice@test" } }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ message_id: string }> };
    expect(body.items.map((i) => i.message_id)).toContain(sent.message_id);
  });

  // -------------------------------------------------------------------------
  // GET /api/sent/:messageId — detail view
  // -------------------------------------------------------------------------

  it("GET /api/sent/:messageId returns 404 for unknown message", async () => {
    const res = await app.request("/api/sent/msg_nope", {
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("not_found");
  });

  it("GET /api/sent/:messageId redacts parent_message_id when parent not visible", async () => {
    // Alice sends to Bob (msg1)
    const msg1 = await sendMessage("alice@test", "bob@test", "Original");
    // Bob replies — this creates msg2 whose parent_message_id is msg1.
    // But Alice is the original sender of msg1, so from Bob's POV the parent
    // IS visible (bob has the delivery). We want the OPPOSITE case here:
    // construct a synthetic sent item whose parent points at a message that
    // actor has no delivery/sent_item for.

    // Insert a standalone "outside" message in its own conversation whose
    // sender is eve. Alice has no delivery and no sent_item for this row, so
    // from alice's POV the parent should be redacted when referenced.
    //
    // The composite FK (parent_message_id, conversation_id) -> messages
    // forces both messages to live in the SAME conversation. Alice's reply
    // is therefore inserted into cnv_outside as well.
    const ts = Date.now();
    insertAddress("addr_eve", "eve");
    db.prepare(
      "INSERT INTO conversations (id, created_at_ms) VALUES (?, ?)"
    ).run("cnv_outside", ts);
    db.prepare(
      `INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
       VALUES (?, ?, NULL, ?, ?, ?, 'normal', ?)`
    ).run("msg_outside", "cnv_outside", "addr_eve", "Outside", "hidden", ts);

    db.prepare(
      `INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, 'normal', ?)`
    ).run(
      "msg_alice_reply",
      "cnv_outside",
      "msg_outside",
      "addr_alice",
      "Reply",
      "body",
      ts
    );
    db.prepare(
      "INSERT INTO sent_items (message_id, visibility_state) VALUES (?, 'active')"
    ).run("msg_alice_reply");

    const res = await app.request("/api/sent/msg_alice_reply", {
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      message: { parent_message_id: string | null };
    };
    // alice has neither a delivery nor a sent_item for msg_outside → redacted
    expect(body.message.parent_message_id).toBeNull();
    void msg1;
  });

  it("GET /api/sent/:messageId exposes parent_message_id when parent IS visible (via sent_item)", async () => {
    // Alice sends msg1, then alice "replies" to herself via a synthetic row
    // that has parent = msg1. Alice has a sent_item for msg1, so the parent
    // should NOT be redacted.
    const msg1 = await sendMessage("alice@test", "bob@test", "Original");
    const ts = Date.now();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, 'normal', ?)`
    ).run(
      "msg_alice_followup",
      msg1.conversation_id,
      msg1.message_id,
      "addr_alice",
      "Follow-up",
      "body",
      ts
    );
    db.prepare(
      "INSERT INTO sent_items (message_id, visibility_state) VALUES (?, 'active')"
    ).run("msg_alice_followup");

    const res = await app.request("/api/sent/msg_alice_followup", {
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      message: { parent_message_id: string | null };
    };
    expect(body.message.parent_message_id).toBe(msg1.message_id);
  });

  it("GET /api/sent/:messageId serializes references (valid + malformed metadata_json)", async () => {
    const msg = await sendMessage("alice@test", "bob@test", "with-refs");

    const ts = Date.now();
    // Valid JSON metadata
    db.prepare(
      `INSERT INTO message_references (id, message_id, ordinal, ref_kind, ref_value, label, mime_type, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "mrf_1",
      msg.message_id,
      1,
      "url",
      "https://example.com",
      "Example",
      "text/html",
      JSON.stringify({ note: "ok" })
    );
    // Malformed JSON → should surface as metadata: null rather than throw
    db.prepare(
      `INSERT INTO message_references (id, message_id, ordinal, ref_kind, ref_value, label, mime_type, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "mrf_2",
      msg.message_id,
      2,
      "text",
      "broken",
      null,
      null,
      "{not-json"
    );
    void ts;

    const res = await app.request(`/api/sent/${msg.message_id}`, {
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      message: { references: Array<{ kind: string; metadata: unknown; label: string | null }> };
    };
    expect(body.message.references).toHaveLength(2);
    expect(body.message.references[0]!.kind).toBe("url");
    expect(body.message.references[0]!.metadata).toEqual({ note: "ok" });
    expect(body.message.references[1]!.kind).toBe("text");
    expect(body.message.references[1]!.metadata).toBeNull();
    expect(body.message.references[1]!.label).toBeNull();
  });

  // -------------------------------------------------------------------------
  // POST /api/sent/:messageId/hide
  // -------------------------------------------------------------------------

  it("POST /api/sent/:messageId/hide transitions active → hidden (changed=true)", async () => {
    const msg = await sendMessage("alice@test", "bob@test");
    const res = await app.request(`/api/sent/${msg.message_id}/hide`, {
      method: "POST",
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      changed: boolean;
      visibility_state: string;
    };
    expect(body.ok).toBe(true);
    expect(body.changed).toBe(true);
    expect(body.visibility_state).toBe("hidden");

    // hidden_at_ms was populated
    const row = db
      .prepare("SELECT visibility_state, hidden_at_ms FROM sent_items WHERE message_id = ?")
      .get(msg.message_id) as { visibility_state: string; hidden_at_ms: number | null };
    expect(row.visibility_state).toBe("hidden");
    expect(row.hidden_at_ms).not.toBeNull();
  });

  it("POST /api/sent/:messageId/hide is idempotent (changed=false on already-hidden)", async () => {
    const msg = await sendMessage("alice@test", "bob@test");
    await app.request(`/api/sent/${msg.message_id}/hide`, {
      method: "POST",
      headers: { "X-Inbox-Address": "alice@test" },
    });
    const res = await app.request(`/api/sent/${msg.message_id}/hide`, {
      method: "POST",
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { changed: boolean; visibility_state: string };
    expect(body.changed).toBe(false);
    expect(body.visibility_state).toBe("hidden");
  });

  it("POST /api/sent/:messageId/hide returns 404 when actor is not the sender", async () => {
    const msg = await sendMessage("alice@test", "bob@test");
    // Bob is the recipient, not the sender — he has no sent_item for this msg
    const res = await app.request(`/api/sent/${msg.message_id}/hide`, {
      method: "POST",
      headers: { "X-Inbox-Address": "bob@test" },
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  // -------------------------------------------------------------------------
  // POST /api/sent/:messageId/unhide
  // -------------------------------------------------------------------------

  it("POST /api/sent/:messageId/unhide transitions hidden → active (changed=true)", async () => {
    const msg = await sendMessage("alice@test", "bob@test");
    await app.request(`/api/sent/${msg.message_id}/hide`, {
      method: "POST",
      headers: { "X-Inbox-Address": "alice@test" },
    });
    const res = await app.request(`/api/sent/${msg.message_id}/unhide`, {
      method: "POST",
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { changed: boolean; visibility_state: string };
    expect(body.changed).toBe(true);
    expect(body.visibility_state).toBe("active");

    const row = db
      .prepare("SELECT visibility_state, hidden_at_ms FROM sent_items WHERE message_id = ?")
      .get(msg.message_id) as { visibility_state: string; hidden_at_ms: number | null };
    expect(row.visibility_state).toBe("active");
    expect(row.hidden_at_ms).toBeNull();
  });

  it("POST /api/sent/:messageId/unhide is idempotent on already-active item", async () => {
    const msg = await sendMessage("alice@test", "bob@test");
    const res = await app.request(`/api/sent/${msg.message_id}/unhide`, {
      method: "POST",
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { changed: boolean; visibility_state: string };
    expect(body.changed).toBe(false);
    expect(body.visibility_state).toBe("active");
  });

  it("POST /api/sent/:messageId/unhide returns 404 for unknown message", async () => {
    const res = await app.request("/api/sent/msg_ghost/unhide", {
      method: "POST",
      headers: { "X-Inbox-Address": "alice@test" },
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });
});
