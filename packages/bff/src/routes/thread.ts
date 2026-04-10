import { Hono } from "hono";

export const threadRoutes = new Hono();

threadRoutes.get("/:conversationId", (c) => {
  const conversationId = c.req.param("conversationId");
  return c.json({ ok: false, error: { code: "not_found", message: `Thread ${conversationId} not found`, target: null, details: null } }, 404);
});
