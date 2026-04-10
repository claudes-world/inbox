/**
 * Inbox routes — list, read, ack, hide, unhide for received messages.
 *
 * Maps to CLI commands: inbox list, inbox read, inbox ack, inbox hide, inbox unhide
 */
import { Hono } from "hono";
import db, { addressIdToString, generateId, nowMs } from "../db.js";
import { requireActor, errorEnvelope, parseLimit } from "../helpers.js";

export const inboxRoutes = new Hono();

// ---------------------------------------------------------------------------
// GET /  →  inbox list
// ---------------------------------------------------------------------------
inboxRoutes.get("/", (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const limit = parseLimit(c);
  const state = c.req.query("state") || "any";
  const visibility = c.req.query("visibility") || "active";
  const sinceMs = c.req.query("since_ms");
  const untilMs = c.req.query("until_ms");

  // Validate filters
  if (!["any", "unread", "read", "acknowledged"].includes(state)) {
    return c.json(
      errorEnvelope("invalid_argument", `invalid state filter: ${state}`),
      400
    );
  }
  if (!["any", "active", "hidden"].includes(visibility)) {
    return c.json(
      errorEnvelope(
        "invalid_argument",
        `invalid visibility filter: ${visibility}`
      ),
      400
    );
  }

  // Build WHERE clause
  const conditions: string[] = ["d.recipient_address_id = ?"];
  const params: (string | number)[] = [actor.id];

  if (visibility === "active") {
    conditions.push("d.visibility_state = 'active'");
  } else if (visibility === "hidden") {
    conditions.push("d.visibility_state = 'hidden'");
  }

  if (state === "unread") {
    conditions.push("d.engagement_state = 'unread'");
  } else if (state === "read") {
    conditions.push("d.engagement_state = 'read'");
  } else if (state === "acknowledged") {
    conditions.push("d.engagement_state = 'acknowledged'");
  }

  if (sinceMs) {
    const since = parseInt(sinceMs, 10);
    if (!isNaN(since)) {
      conditions.push("d.delivered_at_ms >= ?");
      params.push(since);
    }
  }
  if (untilMs) {
    const until = parseInt(untilMs, 10);
    if (!isNaN(until)) {
      conditions.push("d.delivered_at_ms < ?");
      params.push(until);
    }
  }

  const whereClause = conditions.join(" AND ");

  const rows = db
    .prepare(
      `SELECT m.id, m.conversation_id, m.sender_address_id, m.subject, m.body,
              d.engagement_state, d.visibility_state, d.effective_role, d.delivered_at_ms, d.id as delivery_id
       FROM deliveries d
       JOIN messages m ON m.id = d.message_id
       WHERE ${whereClause}
       ORDER BY d.delivered_at_ms DESC, d.id DESC
       LIMIT ?`
    )
    .all(...params, limit) as Array<{
    id: string;
    conversation_id: string;
    sender_address_id: string;
    subject: string;
    body: string;
    engagement_state: string;
    visibility_state: string;
    effective_role: string;
    delivered_at_ms: number;
    delivery_id: string;
  }>;

  const items = rows.map((row) => {
    const sender = addressIdToString(row.sender_address_id) || "unknown@unknown";
    const bodyPreview = row.body.substring(0, 80).replace(/\n/g, " ");

    return {
      message_id: row.id,
      conversation_id: row.conversation_id,
      sender,
      subject: row.subject,
      delivered_at_ms: row.delivered_at_ms,
      view_kind: "received" as const,
      engagement_state: row.engagement_state,
      visibility_state: row.visibility_state,
      effective_role: row.effective_role,
      body_preview: bodyPreview,
      delivery_id: row.delivery_id,
    };
  });

  return c.json({
    ok: true,
    items,
    limit,
    returned_count: items.length,
  });
});

// ---------------------------------------------------------------------------
// GET /:messageId  →  inbox read
// ---------------------------------------------------------------------------
inboxRoutes.get("/:messageId", (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const messageId = c.req.param("messageId");
  const peek = c.req.query("peek") === "1" || c.req.query("peek") === "true";

  // Resolve delivery
  const delivery = db
    .prepare(
      `SELECT id, message_id, recipient_address_id, effective_role,
              engagement_state, visibility_state, delivered_at_ms
       FROM deliveries
       WHERE message_id = ? AND recipient_address_id = ?`
    )
    .get(messageId, actor.id) as
    | {
        id: string;
        message_id: string;
        recipient_address_id: string;
        effective_role: string;
        engagement_state: string;
        visibility_state: string;
        delivered_at_ms: number;
      }
    | undefined;

  if (!delivery) {
    return c.json(
      errorEnvelope("not_found", "message not found", "message_id"),
      404
    );
  }

  // Mark as read if not peeking and currently unread
  if (!peek && delivery.engagement_state === "unread") {
    const ts = nowMs();
    const evtId = generateId("evt_");

    const updateDelivery = db.prepare(
      "UPDATE deliveries SET engagement_state = 'read' WHERE id = ?"
    );
    const insertEvent = db.prepare(
      `INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
       VALUES (?, ?, 'state_changed', 'read', ?, ?, 'read', ?)`
    );

    const markRead = db.transaction(() => {
      updateDelivery.run(delivery.id);
      insertEvent.run(
        evtId,
        delivery.id,
        actor.id,
        ts,
        delivery.visibility_state
      );
    });
    markRead();

    delivery.engagement_state = "read";
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

  // Parent redaction: check if parent is visible to actor
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
      .get(msg.parent_message_id, actor.id, msg.parent_message_id, actor.id);
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

  const references = refs.map((r) => ({
    kind: r.ref_kind,
    value: r.ref_value,
    label: r.label || null,
    mime_type: r.mime_type || null,
    metadata: r.metadata_json ? JSON.parse(r.metadata_json) : null,
  }));

  // Get history (delivery events)
  const events = db
    .prepare(
      `SELECT id, event_type, change_kind, actor_address_id, event_at_ms,
              engagement_state_after, visibility_state_after
       FROM delivery_events
       WHERE delivery_id = ?
       ORDER BY event_at_ms ASC, id ASC`
    )
    .all(delivery.id) as Array<{
    id: string;
    event_type: string;
    change_kind: string;
    actor_address_id: string | null;
    event_at_ms: number;
    engagement_state_after: string;
    visibility_state_after: string;
  }>;

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
      view_kind: "received" as const,
      engagement_state: delivery.engagement_state,
      visibility_state: delivery.visibility_state,
      effective_role: delivery.effective_role,
      delivery_id: delivery.id,
    },
    history: events,
  });
});

// ---------------------------------------------------------------------------
// POST /:messageId/ack  →  inbox ack
// ---------------------------------------------------------------------------
inboxRoutes.post("/:messageId/ack", (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const messageId = c.req.param("messageId");

  const delivery = db
    .prepare(
      `SELECT id, engagement_state, visibility_state
       FROM deliveries
       WHERE message_id = ? AND recipient_address_id = ?`
    )
    .get(messageId, actor.id) as
    | {
        id: string;
        engagement_state: string;
        visibility_state: string;
      }
    | undefined;

  if (!delivery) {
    return c.json(
      errorEnvelope("not_found", "message not found", "message_id"),
      404
    );
  }

  let changed = false;
  if (delivery.engagement_state !== "acknowledged") {
    const ts = nowMs();
    const evtId = generateId("evt_");

    const doAck = db.transaction(() => {
      db.prepare(
        "UPDATE deliveries SET engagement_state = 'acknowledged' WHERE id = ?"
      ).run(delivery.id);
      db.prepare(
        `INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
         VALUES (?, ?, 'state_changed', 'ack', ?, ?, 'acknowledged', ?)`
      ).run(evtId, delivery.id, actor.id, ts, delivery.visibility_state);
    });
    doAck();
    changed = true;
  }

  return c.json({
    ok: true,
    message_id: messageId,
    changed,
    view_kind: "received" as const,
    engagement_state: "acknowledged",
    visibility_state: delivery.visibility_state,
  });
});

// ---------------------------------------------------------------------------
// POST /:messageId/hide  →  inbox hide
// ---------------------------------------------------------------------------
inboxRoutes.post("/:messageId/hide", (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const messageId = c.req.param("messageId");

  const delivery = db
    .prepare(
      `SELECT id, engagement_state, visibility_state
       FROM deliveries
       WHERE message_id = ? AND recipient_address_id = ?`
    )
    .get(messageId, actor.id) as
    | {
        id: string;
        engagement_state: string;
        visibility_state: string;
      }
    | undefined;

  if (!delivery) {
    return c.json(
      errorEnvelope("not_found", "message not found", "message_id"),
      404
    );
  }

  let changed = false;
  if (delivery.visibility_state === "active") {
    const ts = nowMs();
    const evtId = generateId("evt_");

    const doHide = db.transaction(() => {
      db.prepare(
        "UPDATE deliveries SET visibility_state = 'hidden' WHERE id = ?"
      ).run(delivery.id);
      db.prepare(
        `INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
         VALUES (?, ?, 'state_changed', 'hide', ?, ?, ?, 'hidden')`
      ).run(
        evtId,
        delivery.id,
        actor.id,
        ts,
        delivery.engagement_state
      );
    });
    doHide();
    changed = true;
  }

  return c.json({
    ok: true,
    message_id: messageId,
    changed,
    view_kind: "received" as const,
    engagement_state: delivery.engagement_state,
    visibility_state: "hidden",
  });
});

// ---------------------------------------------------------------------------
// POST /:messageId/unhide  →  inbox unhide
// ---------------------------------------------------------------------------
inboxRoutes.post("/:messageId/unhide", (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const messageId = c.req.param("messageId");

  const delivery = db
    .prepare(
      `SELECT id, engagement_state, visibility_state
       FROM deliveries
       WHERE message_id = ? AND recipient_address_id = ?`
    )
    .get(messageId, actor.id) as
    | {
        id: string;
        engagement_state: string;
        visibility_state: string;
      }
    | undefined;

  if (!delivery) {
    return c.json(
      errorEnvelope("not_found", "message not found", "message_id"),
      404
    );
  }

  let changed = false;
  if (delivery.visibility_state === "hidden") {
    const ts = nowMs();
    const evtId = generateId("evt_");

    const doUnhide = db.transaction(() => {
      db.prepare(
        "UPDATE deliveries SET visibility_state = 'active' WHERE id = ?"
      ).run(delivery.id);
      db.prepare(
        `INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
         VALUES (?, ?, 'state_changed', 'unhide', ?, ?, ?, 'active')`
      ).run(
        evtId,
        delivery.id,
        actor.id,
        ts,
        delivery.engagement_state
      );
    });
    doUnhide();
    changed = true;
  }

  return c.json({
    ok: true,
    message_id: messageId,
    changed,
    view_kind: "received" as const,
    engagement_state: delivery.engagement_state,
    visibility_state: "active",
  });
});
