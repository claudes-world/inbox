import { describe, it, expect, vi } from "vitest";

describe("OTEL module", () => {
  it("imports without throwing", async () => {
    // Verifies provider registration does not throw on import
    await expect(import("../lib/otel.js")).resolves.toBeDefined();
  });

  it("tracedQuery wraps fn and returns its value", async () => {
    const { tracedQuery } = await import("../db.js");

    // Mock tracer span to verify instrumentation wiring without real OTEL infra
    const mockEnd = vi.fn();
    const mockSpan = {
      end: mockEnd,
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      setStatus: vi.fn(),
    };

    const { getTracer } = await import("../lib/otel.js");
    vi.spyOn(getTracer("inbox-bff-db"), "startSpan").mockReturnValue(
      mockSpan as unknown as ReturnType<ReturnType<typeof getTracer>["startSpan"]>
    );

    const result = tracedQuery("select", "messages", () => 42);

    expect(result).toBe(42);
    // Span must be ended regardless of result
    expect(mockEnd).toHaveBeenCalledOnce();
  });
});
