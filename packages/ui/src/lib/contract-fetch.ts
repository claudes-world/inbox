/// <reference types="vite/client" />
/**
 * Contract-validated fetch layer for the Inbox BFF.
 *
 * Runs every response through its Zod schema from @inbox/contracts before
 * the result reaches screen code, so BFF contract drift surfaces as a
 * loud runtime error instead of a silently broken render.
 *
 * Design notes:
 *
 *   - We use Zod's default `.strip()` behavior: unknown fields in the
 *     response are silently dropped. This is intentional — we want the
 *     UI to be tolerant of BFF over-fetching during development, but
 *     strict about missing required fields and wrong enum values. If we
 *     ever need to catch extra fields as drift, we'd add `.strict()`
 *     per-schema in @inbox/contracts, not globally here.
 *
 *   - Zod parse overhead on large lists can reach 10-50ms on a 500+ item
 *     payload. Current inbox/sent/thread payloads are well under 100
 *     items so this is imperceptible. If we ever see latency spikes on
 *     big lists, switch to parsing just the envelope (items array +
 *     metadata) and sample-validating 5-10 random items instead of
 *     deep-validating every item. Do NOT pre-optimize here — measure
 *     first.
 *
 *   - `ContractDriftError` carries a stable `name` discriminator rather
 *     than relying on `instanceof`. Webpack/Vite can end up with multiple
 *     copies of the class across module boundaries, which breaks
 *     `instanceof` checks in React Query's retry predicate and error
 *     boundaries. Always check `error.name === "ContractDriftError"`.
 *
 *   - Observability is a seam, not a dep. Dev mode logs to console. Prod
 *     mode dispatches a `contract-drift` CustomEvent on `window`. Anyone
 *     who wants Sentry later adds a single addEventListener in the app
 *     bootstrap — no external observability package here.
 */
import type { z } from "zod";

/**
 * Error thrown when a BFF response fails schema validation.
 *
 * Uses a stable `.name` discriminator for cross-bundle-boundary identity.
 * Check `error.name === "ContractDriftError"`, not `error instanceof
 * ContractDriftError`.
 */
export class ContractDriftError extends Error {
  readonly name = "ContractDriftError" as const;
  readonly url: string;
  readonly issues: z.ZodIssue[];
  readonly raw: unknown;
  readonly retryable = false;

  constructor(url: string, zodError: z.ZodError, raw: unknown) {
    super(
      `Contract drift at ${url}: ${zodError.issues.length} issue(s) — ${zodError.issues[0]?.path.join(".") ?? "<root>"}: ${zodError.issues[0]?.message ?? "unknown"}`,
    );
    this.url = url;
    this.issues = zodError.issues;
    this.raw = raw;
  }
}

/**
 * Report a contract-drift error to the environment's observability sink.
 *
 * Dev mode: `console.error` with a formatted breakdown so the developer
 * who can actually fix the bug sees it immediately.
 *
 * Prod mode: dispatches a `contract-drift` CustomEvent on `window`. A
 * single `window.addEventListener("contract-drift", ...)` in app
 * bootstrap can forward these to Sentry, a debug overlay, or any other
 * sink without the fetch layer needing to know about them.
 */
export function reportContractDrift(err: ContractDriftError): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error(
      "[contract-drift]",
      err.url,
      err.issues.slice(0, 5),
      err.raw,
    );
    return;
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("contract-drift", {
        detail: { url: err.url, issues: err.issues, raw: err.raw },
      }),
    );
  }
}

function buildHeaders(address: string, includeContentType: boolean): HeadersInit {
  const headers: Record<string, string> = {
    "X-Inbox-Address": address,
  };
  if (includeContentType) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function handleNonOk(res: Response): Promise<never> {
  const body = await res.json().catch(() => null);
  const msg =
    (body as { error?: { message?: string } } | null)?.error?.message ??
    `Request failed: ${res.status}`;
  throw new Error(msg);
}

function validate<S extends z.ZodTypeAny>(
  url: string,
  schema: S,
  raw: unknown,
): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const err = new ContractDriftError(url, result.error, raw);
    reportContractDrift(err);
    throw err;
  }
  return result.data;
}

/**
 * GET a URL and parse the response through a Zod schema.
 * Throws ContractDriftError on schema mismatch, Error on transport failure.
 *
 * Uses `z.ZodTypeAny` + `z.output<S>` rather than `z.ZodType<T>` so the
 * inferred return type tracks the schema's output shape without callers
 * needing to pass T explicitly.
 */
export async function parsedGet<S extends z.ZodTypeAny>(
  url: string,
  address: string,
  schema: S,
): Promise<z.output<S>> {
  const res = await fetch(url, { headers: buildHeaders(address, false) });
  if (!res.ok) {
    await handleNonOk(res);
  }
  const raw: unknown = await res.json();
  return validate(url, schema, raw);
}

/**
 * POST a body to a URL and parse the response through a Zod schema.
 * Throws ContractDriftError on schema mismatch, Error on transport failure.
 */
export async function parsedPost<S extends z.ZodTypeAny>(
  url: string,
  address: string,
  schema: S,
  body?: unknown,
): Promise<z.output<S>> {
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(address, true),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    await handleNonOk(res);
  }
  const raw: unknown = await res.json();
  return validate(url, schema, raw);
}
