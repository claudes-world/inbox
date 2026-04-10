/**
 * Reply routes — reply to existing messages.
 *
 * Maps to CLI command: inbox reply
 */
import { Hono } from "hono";
import db, {
  addressIdToString,
  lookupAddress,
} from "../db.js";
import { requireActor, errorEnvelope } from "../helpers.js";
import { resolveRecipients, executeSend, type RecipientResolution } from "./send.js";

export const replyRoutes = new Hono();

// ---------------------------------------------------------------------------
// POST /api/reply/:messageId  →  inbox reply
// ---------------------------------------------------------------------------
replyRoutes.post("/:messageId", async (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const targetMessageId = c.req.param("messageId");

  // Verify actor can see the target message (delivery or sent_item)
  const hasDelivery = db
    .prepare(
      "SELECT 1 FROM deliveries WHERE message_id = ? AND recipient_address_id = ? LIMIT 1"
    )
    .get(targetMessageId, actor.id);
  const hasSentItem = db
    .prepare(
      `SELECT 1 FROM sent_items si JOIN messages m ON si.message_id = m.id
       WHERE m.id = ? AND m.sender_address_id = ? LIMIT 1`
    )
    .get(targetMessageId, actor.id);

  if (!hasDelivery && !hasSentItem) {
    return c.json(
      errorEnvelope("not_found", "message not found", "message_id"),
      404
    );
  }

  // Get the original message
  const originalMsg = db
    .prepare(
      "SELECT conversation_id, sender_address_id, subject FROM messages WHERE id = ?"
    )
    .get(targetMessageId) as
    | {
        conversation_id: string;
        sender_address_id: string;
        subject: string;
      }
    | undefined;

  if (!originalMsg) {
    return c.json(
      errorEnvelope("not_found", "message not found", "message_id"),
      404
    );
  }

  let body: {
    body?: string;
    subject?: string;
    urgency?: string;
    to?: string | string[];
    cc?: string | string[];
    all?: boolean;
    references?: unknown[];
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json(
      errorEnvelope("invalid_argument", "invalid JSON body"),
      400
    );
  }

  // Validate body field types
  if (body.body !== undefined && typeof body.body !== "string") {
    return c.json(
      errorEnvelope("invalid_argument", "'body' must be a string", "body"),
      400
    );
  }
  if (body.subject !== undefined && typeof body.subject !== "string") {
    return c.json(
      errorEnvelope("invalid_argument", "'subject' must be a string", "subject"),
      400
    );
  }
  if (
    body.urgency !== undefined &&
    typeof body.urgency !== "string"
  ) {
    return c.json(
      errorEnvelope("invalid_argument", "'urgency' must be a string", "urgency"),
      400
    );
  }
  if (
    body.to !== undefined &&
    typeof body.to !== "string" &&
    !Array.isArray(body.to)
  ) {
    return c.json(
      errorEnvelope("invalid_argument", "'to' must be a string or array of strings", "to"),
      400
    );
  }
  if (
    body.cc !== undefined &&
    typeof body.cc !== "string" &&
    !Array.isArray(body.cc)
  ) {
    return c.json(
      errorEnvelope("invalid_argument", "'cc' must be a string or array of strings", "cc"),
      400
    );
  }

  const subject = body.subject || originalMsg.subject;
  const msgBody = body.body || "";
  const urgency = body.urgency || "normal";
  const allFlag = body.all === true;
  const references = body.references || [];

  if (!["low", "normal", "high", "urgent"].includes(urgency)) {
    return c.json(
      errorEnvelope("invalid_argument", `invalid urgency: ${urgency}`),
      400
    );
  }

  // Build recipient list
  let toAddrIds: string[] = [];
  let ccAddrIds: string[] = [];

  if (allFlag) {
    // Reply-all: include original To/Cc + original sender, minus actor
    const origTo = db
      .prepare(
        `SELECT recipient_address_id FROM message_public_recipients
         WHERE message_id = ? AND recipient_role = 'to'
         ORDER BY ordinal ASC`
      )
      .all(targetMessageId) as Array<{ recipient_address_id: string }>;

    const origCc = db
      .prepare(
        `SELECT recipient_address_id FROM message_public_recipients
         WHERE message_id = ? AND recipient_role = 'cc'
         ORDER BY ordinal ASC`
      )
      .all(targetMessageId) as Array<{ recipient_address_id: string }>;

    toAddrIds = origTo
      .map((r) => r.recipient_address_id)
      .filter((id) => id !== actor.id);
    ccAddrIds = origCc
      .map((r) => r.recipient_address_id)
      .filter((id) => id !== actor.id);

    // Add original sender as 'to' if not already present and not actor
    const origSender = originalMsg.sender_address_id;
    if (
      origSender !== actor.id &&
      !toAddrIds.includes(origSender) &&
      !ccAddrIds.includes(origSender)
    ) {
      toAddrIds.push(origSender);
    }
  } else {
    // Simple reply: send to original sender
    toAddrIds = [originalMsg.sender_address_id];
  }

  // Add explicit to/cc from request body
  if (body.to) {
    const explicitTo = Array.isArray(body.to) ? body.to : body.to.split(",");
    for (const addr of explicitTo) {
      const trimmed = addr.trim();
      if (!trimmed) continue;
      const row = lookupAddress(trimmed);
      if (row && row.id !== actor.id && !toAddrIds.includes(row.id)) {
        toAddrIds.push(row.id);
      }
    }
  }
  if (body.cc) {
    const explicitCc = Array.isArray(body.cc) ? body.cc : body.cc.split(",");
    for (const addr of explicitCc) {
      const trimmed = addr.trim();
      if (!trimmed) continue;
      const row = lookupAddress(trimmed);
      if (row && row.id !== actor.id && !ccAddrIds.includes(row.id)) {
        ccAddrIds.push(row.id);
      }
    }
  }

  // Self-only reply when replying to own message without --all
  if (toAddrIds.length === 0 && ccAddrIds.length === 0) {
    toAddrIds = [actor.id];
  }

  // Convert addr IDs back to address strings for resolveRecipients
  const toStrings = toAddrIds
    .map((id) => addressIdToString(id))
    .filter(Boolean) as string[];
  const ccStrings = ccAddrIds
    .map((id) => addressIdToString(id))
    .filter(Boolean) as string[];

  let resolution: RecipientResolution;
  try {
    resolution = resolveRecipients(toStrings.join(","), ccStrings.join(","));
  } catch (err: unknown) {
    const e = err as { code: string; message: string; target: string; status: number };
    return c.json(errorEnvelope(e.code, e.message, e.target), e.status as 400 | 409);
  }

  if (resolution.resolvedCount === 0) {
    return c.json(
      errorEnvelope(
        "invalid_state",
        "no recipients resolved after expansion and filtering"
      ),
      409
    );
  }

  let result: { messageId: string; conversationId: string };
  try {
    result = executeSend(
      actor.id,
      originalMsg.conversation_id,
      targetMessageId,
      resolution,
      subject,
      msgBody,
      urgency,
      references
    );
  } catch {
    return c.json(
      errorEnvelope("internal_error", "reply transaction failed"),
      500
    );
  }

  const senderStr =
    addressIdToString(actor.id) ||
    `${actor.local_part}@${actor.host}`;

  return c.json({
    ok: true,
    message_id: result.messageId,
    conversation_id: result.conversationId,
    parent_message_id: targetMessageId,
    sender: senderStr,
    resolved_recipient_count: resolution.resolvedCount,
    resolution_summary: {
      logical_recipient_count: resolution.logicalCount,
      resolved_recipient_count: resolution.resolvedCount,
      skipped_inactive_member_count: resolution.skippedInactive,
      deduped_recipient_count: resolution.dedupedCount,
    },
    sent_item_created: true,
  });
});
