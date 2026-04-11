/**
 * GET /api/events — delivery event history for the Event Inspector, scoped
 * to the acting address's deliveries. DB change_kind delivered/read/ack/
 * hide/unhide maps to contract event_type delivered/read/acknowledged/
 * hidden/restored. Contract's replied/failed + any unknown event_type
 * return empty (not 400). actor_address joins addresses; the initial
 * delivered row has NULL actor_address_id per schema CHECK and falls back
 * to the acting address. from_state scans the delivery's history for the
 * prior event (hide/unhide diff visibility, else engagement). metadata is
 * parsed from metadata_json when it's a JSON object, else omitted.
 */
import { Hono } from "hono";
import db from "../db.js";
import { requireActor } from "../helpers.js";
import { deliveryEventListResponseSchema, type DeliveryEventKind } from "@inbox/contracts";

export const eventsRoutes = new Hono();

const KIND_TO_EVENT: Record<string, DeliveryEventKind> = {
  delivered: "delivered", read: "read", ack: "acknowledged", hide: "hidden", unhide: "restored",
};
const EVENT_TO_KIND: Partial<Record<DeliveryEventKind, string>> = {
  delivered: "delivered", read: "read", acknowledged: "ack", hidden: "hide", restored: "unhide",
};
const ALL_EVENT_TYPES = new Set<DeliveryEventKind>([
  "delivered", "read", "acknowledged", "replied", "hidden", "restored", "failed",
]);

type EventRow = {
  id: string; delivery_id: string; change_kind: string;
  actor_address_id: string | null; event_at_ms: number;
  engagement_state_after: string; visibility_state_after: string;
  metadata_json: string | null; message_id: string;
  actor_local: string | null; actor_host: string | null;
};

eventsRoutes.get("/", (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const messageIdFilter = c.req.query("message_id") || null;
  const rawEventType = c.req.query("event_type") || null;
  const eventTypeFilter: DeliveryEventKind | null =
    rawEventType && ALL_EVENT_TYPES.has(rawEventType as DeliveryEventKind)
      ? (rawEventType as DeliveryEventKind) : null;

  const rawLimit = c.req.query("limit");
  const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : NaN;
  const limit = !isNaN(parsedLimit) && parsedLimit >= 1 ? Math.min(parsedLimit, 500) : 50;

  const actorAddressStr = `${actor.local_part}@${actor.host}`;
  const mkEmpty = (etype: DeliveryEventKind | null) => c.json({
    items: [], returned_count: 0,
    filters: { message_id: messageIdFilter, event_type: etype, actor_address: actorAddressStr },
  });

  // Unknown -> empty + null filter. Known-but-unmapped (replied/failed) -> preserve filter.
  if (rawEventType && !eventTypeFilter) return mkEmpty(null);
  if (eventTypeFilter && !EVENT_TO_KIND[eventTypeFilter]) return mkEmpty(eventTypeFilter);

  const conditions = ["d.recipient_address_id = ?"];
  const params: (string | number)[] = [actor.id];
  if (messageIdFilter) {
    conditions.push("d.message_id = ?");
    params.push(messageIdFilter);
  }
  if (eventTypeFilter) {
    conditions.push("de.change_kind = ?");
    params.push(EVENT_TO_KIND[eventTypeFilter]!);
  }

  const rows = db
    .prepare(
      `SELECT de.id, de.delivery_id, de.change_kind, de.actor_address_id,
              de.event_at_ms, de.engagement_state_after, de.visibility_state_after,
              de.metadata_json, d.message_id,
              a.local_part AS actor_local, a.host AS actor_host
       FROM delivery_events de
       JOIN deliveries d ON d.id = de.delivery_id
       LEFT JOIN addresses a ON a.id = de.actor_address_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY de.event_at_ms DESC, de.id DESC
       LIMIT ?`
    )
    .all(...params, limit) as EventRow[];

  // Fetch full history per delivery so we can derive from_state.
  const historyByDelivery = new Map<string, EventRow[]>();
  const histStmt = db.prepare(
    `SELECT id, event_at_ms, engagement_state_after, visibility_state_after, change_kind
     FROM delivery_events WHERE delivery_id = ? ORDER BY event_at_ms ASC, id ASC`
  );
  for (const did of new Set(rows.map((r) => r.delivery_id))) {
    historyByDelivery.set(did, histStmt.all(did) as EventRow[]);
  }

  const items = rows.flatMap((row) => {
    const mapped = KIND_TO_EVENT[row.change_kind];
    if (!mapped) return [];
    const isVis = row.change_kind === "hide" || row.change_kind === "unhide";
    const toState = isVis ? row.visibility_state_after : row.engagement_state_after;
    const history = historyByDelivery.get(row.delivery_id) || [];
    const idx = history.findIndex((e) => e.id === row.id);
    const prev = idx > 0 ? history[idx - 1] : undefined;
    const fromState = prev
      ? (isVis ? prev.visibility_state_after : prev.engagement_state_after)
      : null;
    const eventActor = row.actor_local && row.actor_host
      ? `${row.actor_local}@${row.actor_host}` : actorAddressStr;

    let metadata: Record<string, unknown> | undefined;
    if (row.metadata_json) {
      try {
        const p = JSON.parse(row.metadata_json);
        if (p && typeof p === "object" && !Array.isArray(p)) {
          metadata = p as Record<string, unknown>;
        }
      } catch { /* omit malformed metadata */ }
    }

    return [{
      id: row.id, delivery_id: row.delivery_id, message_id: row.message_id,
      event_type: mapped, actor_address: eventActor,
      from_state: fromState, to_state: toState, created_ts: row.event_at_ms,
      ...(metadata ? { metadata } : {}),
    }];
  });

  const response = {
    items, returned_count: items.length,
    filters: { message_id: messageIdFilter, event_type: eventTypeFilter, actor_address: actorAddressStr },
  };

  const parsed = deliveryEventListResponseSchema.safeParse(response);
  if (!parsed.success) {
    console.error("[events] response failed contract validation:", parsed.error.issues);
    return c.json(response);
  }
  return c.json(parsed.data);
});
