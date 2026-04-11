/**
 * Shared helpers for BFF route handlers.
 *
 * Provides error envelope construction, actor resolution from headers,
 * and common query parameter parsing.
 */
import type { Context } from "hono";
import { resolveActor } from "./db.js";

/**
 * Build a JSON error envelope matching the @inbox/contracts ErrorEnvelope shape.
 */
export function errorEnvelope(
  code: string,
  message: string,
  target: string | null = null,
  details: unknown = null
) {
  return {
    ok: false as const,
    error: { code, message, target, details },
  };
}

/**
 * Extract the acting address from request headers or query params.
 * Returns the address string or null.
 */
export function getActorAddress(c: Context): string | null {
  // Header takes priority, fall back to query param
  const fromHeader = c.req.header("X-Inbox-Address");
  if (fromHeader) return fromHeader;

  const fromQuery = c.req.query("address");
  if (fromQuery) return fromQuery;

  return null;
}

/**
 * Resolve the acting address and return the address row.
 * On failure, sets the response and returns null.
 */
export function requireActor(c: Context) {
  const address = getActorAddress(c);
  if (!address) {
    return {
      actor: null as null,
      errorResponse: c.json(
        errorEnvelope(
          "invalid_argument",
          "X-Inbox-Address header or address query param is required",
          "address"
        ),
        400
      ),
    };
  }

  const result = resolveActor(address);
  if ("error" in result) {
    return {
      actor: null as null,
      errorResponse: c.json(
        errorEnvelope(result.error.code, result.error.message, result.error.target),
        result.status as 400 | 403 | 404
      ),
    };
  }

  return { actor: result, errorResponse: null };
}

/**
 * Parse a limit query parameter. Defaults to 50, clamped to [1, 200].
 */
export function parseLimit(c: Context): number {
  const raw = c.req.query("limit");
  if (!raw) return 50;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 1) return 50;
  return Math.min(n, 200);
}
