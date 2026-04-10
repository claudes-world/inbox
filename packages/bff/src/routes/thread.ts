/**
 * Thread routes — view conversation thread.
 *
 * Maps to CLI command: inbox thread <conversation_id>
 */
import { Hono } from "hono";
import db, { addressIdToString } from "../db.js";
import { requireActor, errorEnvelope, parseLimit } from "../helpers.js";

export const threadRoutes = new Hono();

// ---------------------------------------------------------------------------
// GET /:conversationId  →  inbox thread
// ---------------------------------------------------------------------------
threadRoutes.get("/:conversationId", (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const conversationId = c.req.param("conversationId");
  const limit = parseLimit(c);
  const full = c.req.query("full") === "1" || c.req.query("full") === "true";

  // Verify conversation exists
  const conv = db
    .prepare("SELECT id FROM conversations WHERE id = ?")
    .get(conversationId);

  if (!conv) {
    return c.json(
      errorEnvelope(
        "not_found",
        `Thread ${conversationId} not found`,
        "conversation_id"
      ),
      404
    );
  }

  // Get all visible messages: actor has delivery OR actor is sender+has sent_item
  // Uses the same visibility union as the bash resolve_thread_visibility
  const rows = db
    .prepare(
      `SELECT m.id, m.conversation_id, m.parent_message_id,
              m.sender_address_id, m.subject, m.body, m.sender_urgency, m.created_at_ms,
              COALESCE(d.id, '') as delivery_id,
              COALESCE(d.effective_role, '') as effective_role,
              COALESCE(d.engagement_state, '') as engagement_state,
              COALESCE(d.visibility_state, '') as d_visibility_state,
              CASE WHEN d.id IS NOT NULL THEN 'received' ELSE 'sent' END as view_kind,
              COALESCE(si.visibility_state, '') as s_visibility_state
       FROM messages m
       LEFT JOIN deliveries d ON d.message_id = m.id AND d.recipient_address_id = ?
       LEFT JOIN sent_items si ON si.message_id = m.id AND m.sender_address_id = ?
       WHERE m.conversation_id = ?
         AND (d.id IS NOT NULL OR si.message_id IS NOT NULL)
       ORDER BY m.created_at_ms ASC, m.id ASC`
    )
    .all(actor.id, actor.id, conversationId) as Array<{
    id: string;
    conversation_id: string;
    parent_message_id: string | null;
    sender_address_id: string;
    subject: string;
    body: string;
    sender_urgency: string;
    created_at_ms: number;
    delivery_id: string;
    effective_role: string;
    engagement_state: string;
    d_visibility_state: string;
    view_kind: string;
    s_visibility_state: string;
  }>;

  const totalVisibleCount = rows.length;

  // Build set of visible message IDs for parent redaction
  const visibleIds = new Set(rows.map((r) => r.id));

  // Apply limit (take last N for thread view — most recent messages)
  const truncated = rows.length > limit;
  const limitedRows = truncated ? rows.slice(-limit) : rows;

  const items = limitedRows.map((row) => {
    const sender =
      addressIdToString(row.sender_address_id) || "unknown@unknown";

    // Parent redaction
    let parentMessageId: string | null = null;
    if (row.parent_message_id && visibleIds.has(row.parent_message_id)) {
      parentMessageId = row.parent_message_id;
    }

    const bodyPreview = row.body.substring(0, 80).replace(/\n/g, " ");
    const visibilityState =
      row.view_kind === "received"
        ? row.d_visibility_state
        : row.s_visibility_state;

    const item: Record<string, unknown> = {
      message_id: row.id,
      parent_message_id: parentMessageId,
      sender,
      subject: row.subject,
      created_at_ms: row.created_at_ms,
      view_kind: row.view_kind,
      visibility_state: visibilityState,
      body_preview: bodyPreview,
    };

    // Add engagement_state and effective_role for received items
    if (row.view_kind === "received") {
      item.engagement_state = row.engagement_state;
      item.effective_role = row.effective_role;
    }

    // In full mode, include body and references
    if (full) {
      item.body = row.body;

      const refs = db
        .prepare(
          `SELECT ref_kind, ref_value
           FROM message_references WHERE message_id = ? ORDER BY ordinal`
        )
        .all(row.id) as Array<{ ref_kind: string; ref_value: string }>;

      item.references = refs.map((r) => ({
        kind: r.ref_kind,
        value: r.ref_value,
      }));
    }

    return item;
  });

  return c.json({
    ok: true,
    conversation_id: conversationId,
    items,
    limit,
    returned_count: items.length,
    truncated,
    total_visible_count: totalVisibleCount,
  });
});
