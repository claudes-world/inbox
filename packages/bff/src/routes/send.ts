/**
 * Send and reply routes — create new messages.
 *
 * Maps to CLI commands: inbox send, inbox reply
 */
import { Hono } from "hono";
import db, {
  addressIdToString,
  lookupAddress,
  generateId,
  nowMs,
} from "../db.js";
import { requireActor, errorEnvelope } from "../helpers.js";

export const sendRoutes = new Hono();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RecipientResolution {
  /** Deduplicated actual recipients: addr_id -> effective_role */
  actual: Map<string, string>;
  /** Ordered recipient IDs (insertion order) */
  order: string[];
  /** Public To addr IDs (deduplicated within role) */
  pubToIds: string[];
  /** Public Cc addr IDs (deduplicated within role) */
  pubCcIds: string[];
  /** Counts for resolution summary */
  logicalCount: number;
  resolvedCount: number;
  skippedInactive: number;
  dedupedCount: number;
}

/**
 * Check if an address ID is a list address.
 */
function isListAddress(addrId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM addresses WHERE id = ? AND kind = 'list' LIMIT 1")
    .get(addrId);
  return !!row;
}

/**
 * Expand list members (active only, ordinal order).
 */
function expandList(listAddrId: string): string[] {
  const rows = db
    .prepare(
      `SELECT gm.member_address_id
       FROM group_members gm
       JOIN addresses a ON a.id = gm.member_address_id
       WHERE gm.group_address_id = ? AND a.is_active = 1
       ORDER BY gm.ordinal ASC, gm.member_address_id ASC`
    )
    .all(listAddrId) as Array<{ member_address_id: string }>;
  return rows.map((r) => r.member_address_id);
}

/**
 * Get total member count for a list (including inactive).
 */
function totalListMembers(listAddrId: string): number {
  const row = db
    .prepare(
      "SELECT count(*) as cnt FROM group_members WHERE group_address_id = ?"
    )
    .get(listAddrId) as { cnt: number };
  return row.cnt;
}

/**
 * Validate a direct recipient address string. Returns address row or throws error info.
 */
function validateRecipient(address: string): {
  id: string;
  kind: string;
  is_active: number;
} {
  const row = lookupAddress(address);
  if (!row) {
    throw {
      code: "invalid_argument",
      message: `unknown recipient address: ${address}`,
      target: "recipient",
      status: 400,
    };
  }
  if (row.is_active !== 1) {
    throw {
      code: "invalid_state",
      message: `recipient address is inactive: ${address}`,
      target: "recipient",
      status: 409,
    };
  }
  return { id: row.id, kind: row.kind, is_active: row.is_active };
}

/**
 * Resolve recipients for a send operation.
 * Takes comma-separated address strings for to and cc.
 */
function resolveRecipients(
  toList: string,
  ccList: string
): RecipientResolution {
  const toAddrs = toList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ccAddrs = ccList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const logicalCount = toAddrs.length + ccAddrs.length;

  // Validate and get IDs
  const toAddrIds: string[] = [];
  for (const addr of toAddrs) {
    const row = validateRecipient(addr);
    toAddrIds.push(row.id);
  }

  const ccAddrIds: string[] = [];
  for (const addr of ccAddrs) {
    const row = validateRecipient(addr);
    ccAddrIds.push(row.id);
  }

  // Deduplicate public headers (within role)
  const pubToIds = [...new Set(toAddrIds)];
  const pubCcIds = [...new Set(ccAddrIds)];

  // Expand lists and collect actual recipients
  const actual = new Map<string, string>();
  const order: string[] = [];
  let skippedInactive = 0;
  let totalBeforeDedupe = 0;

  function addRecipient(addrId: string, role: string) {
    totalBeforeDedupe++;
    if (!actual.has(addrId)) {
      actual.set(addrId, role);
      order.push(addrId);
    } else {
      // Role precedence: to > cc > bcc
      const existing = actual.get(addrId)!;
      if (role === "to") actual.set(addrId, "to");
      else if (role === "cc" && existing !== "to")
        actual.set(addrId, "cc");
    }
  }

  for (const addrId of toAddrIds) {
    if (isListAddress(addrId)) {
      const members = expandList(addrId);
      const total = totalListMembers(addrId);
      skippedInactive += total - members.length;
      for (const memberId of members) {
        addRecipient(memberId, "to");
      }
    } else {
      addRecipient(addrId, "to");
    }
  }

  for (const addrId of ccAddrIds) {
    if (isListAddress(addrId)) {
      const members = expandList(addrId);
      const total = totalListMembers(addrId);
      skippedInactive += total - members.length;
      for (const memberId of members) {
        addRecipient(memberId, "cc");
      }
    } else {
      addRecipient(addrId, "cc");
    }
  }

  const resolvedCount = order.length;
  const dedupedCount = totalBeforeDedupe - resolvedCount;

  return {
    actual,
    order,
    pubToIds,
    pubCcIds,
    logicalCount,
    resolvedCount,
    skippedInactive,
    dedupedCount,
  };
}

/**
 * Execute the send transaction.
 */
function executeSend(
  senderAddrId: string,
  conversationId: string | null,
  parentMessageId: string | null,
  resolution: RecipientResolution,
  subject: string,
  body: string,
  urgency: string,
  _referencesJson: unknown[] // reserved for future use
): { messageId: string; conversationId: string } {
  const ts = nowMs();
  const cnvId = conversationId || generateId("cnv_");
  const msgId = generateId("msg_");
  const isNewConversation = !conversationId;

  const doSendTx = db.transaction(() => {
    // Create conversation if new
    if (isNewConversation) {
      db.prepare(
        "INSERT INTO conversations (id, created_at_ms) VALUES (?, ?)"
      ).run(cnvId, ts);
    }

    // Create message
    db.prepare(
      `INSERT INTO messages (id, conversation_id, parent_message_id, sender_address_id, subject, body, sender_urgency, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      msgId,
      cnvId,
      parentMessageId,
      senderAddrId,
      subject,
      body,
      urgency,
      ts
    );

    // Public To recipients
    let ordinal = 0;
    for (const addrId of resolution.pubToIds) {
      ordinal++;
      const mprId = generateId("mpr_");
      db.prepare(
        `INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)
         VALUES (?, ?, ?, 'to', ?, ?)`
      ).run(mprId, msgId, addrId, ordinal, ts);
    }

    // Public Cc recipients
    ordinal = 0;
    for (const addrId of resolution.pubCcIds) {
      ordinal++;
      const mprId = generateId("mpr_");
      db.prepare(
        `INSERT INTO message_public_recipients (id, message_id, recipient_address_id, recipient_role, ordinal, created_at_ms)
         VALUES (?, ?, ?, 'cc', ?, ?)`
      ).run(mprId, msgId, addrId, ordinal, ts);
    }

    // Create deliveries
    for (const addrId of resolution.order) {
      const effRole = resolution.actual.get(addrId)!;
      const dlyId = generateId("dly_");
      const evtId = generateId("evt_");

      db.prepare(
        `INSERT INTO deliveries (id, message_id, recipient_address_id, effective_role, engagement_state, visibility_state, delivered_at_ms)
         VALUES (?, ?, ?, ?, 'unread', 'active', ?)`
      ).run(dlyId, msgId, addrId, effRole, ts);

      // Delivery source (simplified: all direct for now — list expansion tracking mirrors bash)
      db.prepare(
        `INSERT OR IGNORE INTO delivery_sources (delivery_id, source_address_id, source_role, source_kind)
         VALUES (?, ?, ?, 'direct')`
      ).run(dlyId, addrId, effRole);

      db.prepare(
        `INSERT INTO delivery_events (id, delivery_id, event_type, change_kind, actor_address_id, event_at_ms, engagement_state_after, visibility_state_after)
         VALUES (?, ?, 'delivered', 'delivered', NULL, ?, 'unread', 'active')`
      ).run(evtId, dlyId, ts);
    }

    // Create sent_item
    db.prepare(
      "INSERT INTO sent_items (message_id, visibility_state) VALUES (?, 'active')"
    ).run(msgId);
  });

  doSendTx();
  return { messageId: msgId, conversationId: cnvId };
}

// ---------------------------------------------------------------------------
// POST /api/send  →  inbox send
// ---------------------------------------------------------------------------
sendRoutes.post("/", async (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  let body: {
    to: string | string[];
    cc?: string | string[];
    subject?: string;
    body?: string;
    urgency?: string;
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

  // Normalize to/cc to comma-separated strings
  const toList = Array.isArray(body.to) ? body.to.join(",") : (body.to || "");
  const ccList = Array.isArray(body.cc) ? body.cc.join(",") : (body.cc || "");

  if (!toList) {
    return c.json(
      errorEnvelope(
        "invalid_argument",
        "at least one 'to' recipient is required"
      ),
      400
    );
  }

  const subject = body.subject || "";
  const msgBody = body.body || "";
  const urgency = body.urgency || "normal";
  const references = body.references || [];

  if (!["low", "normal", "high", "urgent"].includes(urgency)) {
    return c.json(
      errorEnvelope("invalid_argument", `invalid urgency: ${urgency}`),
      400
    );
  }

  let resolution: RecipientResolution;
  try {
    resolution = resolveRecipients(toList, ccList);
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
      null,
      null,
      resolution,
      subject,
      msgBody,
      urgency,
      references
    );
  } catch {
    return c.json(
      errorEnvelope("internal_error", "send transaction failed"),
      500
    );
  }

  const senderStr =
    addressIdToString(actor.id) ||
    `${actor.local_part}@${actor.host}`;

  const publicTo = resolution.pubToIds
    .map((id) => addressIdToString(id))
    .filter(Boolean) as string[];
  const publicCc = resolution.pubCcIds
    .map((id) => addressIdToString(id))
    .filter(Boolean) as string[];

  return c.json({
    ok: true,
    message_id: result.messageId,
    conversation_id: result.conversationId,
    sender: senderStr,
    public_to: publicTo,
    public_cc: publicCc,
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

// ---------------------------------------------------------------------------
// POST /api/reply/:messageId  →  inbox reply
// ---------------------------------------------------------------------------
sendRoutes.post("/:messageId", async (c) => {
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
      const row = lookupAddress(addr.trim());
      if (row && row.id !== actor.id && !toAddrIds.includes(row.id)) {
        toAddrIds.push(row.id);
      }
    }
  }
  if (body.cc) {
    const explicitCc = Array.isArray(body.cc) ? body.cc : body.cc.split(",");
    for (const addr of explicitCc) {
      const row = lookupAddress(addr.trim());
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
