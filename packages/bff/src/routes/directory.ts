import { Hono } from "hono";

export const directoryRoutes = new Hono();

directoryRoutes.get("/", (c) => {
  return c.json({ ok: true, items: [], returned_count: 0 });
});

directoryRoutes.get("/:address", (c) => {
  const address = c.req.param("address");
  return c.json({ ok: false, error: { code: "not_found", message: `${address} not found`, target: null, details: null } }, 404);
});

directoryRoutes.get("/:address/members", (c) => {
  const address = c.req.param("address");
  return c.json({ ok: false, error: { code: "not_found", message: `${address} not found`, target: null, details: null } }, 404);
});
