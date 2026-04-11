/**
 * Coverage fill for routes/reply.ts.
 *
 * PR #129 coverage baseline flagged reply.ts at 48.8% line coverage.
 * These tests target the uncovered branches identified by the coverage tool:
 * - invalid JSON body / body field type validations
 * - invalid urgency rejection
 * - reply-all: original To/Cc + original sender minus actor
 * - explicit to/cc (string form + array form) with dedupe + self-filter
 * - self-only fallback when replying to own message without --all
 * - resolveRecipients error pass-through (unknown address)
 * - resolvedCount === 0 after expansion + filtering (inactive list member)
 *
 * NOT targeted:
 * - reply.ts lines 59-63: "original message row missing after delivery/sent_item
 *   already matched it" — purely defensive, unreachable without corrupting the
 *   DB between queries.
 * - reply.ts lines 251-255: executeSend internal_error catch — requires forcing
 *   a DB failure mid-transaction, adds test fragility with little value.
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

function seed() {
  resetDb();
  insertAddress("addr_alice", "alice");
  insertAddress("addr_bob", "bob");
  insertAddress("addr_carol", "carol");
  insertAddress("addr_dave", "dave");
}

async function sendFromTo(
  from: string,
  to: string | string[],
  cc?: string | string[]
) {
  const res = await app.request("/api/send", {
    method: "POST",
    headers: {
      "X-Inbox-Address": from,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, cc, subject: "Original", body: "Hi" }),
  });
  const json = (await res.json()) as { message_id: string; conversation_id: string };
  return json;
}

describe("Reply routes — coverage fill", () => {
  beforeEach(() => {
    seed();
  });

  // -------------------------------------------------------------------------
  // Body parsing + validation
  // -------------------------------------------------------------------------

  it("POST /api/reply/:messageId rejects invalid JSON body (400)", async () => {
    const orig = await sendFromTo("alice@test", "bob@test");
    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "bob@test",
        "Content-Type": "application/json",
      },
      body: "{not-json",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("invalid_argument");
    expect(body.error.message).toMatch(/JSON/);
  });

  it("POST /api/reply/:messageId rejects non-string body field", async () => {
    const orig = await sendFromTo("alice@test", "bob@test");
    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "bob@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: 42 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; target: string } };
    expect(body.error.code).toBe("invalid_argument");
    expect(body.error.target).toBe("body");
  });

  it("POST /api/reply/:messageId rejects non-string subject field", async () => {
    const orig = await sendFromTo("alice@test", "bob@test");
    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "bob@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subject: { nope: true } }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { target: string } };
    expect(body.error.target).toBe("subject");
  });

  it("POST /api/reply/:messageId rejects non-string urgency field", async () => {
    const orig = await sendFromTo("alice@test", "bob@test");
    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "bob@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urgency: 5 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { target: string } };
    expect(body.error.target).toBe("urgency");
  });

  it("POST /api/reply/:messageId rejects non-string/non-array to field", async () => {
    const orig = await sendFromTo("alice@test", "bob@test");
    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "bob@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: { addr: "carol@test" } }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { target: string } };
    expect(body.error.target).toBe("to");
  });

  it("POST /api/reply/:messageId rejects non-string/non-array cc field", async () => {
    const orig = await sendFromTo("alice@test", "bob@test");
    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "bob@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cc: 42 }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { target: string } };
    expect(body.error.target).toBe("cc");
  });

  it("POST /api/reply/:messageId rejects unknown urgency value", async () => {
    const orig = await sendFromTo("alice@test", "bob@test");
    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "bob@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: "Hi", urgency: "emergency" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("invalid_argument");
    expect(body.error.message).toMatch(/urgency/);
  });

  // -------------------------------------------------------------------------
  // Reply-all
  // -------------------------------------------------------------------------

  it("POST /api/reply/:messageId with all=true includes original to/cc minus actor", async () => {
    // Alice sends to Bob (to) and Carol (cc). Dave replies-all; Dave is not
    // in the original recipients, so we simulate by having Carol reply-all.
    const orig = await sendFromTo("alice@test", ["bob@test"], ["carol@test"]);

    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "carol@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: "Reply all", all: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      message_id: string;
      resolved_recipient_count: number;
    };
    expect(body.ok).toBe(true);
    // Expected recipients after reply-all (Carol is actor, filtered out):
    //   to: bob (was To) + alice (original sender) = 2
    //   cc: (empty — only carol was cc, filtered)
    expect(body.resolved_recipient_count).toBe(2);

    // Verify via DB: public_recipients on the reply message
    const pubRecips = db
      .prepare(
        `SELECT recipient_address_id, recipient_role FROM message_public_recipients
         WHERE message_id = ? ORDER BY recipient_role, ordinal`
      )
      .all(body.message_id) as Array<{
        recipient_address_id: string;
        recipient_role: string;
      }>;
    const toIds = pubRecips.filter((r) => r.recipient_role === "to").map((r) => r.recipient_address_id);
    expect(toIds).toContain("addr_bob");
    expect(toIds).toContain("addr_alice");
    expect(toIds).not.toContain("addr_carol");
  });

  // -------------------------------------------------------------------------
  // Explicit to/cc in reply body (string + array forms)
  // -------------------------------------------------------------------------

  it("POST /api/reply/:messageId accepts explicit to (string, comma-separated)", async () => {
    const orig = await sendFromTo("alice@test", "bob@test");
    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "bob@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: "Hi again", to: "carol@test,dave@test" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message_id: string };
    expect(body.ok).toBe(true);

    const pubTo = db
      .prepare(
        `SELECT recipient_address_id FROM message_public_recipients
         WHERE message_id = ? AND recipient_role = 'to'`
      )
      .all(body.message_id) as Array<{ recipient_address_id: string }>;
    const toIds = pubTo.map((r) => r.recipient_address_id);
    // Should include original sender (alice) + explicit to (carol, dave)
    expect(toIds).toEqual(expect.arrayContaining(["addr_alice", "addr_carol", "addr_dave"]));
  });

  it("POST /api/reply/:messageId accepts explicit to (array form) and cc", async () => {
    const orig = await sendFromTo("alice@test", "bob@test");
    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "bob@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: "Array form",
        to: ["carol@test"],
        cc: ["dave@test"],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; message_id: string };
    expect(body.ok).toBe(true);

    const pubRecips = db
      .prepare(
        `SELECT recipient_address_id, recipient_role FROM message_public_recipients
         WHERE message_id = ?`
      )
      .all(body.message_id) as Array<{
        recipient_address_id: string;
        recipient_role: string;
      }>;
    const cc = pubRecips.filter((r) => r.recipient_role === "cc").map((r) => r.recipient_address_id);
    expect(cc).toContain("addr_dave");
  });

  it("POST /api/reply/:messageId dedupes explicit to/cc and filters actor self", async () => {
    const orig = await sendFromTo("alice@test", "bob@test");
    // Bob replies — his explicit to includes bob@test (self) and the original
    // sender alice@test (duplicate) + some noise (empty string from trailing comma).
    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "bob@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: "Dedupe test",
        to: "alice@test,bob@test,carol@test, ",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { message_id: string };

    const toIds = (
      db
        .prepare(
          `SELECT recipient_address_id FROM message_public_recipients
           WHERE message_id = ? AND recipient_role = 'to'`
        )
        .all(body.message_id) as Array<{ recipient_address_id: string }>
    ).map((r) => r.recipient_address_id);

    // Alice (from default reply behavior + explicit) appears once
    expect(toIds.filter((id) => id === "addr_alice")).toHaveLength(1);
    // Bob (self) is filtered out
    expect(toIds).not.toContain("addr_bob");
    // Carol is present
    expect(toIds).toContain("addr_carol");
  });

  // -------------------------------------------------------------------------
  // Self-only fallback when replying to own message
  // -------------------------------------------------------------------------

  it("POST /api/reply/:messageId self-replies to own message (without all) routes to self", async () => {
    // Alice sends to Bob. Alice then replies to her own sent message without
    // --all and without explicit recipients — the default behavior builds
    // toAddrIds = [original_sender = alice], which is filtered out as self
    // in the explicit-recipients branch. But the simple-reply branch does NOT
    // filter the sender, so alice's self reply sends to alice. Verify 200.
    const orig = await sendFromTo("alice@test", "bob@test");
    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "alice@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: "Talking to myself" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      resolved_recipient_count: number;
      message_id: string;
    };
    expect(body.ok).toBe(true);
    expect(body.resolved_recipient_count).toBe(1);

    const toIds = (
      db
        .prepare(
          `SELECT recipient_address_id FROM message_public_recipients
           WHERE message_id = ? AND recipient_role = 'to'`
        )
        .all(body.message_id) as Array<{ recipient_address_id: string }>
    ).map((r) => r.recipient_address_id);
    expect(toIds).toEqual(["addr_alice"]);
  });

  it("POST /api/reply/:messageId triggers self-only fallback when all=true on own message", async () => {
    // Alice sends to Bob. Alice does reply-all on her own sent message.
    // Reply-all excludes actor (alice) from to/cc and from original sender
    // (which is also alice), leaving toAddrIds=[bob], ccAddrIds=[]. That's
    // already non-empty, so the fallback doesn't fire. To actually exercise
    // the fallback (lines 209-210), we need a scenario where reply-all
    // yields 0 recipients: actor replies-all to a message where they are
    // the SOLE original recipient AND the sender.
    //
    // Easiest path: alice sends to herself via her own explicit self-reply
    // — but send rejects zero recipients. So we construct a message by
    // hand where alice is the sender and there are no public recipients.
    const ts = Date.now();
    db.prepare(
      "INSERT INTO conversations (id, created_at_ms) VALUES (?, ?)"
    ).run("cnv_selfonly", ts);
    db.prepare(
      `INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
       VALUES (?, ?, NULL, ?, ?, ?, 'normal', ?)`
    ).run("msg_selfonly", "cnv_selfonly", "addr_alice", "S", "B", ts);
    db.prepare(
      "INSERT INTO sent_items (message_id, visibility_state) VALUES (?, 'active')"
    ).run("msg_selfonly");

    // Reply-all: original to/cc = empty, original sender = alice (filtered
    // as actor), no explicit to/cc → fallback kicks in → toAddrIds = [alice]
    const res = await app.request("/api/reply/msg_selfonly", {
      method: "POST",
      headers: {
        "X-Inbox-Address": "alice@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: "fallback", all: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      resolved_recipient_count: number;
      message_id: string;
    };
    expect(body.ok).toBe(true);
    expect(body.resolved_recipient_count).toBe(1);

    const toIds = (
      db
        .prepare(
          `SELECT recipient_address_id FROM message_public_recipients
           WHERE message_id = ? AND recipient_role = 'to'`
        )
        .all(body.message_id) as Array<{ recipient_address_id: string }>
    ).map((r) => r.recipient_address_id);
    expect(toIds).toEqual(["addr_alice"]);
  });

  // -------------------------------------------------------------------------
  // resolveRecipients error pass-through
  // -------------------------------------------------------------------------

  it("POST /api/reply/:messageId bubbles resolveRecipients error for unknown address", async () => {
    // Unknown explicit address — resolveRecipients throws, reply handler
    // re-emits as 400 invalid_argument.
    const orig = await sendFromTo("alice@test", "bob@test");
    // Wipe the default fallback by adding an unknown explicit recipient and
    // then separately ensuring the default toAddrIds branch still has alice
    // in it. We need the UNKNOWN address to reach resolveRecipients, so we
    // supply it via explicit to. However, lookupAddress for unknown returns
    // undefined and is silently skipped in the explicit branch (lines 189-193).
    // Thus to exercise the resolveRecipients throw we need a KNOWN address
    // that is inactive: resolveRecipients validates and throws invalid_state
    // for inactive addresses.
    //
    // Make carol inactive and reply with explicit to=carol@test.
    db.prepare("UPDATE addresses SET is_active = 0 WHERE id = 'addr_carol'").run();
    const res = await app.request(`/api/reply/${orig.message_id}`, {
      method: "POST",
      headers: {
        "X-Inbox-Address": "bob@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: "bad", to: "carol@test" }),
    });
    // Inactive → 409 invalid_state from validateRecipient
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_state");
  });

  // -------------------------------------------------------------------------
  // resolvedCount === 0 via empty list expansion
  // -------------------------------------------------------------------------

  it("POST /api/reply/:messageId returns 409 when list expansion yields zero active members", async () => {
    // Create an empty list address. Alice sends a message to Bob with the
    // empty list in cc (send path allows it because it routes to Bob).
    // Then Bob replies-all — his recipient set derives from the stored
    // message_public_recipients, which include the empty list address. The
    // reply handler converts those back to strings and passes them to
    // resolveRecipients, which expands the list to zero members and returns
    // resolvedCount === 0 → 409.
    const ts = Date.now();
    insertAddress("addr_emptylist", "emptylist", { kind: "list" });
    // Alice → Bob cc: emptylist — but send requires list to have active members
    // for successful delivery. We'll construct the reply target message
    // directly so that reply-all expansion yields zero members.
    db.prepare(
      "INSERT INTO conversations (id, created_at_ms) VALUES (?, ?)"
    ).run("cnv_el", ts);
    db.prepare(
      `INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
       VALUES (?, ?, NULL, ?, ?, ?, 'normal', ?)`
    ).run("msg_el", "cnv_el", "addr_alice", "S", "B", ts);
    // public_recipients: only the empty list (in 'to')
    db.prepare(
      `INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)
       VALUES (?, ?, ?, 'to', 1, ?)`
    ).run("mpr_el", "msg_el", "addr_emptylist", ts);
    // Give alice a delivery row on msg_el so she can see it to reply to
    db.prepare(
      `INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)
       VALUES (?, ?, ?, 'to', 'unread', 'active', ?)`
    ).run("dly_el", "msg_el", "addr_alice", ts);

    // Alice replies-all. Reply-all collects original 'to' = [emptylist],
    // filters out actor (alice is not in there), adds original sender
    // (alice) but she's the actor → filtered. toAddrIds = [emptylist].
    // Note: if emptylist.id === actor.id that would fail; IDs differ so OK.
    // But wait — the reply handler also ADDS original sender as 'to' if not
    // present and not actor. Alice IS the sender AND the actor, so she's
    // filtered. Final toAddrIds = [emptylist]. Then:
    //   toStrings = ["emptylist@test"]
    //   resolveRecipients expands the list → 0 members → resolvedCount=0
    const res = await app.request("/api/reply/msg_el", {
      method: "POST",
      headers: {
        "X-Inbox-Address": "alice@test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: "to empty list", all: true }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("invalid_state");
    expect(body.error.message).toMatch(/no recipients resolved/);
  });
});
