/**
 * Unit tests for the contract-validated fetch layer.
 *
 * Covers the ContractDriftError class, parsedGet/parsedPost helpers, the
 * reportContractDrift observability sink, and representative fetchers
 * from api.ts (one invalid + one valid case per read fetcher).
 *
 * global.fetch is stubbed with vi.fn() — MSW is available in the
 * package but not yet wired into vitest, and a fetch stub is far
 * cheaper than a server setup for this layer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listFixture,
  readFixture,
  sentListFixture,
  sentReadFixture,
  threadFixture,
  directoryListFixture,
  directoryShowFixture,
  directoryMembersFixture,
  deliveryEventListFixture,
  sendFixture,
  replyFixture,
  ackFixture,
  hideFixture,
  sentHideFixture,
} from "@inbox/contracts/fixtures";
import { listResponseSchema } from "@inbox/contracts";
import {
  ContractDriftError,
  parsedGet,
  parsedPost,
  reportContractDrift,
} from "../lib/contract-fetch.js";
import {
  fetchAnalyticsOverview,
  fetchInbox,
  fetchMessage,
  fetchSent,
  fetchSentMessage,
  fetchThread,
  fetchDirectory,
  fetchDirectoryShow,
  fetchDirectoryMembers,
  fetchEvents,
  postAck,
  postHide,
  postUnhide,
  postSend,
  postReply,
  postSentHide,
  postSentUnhide,
} from "../api.js";

// ---------------------------------------------------------------------------
// fetch stubbing helpers
// ---------------------------------------------------------------------------

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  const status = init.status ?? 200;
  const response = {
    ok,
    status,
    statusText: ok ? "OK" : "ERR",
    json: async () => body,
  } as unknown as Response;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

beforeEach(() => {
  // Reset any stubs/spies left over from prior tests
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// ContractDriftError shape (Amendment 4 — stable .name discriminator)
// ---------------------------------------------------------------------------

describe("ContractDriftError", () => {
  it("uses .name = 'ContractDriftError' for cross-bundle identity", () => {
    const zodResult = listResponseSchema.safeParse({ ok: true });
    expect(zodResult.success).toBe(false);
    if (zodResult.success) return;
    const err = new ContractDriftError("/api/inbox", zodResult.error, { ok: true });
    // Stable discriminator for React Query retry predicate and error
    // boundaries — do NOT rely on `instanceof` alone across bundles.
    expect(err.name).toBe("ContractDriftError");
  });

  it("has retryable = false so transient retries never fire on drift", () => {
    const zodResult = listResponseSchema.safeParse({ ok: true });
    if (zodResult.success) throw new Error("unexpected success");
    const err = new ContractDriftError("/api/inbox", zodResult.error, { ok: true });
    expect(err.retryable).toBe(false);
  });

  it("preserves url, raw response, and issues for diagnostics", () => {
    const raw = { ok: true, whoops: 1 };
    const zodResult = listResponseSchema.safeParse(raw);
    if (zodResult.success) throw new Error("unexpected success");
    const err = new ContractDriftError("/api/inbox", zodResult.error, raw);
    expect(err.url).toBe("/api/inbox");
    expect(err.raw).toEqual(raw);
    expect(err.issues.length).toBeGreaterThan(0);
  });

  it("extends Error (error boundaries and React Query accept it)", () => {
    const zodResult = listResponseSchema.safeParse({ ok: true });
    if (zodResult.success) throw new Error("unexpected success");
    const err = new ContractDriftError("/api/inbox", zodResult.error, { ok: true });
    expect(err instanceof Error).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reportContractDrift observability sink
// ---------------------------------------------------------------------------

describe("reportContractDrift", () => {
  it("dev mode: logs to console.error with url + first issues", () => {
    // vitest defaults to test mode which has import.meta.env.DEV === true,
    // so we just spy and invoke.
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const zodResult = listResponseSchema.safeParse({ ok: true });
    if (zodResult.success) throw new Error("unexpected success");
    const err = new ContractDriftError("/api/inbox", zodResult.error, { ok: true });
    reportContractDrift(err);
    expect(consoleSpy).toHaveBeenCalledWith(
      "[contract-drift]",
      "/api/inbox",
      expect.any(Array),
      expect.anything(),
    );
  });

  it("prod mode: dispatches a 'contract-drift' CustomEvent on window", () => {
    // Simulate prod by stubbing import.meta.env.DEV → false via vi.stubEnv.
    // vi.stubEnv accepts booleans; we set DEV=false and PROD=true.
    vi.stubEnv("DEV", false);
    vi.stubEnv("PROD", true);
    const dispatchSpy = vi
      .spyOn(window, "dispatchEvent")
      .mockImplementation(() => true);
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    try {
      const zodResult = listResponseSchema.safeParse({ ok: true });
      if (zodResult.success) throw new Error("unexpected success");
      const err = new ContractDriftError(
        "/api/inbox",
        zodResult.error,
        { ok: true },
      );
      reportContractDrift(err);
      // Prod mode skips console.error noise
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(dispatchSpy).toHaveBeenCalled();
      const firstCall = dispatchSpy.mock.calls[0];
      if (!firstCall) throw new Error("expected dispatchEvent call");
      const event = firstCall[0] as CustomEvent;
      expect(event.type).toBe("contract-drift");
      expect((event.detail as { url: string }).url).toBe("/api/inbox");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

// ---------------------------------------------------------------------------
// parsedGet behavior
// ---------------------------------------------------------------------------

describe("parsedGet", () => {
  it("happy path — valid response parses cleanly", async () => {
    mockFetchOnce(listFixture);
    const result = await parsedGet(
      "/api/inbox",
      "pm-alpha@vps-1",
      listResponseSchema,
    );
    expect(result).toEqual(listFixture);
  });

  it("missing required field — throws ContractDriftError", async () => {
    // Drop items[0].message_id from the canonical fixture
    const drifted = {
      ...listFixture,
      items: listFixture.items.map((item, idx) =>
        idx === 0 ? { ...item, message_id: undefined } : item,
      ),
    };
    mockFetchOnce(drifted);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      parsedGet("/api/inbox", "pm-alpha@vps-1", listResponseSchema),
    ).rejects.toMatchObject({ name: "ContractDriftError" });
    consoleSpy.mockRestore();
  });

  it("wrong enum value — throws ContractDriftError with path pointing at bad field", async () => {
    const drifted = {
      ...listFixture,
      items: listFixture.items.map((item, idx) =>
        idx === 0
          ? { ...item, engagement_state: "banana" as unknown as "unread" }
          : item,
      ),
    };
    mockFetchOnce(drifted);
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await parsedGet("/api/inbox", "pm-alpha@vps-1", listResponseSchema);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContractDriftError);
      const drift = err as ContractDriftError;
      expect(drift.issues.some((i) => i.path.includes("engagement_state"))).toBe(true);
    }
  });

  it("empty list — parses cleanly, items is []", async () => {
    const empty = { ok: true as const, items: [], limit: 50, returned_count: 0 };
    mockFetchOnce(empty);
    const result = await parsedGet(
      "/api/inbox",
      "pm-alpha@vps-1",
      listResponseSchema,
    );
    expect(result.items).toEqual([]);
    expect(result.returned_count).toBe(0);
  });

  it("extra fields are silently stripped (default Zod .strip() policy)", async () => {
    const withExtras = {
      ...listFixture,
      _debug: "hello",
      items: listFixture.items.map((item) => ({ ...item, _extra: 1 })),
    };
    mockFetchOnce(withExtras);
    const result = await parsedGet(
      "/api/inbox",
      "pm-alpha@vps-1",
      listResponseSchema,
    );
    expect((result as unknown as { _debug?: string })._debug).toBeUndefined();
    expect((result.items[0] as unknown as { _extra?: number })._extra).toBeUndefined();
  });

  it("transport 500 error throws a regular Error (not ContractDriftError)", async () => {
    mockFetchOnce({ error: { message: "boom" } }, { ok: false, status: 500 });
    await expect(
      parsedGet("/api/inbox", "pm-alpha@vps-1", listResponseSchema),
    ).rejects.toThrow("boom");
  });
});

// ---------------------------------------------------------------------------
// parsedPost behavior
// ---------------------------------------------------------------------------

describe("parsedPost", () => {
  it("posts a body and parses a valid response", async () => {
    const responseBody = { ok: true as const, items: [], limit: 50, returned_count: 0 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => responseBody,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    await parsedPost(
      "/api/dummy",
      "pm-alpha@vps-1",
      listResponseSchema,
      { hello: "world" },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dummy",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ hello: "world" }),
      }),
    );
  });

  it("drift on post response throws ContractDriftError", async () => {
    mockFetchOnce({ ok: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      parsedPost("/api/dummy", "pm-alpha@vps-1", listResponseSchema),
    ).rejects.toMatchObject({ name: "ContractDriftError" });
  });
});

// ---------------------------------------------------------------------------
// Migrated api.ts fetchers — smoke tests (valid + drift per fetcher)
// ---------------------------------------------------------------------------

describe("migrated fetchers — valid path", () => {
  it("fetchInbox parses listFixture", async () => {
    mockFetchOnce(listFixture);
    const res = await fetchInbox("pm-alpha@vps-1");
    expect(res).toEqual(listFixture);
  });

  it("fetchMessage parses readFixture", async () => {
    mockFetchOnce(readFixture);
    const res = await fetchMessage("pm-alpha@vps-1", "msg_read_001");
    expect(res).toEqual(readFixture);
  });

  it("fetchSent parses sentListFixture", async () => {
    mockFetchOnce(sentListFixture);
    const res = await fetchSent("pm-alpha@vps-1");
    expect(res).toEqual(sentListFixture);
  });

  it("fetchSentMessage parses sentReadFixture", async () => {
    mockFetchOnce(sentReadFixture);
    const res = await fetchSentMessage("pm-alpha@vps-1", "msg_sentread_001");
    expect(res).toEqual(sentReadFixture);
  });

  it("fetchThread parses threadFixture", async () => {
    mockFetchOnce(threadFixture);
    const res = await fetchThread("pm-alpha@vps-1", "cnv_001");
    expect(res).toEqual(threadFixture);
  });

  it("fetchDirectory parses directoryListFixture", async () => {
    mockFetchOnce(directoryListFixture);
    const res = await fetchDirectory();
    expect(res).toEqual(directoryListFixture);
  });

  it("fetchDirectoryShow parses directoryShowFixture", async () => {
    mockFetchOnce(directoryShowFixture);
    const res = await fetchDirectoryShow("pm-alpha@vps-1");
    expect(res).toEqual(directoryShowFixture);
  });

  it("fetchEvents parses deliveryEventListFixture", async () => {
    mockFetchOnce(deliveryEventListFixture);
    const res = await fetchEvents("pm-alpha@vps-1");
    expect(res).toEqual(deliveryEventListFixture);
  });

  it("fetchDirectoryMembers parses directoryMembersFixture", async () => {
    mockFetchOnce(directoryMembersFixture);
    const res = await fetchDirectoryMembers("eng-leads@lists");
    expect(res).toEqual(directoryMembersFixture);
  });
});

describe("migrated fetchers — drift path", () => {
  it("fetchInbox drift → ContractDriftError", async () => {
    mockFetchOnce({ ok: true, items: [{ bogus: 1 }], limit: 50, returned_count: 1 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(fetchInbox("pm-alpha@vps-1")).rejects.toMatchObject({
      name: "ContractDriftError",
    });
  });

  it("fetchThread drift → ContractDriftError", async () => {
    mockFetchOnce({ ok: true, conversation_id: "not-a-cnv" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      fetchThread("pm-alpha@vps-1", "cnv_001"),
    ).rejects.toMatchObject({ name: "ContractDriftError" });
  });
});

// ---------------------------------------------------------------------------
// Migrated mutation fetchers — happy path (PR follow-up to #118)
// ---------------------------------------------------------------------------
//
// These exercise the parsedPost migration for postAck/postHide/postUnhide,
// postSend, postReply, and postSentHide/postSentUnhide. For each one we
// mock a valid BFF response (the canonical fixture) and assert the value
// parses cleanly through the schema and that the outgoing request used
// POST with JSON.

describe("migrated mutation fetchers — valid path", () => {
  it("postAck parses ackFixture and sends POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ackFixture,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const res = await postAck("pm-alpha@vps-1", "msg_ack_001");
    expect(res).toEqual(ackFixture);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/inbox/msg_ack_001/ack",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("postHide parses hideFixture", async () => {
    mockFetchOnce(hideFixture);
    const res = await postHide("pm-alpha@vps-1", "msg_hide_001");
    expect(res).toEqual(hideFixture);
  });

  it("postUnhide parses hideFixture (same schema)", async () => {
    mockFetchOnce(hideFixture);
    const res = await postUnhide("pm-alpha@vps-1", "msg_hide_001");
    expect(res).toEqual(hideFixture);
  });

  it("postSend parses sendFixture and sends validated JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => sendFixture,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      to: "eng-leads@lists",
      cc: "ceo@org",
      subject: "Need engineering status",
      body: "Please send your weekly report by 5pm.",
    };
    const res = await postSend("pm-alpha@vps-1", payload);
    expect(res).toEqual(sendFixture);
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("expected fetch call");
    expect(call[0]).toBe("/api/send");
    const init = call[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      to: "eng-leads@lists",
      cc: "ceo@org",
      subject: "Need engineering status",
    });
  });

  it("postReply parses replyFixture", async () => {
    mockFetchOnce(replyFixture);
    const res = await postReply("eng-manager@vps-1", "msg_read_001", {
      body: "Status report attached.",
    });
    expect(res).toEqual(replyFixture);
  });

  it("postSentHide parses sentHideFixture", async () => {
    mockFetchOnce(sentHideFixture);
    const res = await postSentHide("pm-alpha@vps-1", "msg_senthide_001");
    expect(res).toEqual(sentHideFixture);
  });

  it("postSentUnhide parses sentHideFixture (same schema)", async () => {
    mockFetchOnce(sentHideFixture);
    const res = await postSentUnhide("pm-alpha@vps-1", "msg_senthide_001");
    expect(res).toEqual(sentHideFixture);
  });
});

// ---------------------------------------------------------------------------
// Migrated mutation fetchers — drift on response
// ---------------------------------------------------------------------------
//
// When the BFF returns a response that doesn't satisfy the response schema
// (wrong enum, missing required field), the fetcher should throw
// ContractDriftError and NOT a plain Error or a ZodError leak.

describe("migrated mutation fetchers — drift path", () => {
  it("postAck drift on wrong view_kind → ContractDriftError", async () => {
    mockFetchOnce({
      ok: true,
      message_id: "msg_ack_001",
      changed: true,
      view_kind: "banana",
      visibility_state: "active",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      postAck("pm-alpha@vps-1", "msg_ack_001"),
    ).rejects.toMatchObject({ name: "ContractDriftError" });
  });

  it("postSend drift on missing resolved_recipient_count → ContractDriftError", async () => {
    const drifted = { ...sendFixture } as Partial<typeof sendFixture>;
    delete drifted.resolved_recipient_count;
    mockFetchOnce(drifted);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      postSend("pm-alpha@vps-1", {
        to: "eng-leads@lists",
        body: "hi",
      }),
    ).rejects.toMatchObject({ name: "ContractDriftError" });
  });

  it("postSentHide drift on wrong view_kind → ContractDriftError", async () => {
    mockFetchOnce({
      ok: true,
      message_id: "msg_senthide_001",
      changed: true,
      view_kind: "received", // schema locks this to "sent"
      visibility_state: "hidden",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      postSentHide("pm-alpha@vps-1", "msg_senthide_001"),
    ).rejects.toMatchObject({ name: "ContractDriftError" });
  });
});

// ---------------------------------------------------------------------------
// Client-side request validation (NEW in this PR)
// ---------------------------------------------------------------------------
//
// postSend and postReply run the outgoing payload through
// sendRequestSchema / replyRequestSchema with `.parse()` before the network
// roundtrip. A UI bug that constructs a malformed body surfaces as a
// ZodError BEFORE fetch() is called. This saves a network roundtrip and
// keeps ContractDriftError reserved for BFF response drift.

describe("client-side request validation", () => {
  // Zod's ZodError exposes a stable `.name = "ZodError"` and a `.issues`
  // array. We check those rather than `instanceof ZodError` because the
  // ZodError class can be realized from different module paths (packages/ui's
  // own zod dep vs @inbox/contracts's) — same cross-bundle concern that
  // drove the ContractDriftError `.name` discriminator (Amendment 4).
  //
  // We also avoid `rejects.toMatchObject()` on ZodError because vitest's
  // matcher walks own enumerable properties and ZodError's `.name` /
  // `.issues` layout across v3 / v4 subpaths isn't stable enough for that.
  // Plain try/catch + property asserts is the lowest-common-denominator.

  type UnknownPayload = Parameters<typeof postSend>[1];

  async function catchError(fn: () => Promise<unknown>): Promise<unknown> {
    try {
      await fn();
    } catch (err) {
      return err;
    }
    throw new Error("expected function to throw");
  }

  it("postSend throws ZodError when `to` is missing (no fetch call)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const err = (await catchError(() =>
      postSend("pm-alpha@vps-1", {
        subject: "oops",
        body: "no recipient",
      } as unknown as UnknownPayload),
    )) as { name?: string; issues?: Array<{ path: Array<string | number> }> };
    expect(err.name).toBe("ZodError");
    expect(err.issues?.some((i) => i.path.includes("to"))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("postSend throws ZodError when `urgency` is not a valid enum value", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const err = (await catchError(() =>
      postSend("pm-alpha@vps-1", {
        to: "eng-leads@lists",
        urgency: "extreme", // not in urgencySchema
      }),
    )) as { name?: string; issues?: Array<{ path: Array<string | number> }> };
    expect(err.name).toBe("ZodError");
    expect(err.issues?.some((i) => i.path.includes("urgency"))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("postReply throws ZodError when `urgency` is invalid (no fetch call)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const err = (await catchError(() =>
      postReply("pm-alpha@vps-1", "msg_read_001", {
        body: "hi",
        urgency: "nuclear",
      }),
    )) as { name?: string; issues?: Array<{ path: Array<string | number> }> };
    expect(err.name).toBe("ZodError");
    expect(err.issues?.some((i) => i.path.includes("urgency"))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("postSend request ZodError is NOT a ContractDriftError", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const err = (await catchError(() =>
      postSend("pm-alpha@vps-1", {} as unknown as UnknownPayload),
    )) as { name?: string };
    // Reserve ContractDriftError for response drift — client-side body
    // validation must surface as a plain ZodError so observability sinks
    // don't treat it as a BFF bug.
    expect(err.name).toBe("ZodError");
    expect(err.name).not.toBe("ContractDriftError");
  });
});

// ---------------------------------------------------------------------------
// fetchAnalyticsOverview — analytics endpoint (GET /api/analytics/overview)
// ---------------------------------------------------------------------------
//
// Landed in BFF PR #127, wired into the UI in the WorkflowDashboardScreen
// migration PR. These tests live alongside the other parsedGet fetchers
// because they exercise the same validate-through-schema seam.
//
// The analytics response has no published fixture in @inbox/contracts
// yet, so we define a minimal canonical body inline that satisfies
// analyticsOverviewResponseSchema (window, timestamps, counts, rate in
// [0,1], top lists with address + count entries).

const analyticsOverviewFixture = {
  window: "week" as const,
  window_start_ts: 1_775_149_270_000,
  window_end_ts: 1_775_754_070_000,
  inbox_count: 12,
  sent_count: 7,
  response_rate: 0.5,
  active_conversations: 4,
  top_senders: [
    { address: "pm-alpha@vps-1", count: 5 },
    { address: "eng-manager@vps-1", count: 3 },
  ],
  top_recipients: [
    { address: "eng-leads@lists", count: 4 },
    { address: "ceo@org", count: 2 },
  ],
};

describe("fetchAnalyticsOverview", () => {
  it("happy path — valid analytics response parses cleanly", async () => {
    mockFetchOnce(analyticsOverviewFixture);
    const res = await fetchAnalyticsOverview("pm-alpha@vps-1", "week");
    expect(res).toEqual(analyticsOverviewFixture);
    expect(res.window).toBe("week");
    expect(res.top_senders).toHaveLength(2);
  });

  it("defaults to the `week` window when called without a second arg", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => analyticsOverviewFixture,
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    await fetchAnalyticsOverview("pm-alpha@vps-1");
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("expected fetch call");
    expect(call[0]).toBe("/api/analytics/overview?window=week");
  });

  it("drift on response (response_rate > 1) → ContractDriftError", async () => {
    const drifted = { ...analyticsOverviewFixture, response_rate: 1.5 };
    mockFetchOnce(drifted);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      fetchAnalyticsOverview("pm-alpha@vps-1", "week"),
    ).rejects.toMatchObject({ name: "ContractDriftError" });
  });

  it("drift on missing top_senders → ContractDriftError", async () => {
    const drifted = { ...analyticsOverviewFixture } as Partial<
      typeof analyticsOverviewFixture
    >;
    delete drifted.top_senders;
    mockFetchOnce(drifted);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      fetchAnalyticsOverview("pm-alpha@vps-1", "week"),
    ).rejects.toMatchObject({ name: "ContractDriftError" });
  });
});
