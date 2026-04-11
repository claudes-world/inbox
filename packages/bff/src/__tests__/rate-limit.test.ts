/**
 * Tests for the in-memory token-bucket rate limiter.
 *
 * We drive the middleware in two complementary ways:
 *   1. Directly, by mounting a custom limiter on a throwaway Hono app. This
 *      lets us pick tiny capacities + use fake timers without touching real
 *      routes or the database.
 *   2. Through the real `app` instance for the health-bypass test, to prove
 *      the production wiring doesn't mount a limiter on /health.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { app } from "../app.js";
import { createRateLimiter } from "../lib/rate-limit.js";

/** Build a minimal app that runs `limiter` in front of a trivial route. */
function makeTestApp(limiter: ReturnType<typeof createRateLimiter>) {
  const a = new Hono();
  a.use("/probe", limiter);
  a.get("/probe", (c) => c.json({ ok: true }));
  return a;
}

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests while tokens remain", async () => {
    const limiter = createRateLimiter({ capacity: 3, refillRate: 1 });
    const a = makeTestApp(limiter);

    const headers = { "X-Inbox-Address": "alice@vps-1" };
    const r1 = await a.request("/probe", { headers });
    const r2 = await a.request("/probe", { headers });
    const r3 = await a.request("/probe", { headers });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
  });

  it("returns 429 with Retry-After once the bucket is drained", async () => {
    const limiter = createRateLimiter({ capacity: 2, refillRate: 1 });
    const a = makeTestApp(limiter);
    const headers = { "X-Inbox-Address": "alice@vps-1" };

    await a.request("/probe", { headers });
    await a.request("/probe", { headers });
    const blocked = await a.request("/probe", { headers });

    expect(blocked.status).toBe(429);
    const retryAfter = blocked.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);

    const body = (await blocked.json()) as {
      error: string;
      details: { code: string; retry_after_seconds: number };
    };
    expect(body.details.code).toBe("rate_limited");
    expect(body.details.retry_after_seconds).toBe(Number(retryAfter));
  });

  it("refills tokens as wall-clock time advances", async () => {
    const limiter = createRateLimiter({ capacity: 2, refillRate: 2 }); // 2 tok/sec
    const a = makeTestApp(limiter);
    const headers = { "X-Inbox-Address": "alice@vps-1" };

    // Drain the bucket.
    await a.request("/probe", { headers });
    await a.request("/probe", { headers });
    const blocked = await a.request("/probe", { headers });
    expect(blocked.status).toBe(429);

    // Advance 1 second → 2 tokens refilled (capped at capacity=2).
    await vi.advanceTimersByTimeAsync(1000);

    const afterWait = await a.request("/probe", { headers });
    expect(afterWait.status).toBe(200);
  });

  it("keeps per-key buckets independent", async () => {
    const limiter = createRateLimiter({ capacity: 2, refillRate: 1 });
    const a = makeTestApp(limiter);

    // Drain Alice's bucket.
    await a.request("/probe", { headers: { "X-Inbox-Address": "alice@vps-1" } });
    await a.request("/probe", { headers: { "X-Inbox-Address": "alice@vps-1" } });
    const aliceBlocked = await a.request("/probe", {
      headers: { "X-Inbox-Address": "alice@vps-1" },
    });
    expect(aliceBlocked.status).toBe(429);

    // Bob still gets the full burst.
    const bob1 = await a.request("/probe", {
      headers: { "X-Inbox-Address": "bob@vps-1" },
    });
    const bob2 = await a.request("/probe", {
      headers: { "X-Inbox-Address": "bob@vps-1" },
    });
    expect(bob1.status).toBe(200);
    expect(bob2.status).toBe(200);
  });

  it("skips rate limiting when no key is derivable", async () => {
    const limiter = createRateLimiter({ capacity: 1, refillRate: 0.01 });
    const a = makeTestApp(limiter);

    // No X-Inbox-Address header → key is null → limiter is a no-op, so we
    // can blow past the single-token capacity without ever hitting 429.
    for (let i = 0; i < 10; i++) {
      const r = await a.request("/probe");
      expect(r.status).toBe(200);
    }
  });

  it("does not rate limit the /health endpoint even under a flood", async () => {
    // Use the real production `app` so we're testing the actual middleware
    // wiring, not a local setup. /health has no limiter mounted and should
    // always return 200.
    for (let i = 0; i < 100; i++) {
      const res = await app.request("/health", {
        headers: { "X-Inbox-Address": "flooder@vps-1" },
      });
      expect(res.status).toBe(200);
    }
  });
});
