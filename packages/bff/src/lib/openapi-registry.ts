/**
 * OpenAPI 3.1 registry for the Inbox BFF.
 *
 * Builds a single OpenAPI document lazily at first access, cached for the
 * lifetime of the process. The generator is driven by the annotated Zod
 * schemas exported from @inbox/contracts; this module's job is only to
 * register the paths and wire the schemas into responses.
 *
 * Design notes
 * ------------
 *
 * 1. Lazy init (DA amendment 6, mitigation for HIGH #4's spirit):
 *    building the document at top-level would make a malformed registration
 *    throw during module load, which tanks the whole route tree. We wrap
 *    the build in a memoized `getOpenApiDocument()` that the route handler
 *    calls, so the first request can return a 500 instead of the whole
 *    process crashing on boot.
 *
 * 2. /api/events is JSON, not SSE (DA amendment 5). The handler at
 *    `routes/events.ts` returns a regular JSON list; there's no
 *    `text/event-stream` content type. This module documents the endpoint
 *    with `application/json` only. Future maintainers: if you flip this to
 *    real SSE, update the content type below and add a follow-up note.
 *
 * 3. Library pin (DA amendment 4). `@asteasolutions/zod-to-openapi@7.3.0`
 *    is pinned exactly (no caret) in both `@inbox/contracts` and
 *    `@inbox/bff` package.json. Do not bump without re-verifying Zod 3
 *    compatibility.
 */
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  // Response schemas
  addressSummarySchema,
  deliveryEventListResponseSchema,
  directoryListResponseSchema,
  directoryMembersResponseSchema,
  directoryShowResponseSchema,
  errorEnvelopeSchema,
  errorResponseSchema,
  listResponseSchema,
  mutationResponseSchema,
  readResponseSchema,
  replyResponseSchema,
  sendResponseSchema,
  sentListResponseSchema,
  sentMutationResponseSchema,
  sentReadResponseSchema,
  threadResponseSchema,
  // Request / query schemas
  directoryQuerySchema,
  eventsQuerySchema,
  inboxQuerySchema,
  inboxReadQuerySchema,
  replyRequestSchema,
  sendRequestSchema,
  sentQuerySchema,
  threadQuerySchema,
} from "@inbox/contracts";

/** Shared header parameter: every authenticated endpoint requires this. */
const actorHeaderSchema = z.object({
  "x-inbox-address": z
    .string()
    .openapi({
      description:
        "Acting address in local@host format. Required on every endpoint except /health and /api/openapi.json.",
      example: "pm-alpha@vps-1",
    }),
});

/** Reusable error-response set for endpoints that can 400/404/500. */
function errorResponses(opts: {
  notFound?: boolean;
  conflict?: boolean;
}): Record<string, {
  description: string;
  content: { "application/json": { schema: typeof errorResponseSchema } };
}> {
  const base: Record<string, {
    description: string;
    content: { "application/json": { schema: typeof errorResponseSchema } };
  }> = {
    "400": {
      description: "Invalid request (bad query params, malformed JSON, invalid field values)",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    "500": {
      description: "Internal server error",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  };
  if (opts.notFound) {
    base["404"] = {
      description: "Resource not found",
      content: { "application/json": { schema: errorResponseSchema } },
    };
  }
  if (opts.conflict) {
    base["409"] = {
      description: "Request conflicts with current state",
      content: { "application/json": { schema: errorResponseSchema } },
    };
  }
  return base;
}

/** Build the registry — pure function so the test suite can re-invoke. */
function buildRegistry(): OpenAPIRegistry {
  const registry = new OpenAPIRegistry();

  // ------------------------------------------------------------------
  // Register reusable schemas under stable names.
  // ------------------------------------------------------------------
  registry.register("AddressSummary", addressSummarySchema);
  registry.register("ErrorEnvelope", errorEnvelopeSchema);
  registry.register("ErrorResponse", errorResponseSchema);
  registry.register("ListResponse", listResponseSchema);
  registry.register("ReadResponse", readResponseSchema);
  registry.register("SendRequest", sendRequestSchema);
  registry.register("SendResponse", sendResponseSchema);
  registry.register("ReplyRequest", replyRequestSchema);
  registry.register("ReplyResponse", replyResponseSchema);
  registry.register("MutationResponse", mutationResponseSchema);
  registry.register("SentListResponse", sentListResponseSchema);
  registry.register("SentReadResponse", sentReadResponseSchema);
  registry.register("SentMutationResponse", sentMutationResponseSchema);
  registry.register("ThreadResponse", threadResponseSchema);
  registry.register("DirectoryListResponse", directoryListResponseSchema);
  registry.register("DirectoryShowResponse", directoryShowResponseSchema);
  registry.register("DirectoryMembersResponse", directoryMembersResponseSchema);
  registry.register("DeliveryEventListResponse", deliveryEventListResponseSchema);

  // ------------------------------------------------------------------
  // /health — unauthenticated liveness probe.
  // ------------------------------------------------------------------
  registry.registerPath({
    method: "get",
    path: "/health",
    tags: ["system"],
    summary: "Liveness probe",
    responses: {
      "200": {
        description: "Service is up",
        content: {
          "application/json": {
            schema: z.object({
              ok: z.literal(true),
              service: z.string(),
            }),
          },
        },
      },
    },
  });

  // ------------------------------------------------------------------
  // /api/inbox — list, read, ack, hide, unhide
  // ------------------------------------------------------------------
  registry.registerPath({
    method: "get",
    path: "/api/inbox",
    tags: ["inbox"],
    summary: "List received messages",
    request: { headers: actorHeaderSchema, query: inboxQuerySchema },
    responses: {
      "200": {
        description: "List of inbox items",
        content: { "application/json": { schema: listResponseSchema } },
      },
      ...errorResponses({}),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/inbox/{messageId}",
    tags: ["inbox"],
    summary: "Read a received message",
    request: {
      headers: actorHeaderSchema,
      params: z.object({ messageId: z.string().openapi({ example: "msg_abc123" }) }),
      query: inboxReadQuerySchema,
    },
    responses: {
      "200": {
        description: "Full message content and delivery state",
        content: { "application/json": { schema: readResponseSchema } },
      },
      ...errorResponses({ notFound: true }),
    },
  });

  for (const op of ["ack", "hide", "unhide"] as const) {
    registry.registerPath({
      method: "post",
      path: `/api/inbox/{messageId}/${op}`,
      tags: ["inbox"],
      summary: `Mutate received message state (${op})`,
      request: {
        headers: actorHeaderSchema,
        params: z.object({ messageId: z.string() }),
      },
      responses: {
        "200": {
          description: `Message ${op} result`,
          content: { "application/json": { schema: mutationResponseSchema } },
        },
        ...errorResponses({ notFound: true }),
      },
    });
  }

  // ------------------------------------------------------------------
  // /api/send — create a new message
  // ------------------------------------------------------------------
  registry.registerPath({
    method: "post",
    path: "/api/send",
    tags: ["send"],
    summary: "Send a new message",
    request: {
      headers: actorHeaderSchema,
      body: {
        required: true,
        content: { "application/json": { schema: sendRequestSchema } },
      },
    },
    responses: {
      "200": {
        description: "Message created and delivered",
        content: { "application/json": { schema: sendResponseSchema } },
      },
      ...errorResponses({ conflict: true }),
    },
  });

  // ------------------------------------------------------------------
  // /api/reply/{messageId}
  // ------------------------------------------------------------------
  registry.registerPath({
    method: "post",
    path: "/api/reply/{messageId}",
    tags: ["send"],
    summary: "Reply to an existing message",
    request: {
      headers: actorHeaderSchema,
      params: z.object({ messageId: z.string() }),
      body: {
        required: true,
        content: { "application/json": { schema: replyRequestSchema } },
      },
    },
    responses: {
      "200": {
        description: "Reply created and delivered",
        content: { "application/json": { schema: replyResponseSchema } },
      },
      ...errorResponses({ notFound: true, conflict: true }),
    },
  });

  // ------------------------------------------------------------------
  // /api/sent — list, read, hide, unhide
  // ------------------------------------------------------------------
  registry.registerPath({
    method: "get",
    path: "/api/sent",
    tags: ["sent"],
    summary: "List sent messages",
    request: { headers: actorHeaderSchema, query: sentQuerySchema },
    responses: {
      "200": {
        description: "List of sent items",
        content: { "application/json": { schema: sentListResponseSchema } },
      },
      ...errorResponses({}),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/sent/{messageId}",
    tags: ["sent"],
    summary: "Read a sent message",
    request: {
      headers: actorHeaderSchema,
      params: z.object({ messageId: z.string() }),
    },
    responses: {
      "200": {
        description: "Sent message details",
        content: { "application/json": { schema: sentReadResponseSchema } },
      },
      ...errorResponses({ notFound: true }),
    },
  });

  for (const op of ["hide", "unhide"] as const) {
    registry.registerPath({
      method: "post",
      path: `/api/sent/{messageId}/${op}`,
      tags: ["sent"],
      summary: `Mutate sent message visibility (${op})`,
      request: {
        headers: actorHeaderSchema,
        params: z.object({ messageId: z.string() }),
      },
      responses: {
        "200": {
          description: `Sent ${op} result`,
          content: { "application/json": { schema: sentMutationResponseSchema } },
        },
        ...errorResponses({ notFound: true }),
      },
    });
  }

  // ------------------------------------------------------------------
  // /api/thread/{conversationId}
  // ------------------------------------------------------------------
  registry.registerPath({
    method: "get",
    path: "/api/thread/{conversationId}",
    tags: ["thread"],
    summary: "View a conversation thread",
    request: {
      headers: actorHeaderSchema,
      params: z.object({
        conversationId: z.string().openapi({ example: "cnv_abc123" }),
      }),
      query: threadQuerySchema,
    },
    responses: {
      "200": {
        description: "Thread items in chronological order",
        content: { "application/json": { schema: threadResponseSchema } },
      },
      ...errorResponses({ notFound: true }),
    },
  });

  // ------------------------------------------------------------------
  // /api/directory — list, show, members
  //
  // Note: the /directory/* routes do NOT require an actor header in the
  // current implementation (see routes/directory.ts), so we do not mark
  // the x-inbox-address header required here.
  // ------------------------------------------------------------------
  registry.registerPath({
    method: "get",
    path: "/api/directory",
    tags: ["directory"],
    summary: "List directory addresses",
    request: { query: directoryQuerySchema },
    responses: {
      "200": {
        description: "Directory entries matching the filter",
        content: { "application/json": { schema: directoryListResponseSchema } },
      },
      ...errorResponses({}),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/directory/{address}",
    tags: ["directory"],
    summary: "Show a single directory address",
    request: {
      params: z.object({
        address: z.string().openapi({ example: "pm-alpha@vps-1" }),
      }),
    },
    responses: {
      "200": {
        description: "Directory entry",
        content: { "application/json": { schema: directoryShowResponseSchema } },
      },
      ...errorResponses({ notFound: true }),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/directory/{address}/members",
    tags: ["directory"],
    summary: "List members of a group address",
    request: {
      params: z.object({
        address: z.string().openapi({ example: "list-dev@vps-1" }),
      }),
    },
    responses: {
      "200": {
        description: "Group members",
        content: { "application/json": { schema: directoryMembersResponseSchema } },
      },
      ...errorResponses({ notFound: true }),
    },
  });

  // ------------------------------------------------------------------
  // /api/events — delivery event inspector.
  //
  // DA amendment 5: this endpoint is JSON, NOT Server-Sent Events.
  // See routes/events.ts — it's a plain GET returning a JSON array of
  // delivery events. Do not mis-model as text/event-stream.
  // ------------------------------------------------------------------
  registry.registerPath({
    method: "get",
    path: "/api/events",
    tags: ["events"],
    summary: "Delivery event history (JSON, not SSE)",
    description:
      "Returns the delivery event history for the acting address. This is a regular JSON endpoint — NOT Server-Sent Events.",
    request: { headers: actorHeaderSchema, query: eventsQuerySchema },
    responses: {
      "200": {
        description: "Delivery events matching the filter",
        content: {
          "application/json": { schema: deliveryEventListResponseSchema },
        },
      },
      ...errorResponses({}),
    },
  });

  return registry;
}

/** Memoized OpenAPI document. Built lazily on first access. */
let cachedDocument: ReturnType<OpenApiGeneratorV31["generateDocument"]> | null = null;
let cachedError: Error | null = null;

export function getOpenApiDocument(): ReturnType<
  OpenApiGeneratorV31["generateDocument"]
> {
  if (cachedError) throw cachedError;
  if (cachedDocument) return cachedDocument;

  try {
    const registry = buildRegistry();
    const generator = new OpenApiGeneratorV31(registry.definitions);
    cachedDocument = generator.generateDocument({
      openapi: "3.1.0",
      info: {
        title: "Inbox BFF API",
        version: "0.10.0",
        description:
          "Messaging platform for agents. Every endpoint except /health and /api/openapi.json requires the `x-inbox-address` header.",
      },
    });
    return cachedDocument;
  } catch (err) {
    cachedError = err instanceof Error ? err : new Error(String(err));
    throw cachedError;
  }
}

/**
 * Reset the memoization — only intended for tests that need to force a
 * rebuild. Do not call from production code.
 */
export function __resetOpenApiCacheForTests(): void {
  cachedDocument = null;
  cachedError = null;
}
