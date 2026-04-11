/**
 * OpenAPI 3.1 spec endpoint.
 *
 * Serves the generated OpenAPI document at GET /api/openapi.json. The
 * document is built lazily (see lib/openapi-registry.ts) so a registration
 * error surfaces as a 500 rather than a boot-time crash.
 */
import { Hono } from "hono";
import { getOpenApiDocument } from "../lib/openapi-registry.js";

export const openApiRoutes = new Hono();

openApiRoutes.get("/", (c) => {
  try {
    const doc = getOpenApiDocument();
    return c.json(doc);
  } catch (err) {
    console.error("[openapi] failed to build document:", err);
    return c.json(
      {
        error: "internal_error",
        details: {
          message: "failed to build OpenAPI document — see server logs",
        },
      },
      500
    );
  }
});
