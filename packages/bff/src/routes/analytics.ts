/**
 * GET /api/analytics/overview — message volume and engagement analytics.
 *
 * Server-side aggregation for the WorkflowDashboardScreen. Computes the
 * metrics in a handful of scoped SQL queries against messages/deliveries,
 * keyed by the acting address (x-inbox-address header, same as every other
 * authenticated endpoint).
 *
 * Design notes
 * ------------
 * - Windows are relative to the server clock at request time. `all` means
 *   the window starts at epoch 0 — effectively every message in the DB.
 * - `response_rate` is the fraction of deliveries TO the actor that have at
 *   least one downstream message where the actor is the sender and the
 *   parent_message_id chains back to the received message. Messages fall
 *   outside the numerator if the reply happens outside the window — we
 *   only require the received message's created_at_ms to be inside the
 *   window, not the reply.
 * - `active_conversations` counts distinct conversation_ids with any
 *   message in the window where the actor is either the sender OR a
 *   delivery recipient.
 * - `top_senders` / `top_recipients` are capped at 5 entries. We compose
 *   the address string from the addresses table's local_part + host
 *   instead of relying on a synthetic `address` column (no such column
 *   exists — see schema/001-init.sql).
 * - The endpoint is read-only, sits behind `readLimiter`, and does no
 *   caching. The rate limiter is the DB's protection.
 */
import { Hono } from "hono";
import db from "../db.js";
import { requireActor, errorEnvelope } from "../helpers.js";
import type { AnalyticsOverviewResponse, AnalyticsTimeWindow } from "@inbox/contracts";

export const analyticsRoutes = new Hono();

const VALID_WINDOWS: readonly AnalyticsTimeWindow[] = [
  "day",
  "week",
  "month",
  "all",
] as const;

function isValidWindow(value: string): value is AnalyticsTimeWindow {
  return (VALID_WINDOWS as readonly string[]).includes(value);
}

/** Resolve the start-of-window timestamp in epoch millis. */
function windowStartMs(window: AnalyticsTimeWindow, now: number): number {
  switch (window) {
    case "day":
      return now - 24 * 60 * 60 * 1000;
    case "week":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "month":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "all":
      return 0;
  }
}

analyticsRoutes.get("/overview", (c) => {
  const { actor, errorResponse } = requireActor(c);
  if (!actor) return errorResponse;

  const rawWindow = c.req.query("window") ?? "week";
  if (!isValidWindow(rawWindow)) {
    return c.json(
      errorEnvelope(
        "invalid_argument",
        `invalid window: ${rawWindow} (expected one of: day, week, month, all)`,
        "window"
      ),
      400
    );
  }
  const window: AnalyticsTimeWindow = rawWindow;

  const now = Date.now();
  const windowStart = windowStartMs(window, now);

  // Inbox count: deliveries TO the acting address whose message was
  // created inside the window.
  const inboxCountRow = db
    .prepare(
      `SELECT COUNT(DISTINCT d.id) AS cnt
       FROM deliveries d
       JOIN messages m ON m.id = d.message_id
       WHERE d.recipient_address_id = ?
         AND m.created_at_ms >= ?`
    )
    .get(actor.id, windowStart) as { cnt: number };

  // Sent count: messages FROM the acting address in the window.
  const sentCountRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM messages
       WHERE sender_address_id = ?
         AND created_at_ms >= ?`
    )
    .get(actor.id, windowStart) as { cnt: number };

  // Response rate: fraction of received messages in the window that have
  // at least one reply authored by the actor (parent_message_id chain).
  // Replies outside the window still count — the window scopes the
  // denominator (received messages), not the reply timing.
  const respondedRow = db
    .prepare(
      `SELECT COUNT(DISTINCT d.id) AS cnt
       FROM deliveries d
       JOIN messages m ON m.id = d.message_id
       WHERE d.recipient_address_id = ?
         AND m.created_at_ms >= ?
         AND EXISTS (
           SELECT 1 FROM messages m2
           WHERE m2.sender_address_id = ?
             AND m2.parent_message_id = m.id
         )`
    )
    .get(actor.id, windowStart, actor.id) as { cnt: number };
  const responseRate =
    inboxCountRow.cnt > 0 ? respondedRow.cnt / inboxCountRow.cnt : 0;

  // Active conversations: distinct conversation_ids touched by the actor
  // inside the window, either as sender or as a delivery recipient.
  const activeConvRow = db
    .prepare(
      `SELECT COUNT(DISTINCT m.conversation_id) AS cnt
       FROM messages m
       LEFT JOIN deliveries d ON d.message_id = m.id
       WHERE m.created_at_ms >= ?
         AND (m.sender_address_id = ? OR d.recipient_address_id = ?)`
    )
    .get(windowStart, actor.id, actor.id) as { cnt: number };

  // Top senders: addresses that sent TO the actor most in the window.
  // Compose the address string from addresses.local_part + host — there
  // is no `address` column on the addresses table (see 001-init.sql).
  const topSenderRows = db
    .prepare(
      `SELECT a.local_part AS local_part, a.host AS host, COUNT(*) AS cnt
       FROM deliveries d
       JOIN messages m ON m.id = d.message_id
       JOIN addresses a ON a.id = m.sender_address_id
       WHERE d.recipient_address_id = ?
         AND m.created_at_ms >= ?
       GROUP BY a.id
       ORDER BY cnt DESC, a.local_part ASC, a.host ASC
       LIMIT 5`
    )
    .all(actor.id, windowStart) as Array<{
    local_part: string;
    host: string;
    cnt: number;
  }>;

  // Top recipients: addresses the actor sent TO most in the window.
  const topRecipientRows = db
    .prepare(
      `SELECT a.local_part AS local_part, a.host AS host, COUNT(*) AS cnt
       FROM deliveries d
       JOIN messages m ON m.id = d.message_id
       JOIN addresses a ON a.id = d.recipient_address_id
       WHERE m.sender_address_id = ?
         AND m.created_at_ms >= ?
       GROUP BY a.id
       ORDER BY cnt DESC, a.local_part ASC, a.host ASC
       LIMIT 5`
    )
    .all(actor.id, windowStart) as Array<{
    local_part: string;
    host: string;
    cnt: number;
  }>;

  const response: AnalyticsOverviewResponse = {
    window,
    window_start_ts: windowStart,
    window_end_ts: now,
    inbox_count: inboxCountRow.cnt,
    sent_count: sentCountRow.cnt,
    response_rate: responseRate,
    active_conversations: activeConvRow.cnt,
    top_senders: topSenderRows.map((r) => ({
      address: `${r.local_part}@${r.host}`,
      count: r.cnt,
    })),
    top_recipients: topRecipientRows.map((r) => ({
      address: `${r.local_part}@${r.host}`,
      count: r.cnt,
    })),
  };

  return c.json(response);
});
