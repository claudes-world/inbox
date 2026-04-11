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
import { deliveryEventListResponseSchema } from "@inbox/contracts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function headers(address: string): HeadersInit {
  return {
    "X-Inbox-Address": address,
    "Content-Type": "application/json",
  };
}

async function get<T>(url: string, address: string): Promise<T> {
  const res = await fetch(url, { headers: headers(address) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const msg =
      body?.error?.message ?? `Request failed: ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

async function post<T>(
  url: string,
  address: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: headers(address),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const msg =
      data?.error?.message ?? `Request failed: ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

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
  return get(`/api/inbox${qs ? `?${qs}` : ""}`, address);
}

export function fetchMessage(
  address: string,
  messageId: string,
): Promise<ReadResponse> {
  return get(`/api/inbox/${messageId}`, address);
}

export function postAck(
  address: string,
  messageId: string,
): Promise<MutationResponse> {
  return post(`/api/inbox/${messageId}/ack`, address);
}

export function postHide(
  address: string,
  messageId: string,
): Promise<MutationResponse> {
  return post(`/api/inbox/${messageId}/hide`, address);
}

export function postUnhide(
  address: string,
  messageId: string,
): Promise<MutationResponse> {
  return post(`/api/inbox/${messageId}/unhide`, address);
}

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

export function fetchThread(
  address: string,
  conversationId: string,
): Promise<ThreadResponse> {
  return get(`/api/thread/${conversationId}?full=1`, address);
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
  return post("/api/send", address, payload);
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
  return post(`/api/reply/${messageId}`, address, payload);
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
  return get(`/api/sent${qs ? `?${qs}` : ""}`, address);
}

export function fetchSentMessage(
  address: string,
  messageId: string,
): Promise<SentReadResponse> {
  return get(`/api/sent/${messageId}`, address);
}

export function postSentHide(
  address: string,
  messageId: string,
): Promise<SentMutationResponse> {
  return post(`/api/sent/${messageId}/hide`, address);
}

export function postSentUnhide(
  address: string,
  messageId: string,
): Promise<SentMutationResponse> {
  return post(`/api/sent/${messageId}/unhide`, address);
}

// ---------------------------------------------------------------------------
// Events (delivery event inspector)
// ---------------------------------------------------------------------------

export interface EventFilters {
  message_id?: string;
  event_type?: string;
  limit?: number;
}

export async function fetchEvents(
  address: string,
  filters?: EventFilters,
): Promise<DeliveryEventListResponse> {
  const params = new URLSearchParams();
  if (filters?.message_id) params.set("message_id", filters.message_id);
  if (filters?.event_type) params.set("event_type", filters.event_type);
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  const raw = await get<unknown>(
    `/api/events${qs ? `?${qs}` : ""}`,
    address,
  );
  return deliveryEventListResponseSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

export function fetchDirectory(): Promise<DirectoryListResponse> {
  // Directory doesn't require actor address
  return get("/api/directory?listed=0", "system@local");
}

export function fetchDirectoryShow(
  address: string,
): Promise<DirectoryShowResponse> {
  return get(`/api/directory/${address}`, "system@local");
}

export function fetchDirectoryMembers(
  address: string,
): Promise<DirectoryMembersResponse> {
  return get(`/api/directory/${address}/members`, "system@local");
}
