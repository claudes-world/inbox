/**
 * API client layer for the Inbox BFF.
 *
 * Every function sets the X-Inbox-Address header to the acting identity.
 * Returns typed responses from @inbox/contracts.
 */
import type {
  ListResponse,
  ReadResponse,
  ThreadResponse,
  SendResponse,
  ReplyResponse,
  SentListResponse,
  SentReadResponse,
  MutationResponse,
  SentMutationResponse,
  DirectoryListResponse,
  DirectoryShowResponse,
  DirectoryMembersResponse,
  DeliveryEventListResponse,
} from "@inbox/contracts";
import {
  deliveryEventListResponseSchema,
  directoryListResponseSchema,
  directoryMembersResponseSchema,
  directoryShowResponseSchema,
  listResponseSchema,
  mutationResponseSchema,
  readResponseSchema,
  replyRequestSchema,
  replyResponseSchema,
  sendRequestSchema,
  sendResponseSchema,
  sentListResponseSchema,
  sentMutationResponseSchema,
  sentReadResponseSchema,
  threadResponseSchema,
} from "@inbox/contracts";
import { parsedGet, parsedPost } from "./lib/contract-fetch.js";

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export interface InboxFilters {
  state?: string;
  visibility?: string;
}

export function fetchInbox(
  address: string,
  filters?: InboxFilters,
): Promise<ListResponse> {
  const params = new URLSearchParams();
  if (filters?.state && filters.state !== "any")
    params.set("state", filters.state);
  if (filters?.visibility && filters.visibility !== "any")
    params.set("visibility", filters.visibility);
  const qs = params.toString();
  return parsedGet(
    `/api/inbox${qs ? `?${qs}` : ""}`,
    address,
    listResponseSchema,
  );
}

export function fetchMessage(
  address: string,
  messageId: string,
): Promise<ReadResponse> {
  return parsedGet(`/api/inbox/${messageId}`, address, readResponseSchema);
}

export function postAck(
  address: string,
  messageId: string,
): Promise<MutationResponse> {
  return parsedPost(
    `/api/inbox/${messageId}/ack`,
    address,
    mutationResponseSchema,
  );
}

export function postHide(
  address: string,
  messageId: string,
): Promise<MutationResponse> {
  return parsedPost(
    `/api/inbox/${messageId}/hide`,
    address,
    mutationResponseSchema,
  );
}

export function postUnhide(
  address: string,
  messageId: string,
): Promise<MutationResponse> {
  return parsedPost(
    `/api/inbox/${messageId}/unhide`,
    address,
    mutationResponseSchema,
  );
}

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

export function fetchThread(
  address: string,
  conversationId: string,
): Promise<ThreadResponse> {
  return parsedGet(
    `/api/thread/${conversationId}?full=1`,
    address,
    threadResponseSchema,
  );
}

// ---------------------------------------------------------------------------
// Send / Reply
// ---------------------------------------------------------------------------

export interface SendPayload {
  to: string;
  cc?: string;
  subject?: string;
  body?: string;
  urgency?: string;
  references?: Array<{ kind: string; value: string }>;
}

export function postSend(
  address: string,
  payload: SendPayload,
): Promise<SendResponse> {
  // Validate the request body client-side before the network roundtrip.
  // Throws ZodError on a UI-constructed bad request (NOT drift — the drift
  // error class is reserved for response validation failures).
  const validatedBody = sendRequestSchema.parse(payload);
  return parsedPost(
    "/api/send",
    address,
    sendResponseSchema,
    validatedBody,
  );
}

export interface ReplyPayload {
  body: string;
  subject?: string;
  urgency?: string;
}

export function postReply(
  address: string,
  messageId: string,
  payload: ReplyPayload,
): Promise<ReplyResponse> {
  // Validate client-side, same rationale as postSend above.
  const validatedBody = replyRequestSchema.parse(payload);
  return parsedPost(
    `/api/reply/${messageId}`,
    address,
    replyResponseSchema,
    validatedBody,
  );
}

// ---------------------------------------------------------------------------
// Sent
// ---------------------------------------------------------------------------

export interface SentFilters {
  visibility?: string;
}

export function fetchSent(
  address: string,
  filters?: SentFilters,
): Promise<SentListResponse> {
  const params = new URLSearchParams();
  if (filters?.visibility && filters.visibility !== "any")
    params.set("visibility", filters.visibility);
  const qs = params.toString();
  return parsedGet(
    `/api/sent${qs ? `?${qs}` : ""}`,
    address,
    sentListResponseSchema,
  );
}

export function fetchSentMessage(
  address: string,
  messageId: string,
): Promise<SentReadResponse> {
  return parsedGet(
    `/api/sent/${messageId}`,
    address,
    sentReadResponseSchema,
  );
}

export function postSentHide(
  address: string,
  messageId: string,
): Promise<SentMutationResponse> {
  return parsedPost(
    `/api/sent/${messageId}/hide`,
    address,
    sentMutationResponseSchema,
  );
}

export function postSentUnhide(
  address: string,
  messageId: string,
): Promise<SentMutationResponse> {
  return parsedPost(
    `/api/sent/${messageId}/unhide`,
    address,
    sentMutationResponseSchema,
  );
}

// ---------------------------------------------------------------------------
// Events (delivery event inspector)
// ---------------------------------------------------------------------------

export interface EventFilters {
  message_id?: string;
  event_type?: string;
  limit?: number;
}

export function fetchEvents(
  address: string,
  filters?: EventFilters,
): Promise<DeliveryEventListResponse> {
  const params = new URLSearchParams();
  if (filters?.message_id) params.set("message_id", filters.message_id);
  if (filters?.event_type) params.set("event_type", filters.event_type);
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return parsedGet(
    `/api/events${qs ? `?${qs}` : ""}`,
    address,
    deliveryEventListResponseSchema,
  );
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

export function fetchDirectory(): Promise<DirectoryListResponse> {
  // Directory doesn't require actor address
  return parsedGet(
    "/api/directory?listed=0",
    "system@local",
    directoryListResponseSchema,
  );
}

export function fetchDirectoryShow(
  address: string,
): Promise<DirectoryShowResponse> {
  return parsedGet(
    `/api/directory/${address}`,
    "system@local",
    directoryShowResponseSchema,
  );
}

export function fetchDirectoryMembers(
  address: string,
): Promise<DirectoryMembersResponse> {
  return parsedGet(
    `/api/directory/${address}/members`,
    "system@local",
    directoryMembersResponseSchema,
  );
}
