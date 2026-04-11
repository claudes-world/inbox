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
  deliveryEventListFixture,
} from "@inbox/contracts/fixtures";
import { listResponseSchema } from "@inbox/contracts";
import {
  ContractDriftError,
  parsedGet,
  parsedPost,
  reportContractDrift,
} from "../lib/contract-fetch.js";
import {
  fetchInbox,
  fetchMessage,
  fetchSent,
  fetchSentMessage,
  fetchThread,
  fetchDirectory,
  fetchDirectoryShow,
  fetchEvents,
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
