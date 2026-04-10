import { describe, it, expect } from "vitest";
import { app } from "../app.js";

describe("BFF health check", () => {
  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, service: "@inbox/bff" });
  });
});
