import { Hono } from "hono";
import { cors } from "hono/cors";
import { inboxRoutes } from "./routes/inbox.js";
import { sendRoutes } from "./routes/send.js";
import { replyRoutes } from "./routes/reply.js";
import { sentRoutes } from "./routes/sent.js";
import { threadRoutes } from "./routes/thread.js";
import { directoryRoutes } from "./routes/directory.js";
import { eventsRoutes } from "./routes/events.js";
import { openApiRoutes } from "./routes/openapi.js";
import { readLimiter, mutationLimiter } from "./lib/rate-limit.js";

export const app = new Hono();

app.use("*", cors());

// Liveness probe. Intentionally NOT rate limited — external monitors and
// orchestrators must always be able to ping this.
app.get("/health", (c) => c.json({ ok: true, service: "@inbox/bff" }));

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
//
// Mounted per route group so the limiter only sees traffic for endpoints
// that should be throttled. Middleware runs before the per-route
// `requireActor()` check, which is fine — missing headers skip the limiter
// entirely and are rejected downstream with a 400.
//
// Endpoints intentionally NOT rate limited:
//   * /health              — liveness probe (see above)
//   * /api/openapi.json    — static spec, cheap to serve
//   * /api/directory/*     — no per-actor keying in current impl; reads only
//   * file download tickets — ticket TTL (60s, single-use) is the rate limit
app.use("/api/inbox/*", readLimiter);
app.use("/api/sent/*", readLimiter);
app.use("/api/thread/*", readLimiter);
app.use("/api/events/*", readLimiter);

app.use("/api/send/*", mutationLimiter);
app.use("/api/reply/*", mutationLimiter);

app.route("/api/inbox", inboxRoutes);
app.route("/api/send", sendRoutes);
app.route("/api/reply", replyRoutes);
app.route("/api/sent", sentRoutes);
app.route("/api/thread", threadRoutes);
app.route("/api/directory", directoryRoutes);
app.route("/api/events", eventsRoutes);
app.route("/api/openapi.json", openApiRoutes);
