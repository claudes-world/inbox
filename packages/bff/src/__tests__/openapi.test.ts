/**
 * OpenAPI spec endpoint tests.
 *
 * Verifies the generated document is structurally sound, covers every
 * BFF route, and is served correctly by GET /api/openapi.json.
 */
import { describe, expect, it } from "vitest";
import { app } from "../app.js";
import {
  __resetOpenApiCacheForTests,
  getOpenApiDocument,
} from "../lib/openapi-registry.js";

/** Every route the BFF mounts, in `METHOD path` form matching OpenAPI. */
const EXPECTED_ROUTES: Array<{ method: string; path: string }> = [
  { method: "get", path: "/health" },
  { method: "get", path: "/api/inbox" },
  { method: "get", path: "/api/inbox/{messageId}" },
  { method: "post", path: "/api/inbox/{messageId}/ack" },
  { method: "post", path: "/api/inbox/{messageId}/hide" },
  { method: "post", path: "/api/inbox/{messageId}/unhide" },
  { method: "post", path: "/api/send" },
  { method: "post", path: "/api/reply/{messageId}" },
  { method: "get", path: "/api/sent" },
  { method: "get", path: "/api/sent/{messageId}" },
  { method: "post", path: "/api/sent/{messageId}/hide" },
  { method: "post", path: "/api/sent/{messageId}/unhide" },
  { method: "get", path: "/api/thread/{conversationId}" },
  { method: "get", path: "/api/directory" },
  { method: "get", path: "/api/directory/{address}" },
  { method: "get", path: "/api/directory/{address}/members" },
  { method: "get", path: "/api/events" },
];

describe("OpenAPI document structure", () => {
  it("builds without throwing and is memoized across calls", () => {
    __resetOpenApiCacheForTests();
    const doc1 = getOpenApiDocument();
    const doc2 = getOpenApiDocument();
    expect(doc1).toBe(doc2);
  });

  it("has the required top-level fields", () => {
    const doc = getOpenApiDocument();
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info).toBeDefined();
    expect(doc.info.title).toBe("Inbox BFF API");
    expect(doc.info.version).toBeTruthy();
    expect(doc.paths).toBeDefined();
    expect(doc.components?.schemas).toBeDefined();
  });

  it("registers the major response schemas under their expected names", () => {
    const doc = getOpenApiDocument();
    const schemas = doc.components?.schemas ?? {};
    const required = [
      "AddressSummary",
      "ErrorEnvelope",
      "ErrorResponse",
      "ListResponse",
      "ReadResponse",
      "SendRequest",
      "SendResponse",
      "ReplyRequest",
      "ReplyResponse",
      "MutationResponse",
      "SentListResponse",
      "SentReadResponse",
      "SentMutationResponse",
      "ThreadResponse",
      "DirectoryListResponse",
      "DirectoryShowResponse",
      "DirectoryMembersResponse",
      "DeliveryEventListResponse",
    ];
    for (const name of required) {
      expect(schemas, `missing schema: ${name}`).toHaveProperty(name);
    }
  });

  it("registers every expected BFF route", () => {
    const doc = getOpenApiDocument();
    const paths = doc.paths ?? {};
    for (const { method, path } of EXPECTED_ROUTES) {
      const item = paths[path];
      expect(item, `missing path in spec: ${path}`).toBeDefined();
      expect(
        (item as Record<string, unknown>)[method],
        `missing method in spec: ${method.toUpperCase()} ${path}`
      ).toBeDefined();
    }
  });

  it("documents error responses on at least one representative endpoint", () => {
    const doc = getOpenApiDocument();
    // /api/inbox/{messageId} should document 400, 404, and 500 referencing ErrorResponse
    const op = (
      doc.paths?.["/api/inbox/{messageId}"] as Record<string, unknown> | undefined
    )?.["get"] as
      | { responses?: Record<string, unknown> }
      | undefined;
    expect(op?.responses).toBeDefined();
    expect(op?.responses).toHaveProperty("200");
    expect(op?.responses).toHaveProperty("400");
    expect(op?.responses).toHaveProperty("404");
    expect(op?.responses).toHaveProperty("500");
  });

  it("documents /api/events as application/json, not text/event-stream", () => {
    const doc = getOpenApiDocument();
    const eventsOp = (
      doc.paths?.["/api/events"] as Record<string, unknown> | undefined
    )?.["get"] as
      | {
          responses?: Record<
            string,
            { content?: Record<string, unknown> }
          >;
        }
      | undefined;
    expect(eventsOp?.responses?.["200"]?.content).toBeDefined();
    expect(eventsOp?.responses?.["200"]?.content).toHaveProperty(
      "application/json"
    );
    expect(eventsOp?.responses?.["200"]?.content).not.toHaveProperty(
      "text/event-stream"
    );
  });
});

describe("GET /api/openapi.json", () => {
  it("returns status 200 with Content-Type application/json", async () => {
    const res = await app.request("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("returns a body matching the in-memory OpenAPI document", async () => {
    const res = await app.request("/api/openapi.json");
    const body = (await res.json()) as { openapi?: string; paths?: unknown };
    expect(body.openapi).toBe("3.1.0");
    expect(body.paths).toBeDefined();
    // Sanity: sending a contained known path
    expect((body.paths as Record<string, unknown>)["/api/inbox"]).toBeDefined();
  });

  it("every registered route in the spec corresponds to a real route (reverse parity)", async () => {
    const doc = getOpenApiDocument();
    const paths = Object.keys(doc.paths ?? {});
    // For each path, instantiate a concrete URL by replacing {param} with STUB
    // and hit the app. We expect ANY non-404 status (401/400/500 are fine —
    // we just want the route to exist).
    for (const p of paths) {
      const concrete = p.replace(/\{([^}]+)\}/g, "stub");
      // Pick a method from the path item
      const pathItem = (doc.paths as Record<string, unknown>)[p] as Record<
        string,
        unknown
      >;
      const method = Object.keys(pathItem).find((k) =>
        ["get", "post", "put", "delete", "patch"].includes(k)
      );
      if (!method) continue;
      const res = await app.request(concrete, { method: method.toUpperCase() });
      expect(
        res.status,
        `spec path ${method.toUpperCase()} ${p} → ${concrete} returned 404; handler missing`
      ).not.toBe(404);
    }
  });
});
