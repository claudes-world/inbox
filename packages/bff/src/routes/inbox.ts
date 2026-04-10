import { Hono } from "hono";

export const inboxRoutes = new Hono();

inboxRoutes.get("/", (c) => {
  return c.json({ ok: true, items: [], limit: 50, returned_count: 0 });
});

inboxRoutes.get("/:messageId", (c) => {
  const messageId = c.req.param("messageId");
  return c.json({ ok: false, error: { code: "not_found", message: `${messageId} not found`, target: null, details: null } }, 404);
});

inboxRoutes.post("/:messageId/ack", (c) => {
  const messageId = c.req.param("messageId");
  return c.json({ ok: false, error: { code: "not_found", message: `${messageId} not found`, target: null, details: null } }, 404);
});

inboxRoutes.post("/:messageId/hide", (c) => {
  const messageId = c.req.param("messageId");
  return c.json({ ok: false, error: { code: "not_found", message: `${messageId} not found`, target: null, details: null } }, 404);
});

inboxRoutes.post("/:messageId/unhide", (c) => {
  const messageId = c.req.param("messageId");
  return c.json({ ok: false, error: { code: "not_found", message: `${messageId} not found`, target: null, details: null } }, 404);
});
