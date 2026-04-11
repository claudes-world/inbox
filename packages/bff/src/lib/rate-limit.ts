/**
 * In-memory token-bucket rate limiter for the Inbox BFF.
 *
 * Single-node only — buckets live in process memory. Multi-node deployments
 * would need Redis or similar shared state. For v1, Inbox runs as one process
 * per host, so an in-memory map is sufficient and avoids an extra dependency.
 *
 * Algorithm
 * ---------
 * Classic token bucket. Each key owns a bucket of `capacity` tokens.
 * Tokens refill at `refillRate` tokens-per-second (continuously — we compute
 * elapsed time on each request and top up lazily). Each request costs one
 * token. If the bucket has less than one token available, the request is
 * rejected with HTTP 429 and a `Retry-After` header whose value is the
 * ceiling of the seconds until one full token would be available.
 *
 * Placement in the middleware stack
 * ---------------------------------
 * The limiter keys on the `X-Inbox-Address` header (matching the actor
 * header used throughout the BFF). Requests without the header bypass the
 * limiter entirely — `requireActor()` inside each route handler will turn
 * those into 400s, and an unauthenticated flood cannot pollute the per-key
 * bucket map because no key is ever derived.
 *
 * Health + OpenAPI spec + signed file-download tickets are NOT rate limited.
 * Health must always respond for external monitors, the OpenAPI document is
 * static and cheap to serve, and file-download tickets are intrinsically
 * rate-limited by their 60s single-use TTL. Those endpoints simply don't
 * have the middleware mounted.
 */
import type { Context, MiddlewareHandler } from "hono";

type Bucket = {
  /** Current fractional token count. Capped at `capacity`. */
  tokens: number;
  /** Epoch millis at which `tokens` was last refilled. */
  lastRefill: number;
};

export type RateLimitConfig = {
  /** Maximum tokens in the bucket. Also the burst allowance. */
  capacity: number;
  /** Tokens added per wall-clock second. */
  refillRate: number;
  /**
   * Derives the bucket key from the request context. Returning `null` tells
   * the limiter to skip this request entirely (no bucket lookup, no counter
   * decrement). Defaults to reading the `X-Inbox-Address` header.
   */
  keyFn?: (c: Context) => string | null;
};

/** Create a Hono middleware that enforces a token-bucket limit per key. */
export function createRateLimiter(config: RateLimitConfig): MiddlewareHandler {
  const { capacity, refillRate } = config;
  const keyFn =
    config.keyFn ?? ((c: Context) => c.req.header("X-Inbox-Address") ?? null);

  // Closed-over state: each middleware instance owns its own bucket map so
  // preset limiters (read vs mutation) stay isolated.
  const buckets = new Map<string, Bucket>();

  return async (c, next) => {
    const key = keyFn(c);
    if (!key) {
      // No key → skip rate limiting. Unauthenticated requests get rejected
      // by `requireActor()` inside the route handler with a 400.
      await next();
      return;
    }

    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket) {
      bucket = { tokens: capacity, lastRefill: now };
      buckets.set(key, bucket);
    } else {
      // Lazy refill: top up based on elapsed wall-clock time since the last
      // touch, clamped to the bucket capacity.
      const elapsedSec = Math.max(0, (now - bucket.lastRefill) / 1000);
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillRate);
      bucket.lastRefill = now;
    }

    if (bucket.tokens < 1) {
      // Seconds until enough tokens have refilled to serve one request.
      const secondsUntilOneToken = (1 - bucket.tokens) / refillRate;
      const retryAfter = Math.max(1, Math.ceil(secondsUntilOneToken));
      c.header("Retry-After", String(retryAfter));
      return c.json(
        {
          error: `rate_limited: ${retryAfter}s until next request allowed for ${key}`,
          details: {
            code: "rate_limited",
            key,
            retry_after_seconds: retryAfter,
          },
        },
        429,
      );
    }

    bucket.tokens -= 1;
    await next();
  };
}

// ---------------------------------------------------------------------------
// Preset limiters
// ---------------------------------------------------------------------------
//
// Two tiers: loose for reads (listing / fetching), strict for mutations
// (sending / replying). Values chosen to comfortably absorb bursty agent
// workloads while still protecting the BFF from a runaway loop.

/** Reads: 60-request burst, 10 req/s sustained. */
export const readLimiter = createRateLimiter({
  capacity: 60,
  refillRate: 10,
});

/** Mutations: 20-request burst, 5 req/s sustained. */
export const mutationLimiter = createRateLimiter({
  capacity: 20,
  refillRate: 5,
});
