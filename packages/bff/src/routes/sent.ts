/**
 * Sent routes — list, read, hide, unhide for sent messages.
 *
 * Maps to CLI commands: inbox sent list, inbox sent read, inbox sent hide, inbox sent unhide
 */
import { Hono } from "hono";
import db, { addressIdToString, nowMs } from "../db.js";
import { requireActor, errorEnvelope, parseLimit } from "../helpers.js";

export const sentRoutes = new Hono();

// ---------------------------------------------------------------------------
// GET /  →  inbox sent list
// ---------------------------------------------------------------------------
sentRoutes.get("/", (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const limit = parseLimit(c);
  const visibility = c.req.query("visibility") || "active";
  const sinceMs = c.req.query("since_ms");
  const untilMs = c.req.query("until_ms");

  if (!["any", "active", "hidden"].includes(visibility)) {
    return c.json(
      errorEnvelope(
        "invalid_argument",
        `invalid visibility filter: ${visibility}`
      ),
      400
    );
  }

  const conditions: string[] = ["m.sender_address_id = ?"];
  const params: (string | number)[] = [actor.id];

  if (visibility === "active") {
    conditions.push("si.visibility_state = 'active'");
  } else if (visibility === "hidden") {
    conditions.push("si.visibility_state = 'hidden'");
  }

  if (sinceMs) {
    const since = parseInt(sinceMs, 10);
    if (!isNaN(since)) {
      conditions.push("m.created_at_ms >= ?");
      params.push(since);
    }
  }
  if (untilMs) {
    const until = parseInt(untilMs, 10);
    if (!isNaN(until)) {
      conditions.push("m.created_at_ms < ?");
      params.push(until);
    }
  }

  const whereClause = conditions.join(" AND ");

  const rows = db
    .prepare(
      `SELECT m.id, m.conversation_id, m.subject, m.created_at_ms,
              si.visibility_state
       FROM messages m
       JOIN sent_items si ON si.message_id = m.id
       WHERE ${whereClause}
       ORDER BY m.created_at_ms DESC, m.id DESC
       LIMIT ?`
    )
    .all(...params, limit) as Array<{
    id: string;
    conversation_id: string;
    subject: string;
    created_at_ms: number;
    visibility_state: string;
  }>;

  const items = rows.map((row) => ({
    message_id: row.id,
    conversation_id: row.conversation_id,
    subject: row.subject,
    created_at_ms: row.created_at_ms,
    view_kind: "sent" as const,
    visibility_state: row.visibility_state,
  }));

  return c.json({
    ok: true,
    items,
    limit,
    returned_count: items.length,
  });
});

// ---------------------------------------------------------------------------
// GET /:messageId  →  inbox sent read
// ---------------------------------------------------------------------------
sentRoutes.get("/:messageId", (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const messageId = c.req.param("messageId");

  // Resolve sent item: verify message exists and sender matches
  const sentItem = db
    .prepare(
      `SELECT si.message_id, si.visibility_state
       FROM sent_items si
       JOIN messages m ON m.id = si.message_id
       WHERE si.message_id = ? AND m.sender_address_id = ?`
    )
    .get(messageId, actor.id) as
    | { message_id: string; visibility_state: string }
    | undefined;

  if (!sentItem) {
    return c.json(
      errorEnvelope("not_found", "message not found", "message_id"),
      404
    );
  }

  // Get message details
  const msg = db
    .prepare(
      `SELECT id, conversation_id, parent_message_id, sender_address_id,
              subject, body, sender_urgency, created_at_ms
       FROM messages WHERE id = ?`
    )
    .get(messageId) as
    | {
        id: string;
        conversation_id: string;
        parent_message_id: string | null;
        sender_address_id: string;
        subject: string;
        body: string;
        sender_urgency: string;
        created_at_ms: number;
      }
    | undefined;

  if (!msg) {
    return c.json(
      errorEnvelope("not_found", "message not found", "message_id"),
      404
    );
  }

  const sender =
    addressIdToString(msg.sender_address_id) || "unknown@unknown";

  // Parent redaction
  let parentMessageId: string | null = null;
  if (msg.parent_message_id) {
    const parentVisible = db
      .prepare(
        `SELECT 1 FROM deliveries WHERE message_id = ? AND recipient_address_id = ?
         UNION
         SELECT 1 FROM sent_items si JOIN messages m ON si.message_id = m.id
         WHERE m.id = ? AND m.sender_address_id = ?
         LIMIT 1`
      )
      .get(
        msg.parent_message_id,
        actor.id,
        msg.parent_message_id,
        actor.id
      );
    if (parentVisible) {
      parentMessageId = msg.parent_message_id;
    }
  }

  // Get public recipients
  const pubRecipients = db
    .prepare(
      `SELECT recipient_address_id, recipient_role
       FROM message_public_recipients
       WHERE message_id = ?
       ORDER BY recipient_role, ordinal`
    )
    .all(messageId) as Array<{
    recipient_address_id: string;
    recipient_role: string;
  }>;

  const publicTo: string[] = [];
  const publicCc: string[] = [];
  for (const pr of pubRecipients) {
    const addr = addressIdToString(pr.recipient_address_id);
    if (!addr) continue;
    if (pr.recipient_role === "to") publicTo.push(addr);
    else if (pr.recipient_role === "cc") publicCc.push(addr);
  }

  // Get references
  const refs = db
    .prepare(
      `SELECT ref_kind, ref_value, label, mime_type, metadata_json
       FROM message_references WHERE message_id = ? ORDER BY ordinal`
    )
    .all(messageId) as Array<{
    ref_kind: string;
    ref_value: string;
    label: string | null;
    mime_type: string | null;
    metadata_json: string | null;
  }>;

  const references = refs.map((r) => {
    let metadata: unknown = null;
    if (r.metadata_json) {
      try {
        metadata = JSON.parse(r.metadata_json);
      } catch {
        // Malformed metadata_json — return null rather than throwing
        metadata = null;
      }
    }
    return {
      kind: r.ref_kind,
      value: r.ref_value,
      label: r.label || null,
      mime_type: r.mime_type || null,
      metadata,
    };
  });

  return c.json({
    ok: true,
    message: {
      message_id: msg.id,
      conversation_id: msg.conversation_id,
      parent_message_id: parentMessageId,
      sender,
      subject: msg.subject,
      body: msg.body,
      public_to: publicTo,
      public_cc: publicCc,
      references,
    },
    state: {
      view_kind: "sent" as const,
      visibility_state: sentItem.visibility_state,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /:messageId/hide  →  inbox sent hide
// ---------------------------------------------------------------------------
sentRoutes.post("/:messageId/hide", (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const messageId = c.req.param("messageId");

  // Resolve sent item
  const sentItem = db
    .prepare(
      `SELECT si.message_id, si.visibility_state
       FROM sent_items si
       JOIN messages m ON m.id = si.message_id
       WHERE si.message_id = ? AND m.sender_address_id = ?`
    )
    .get(messageId, actor.id) as
    | { message_id: string; visibility_state: string }
    | undefined;

  if (!sentItem) {
    return c.json(
      errorEnvelope("not_found", "message not found", "message_id"),
      404
    );
  }

  let changed = false;
  if (sentItem.visibility_state === "active") {
    const ts = nowMs();
    db.prepare(
      "UPDATE sent_items SET visibility_state = 'hidden', hidden_at_ms = ? WHERE message_id = ?"
    ).run(ts, messageId);
    changed = true;
  }

  return c.json({
    ok: true,
    message_id: messageId,
    changed,
    view_kind: "sent" as const,
    visibility_state: "hidden",
  });
});

// ---------------------------------------------------------------------------
// POST /:messageId/unhide  →  inbox sent unhide
// ---------------------------------------------------------------------------
sentRoutes.post("/:messageId/unhide", (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const messageId = c.req.param("messageId");

  // Resolve sent item
  const sentItem = db
    .prepare(
      `SELECT si.message_id, si.visibility_state
       FROM sent_items si
       JOIN messages m ON m.id = si.message_id
       WHERE si.message_id = ? AND m.sender_address_id = ?`
    )
    .get(messageId, actor.id) as
    | { message_id: string; visibility_state: string }
    | undefined;

  if (!sentItem) {
    return c.json(
      errorEnvelope("not_found", "message not found", "message_id"),
      404
    );
  }

  let changed = false;
  if (sentItem.visibility_state === "hidden") {
    db.prepare(
      "UPDATE sent_items SET visibility_state = 'active', hidden_at_ms = NULL WHERE message_id = ?"
    ).run(messageId);
    changed = true;
  }

  return c.json({
    ok: true,
    message_id: messageId,
    changed,
    view_kind: "sent" as const,
    visibility_state: "active",
  });
});
