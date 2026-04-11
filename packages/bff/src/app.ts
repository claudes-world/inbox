import { Hono } from "hono";
import { cors } from "hono/cors";
import { inboxRoutes } from "./routes/inbox.js";
import { sendRoutes } from "./routes/send.js";
import { replyRoutes } from "./routes/reply.js";
import { sentRoutes } from "./routes/sent.js";
import { threadRoutes } from "./routes/thread.js";
import { directoryRoutes } from "./routes/directory.js";
import { eventsRoutes } from "./routes/events.js";

export const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, service: "@inbox/bff" }));

app.route("/api/inbox", inboxRoutes);
app.route("/api/send", sendRoutes);
app.route("/api/reply", replyRoutes);
app.route("/api/sent", sentRoutes);
app.route("/api/thread", threadRoutes);
app.route("/api/directory", directoryRoutes);
app.route("/api/events", eventsRoutes);
