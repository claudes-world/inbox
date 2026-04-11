import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      // Use in-memory SQLite for tests so each worker thread gets its own
      // isolated database. This prevents cross-file race conditions when
      // vitest runs test files in parallel worker threads — each thread
      // imports db.ts independently and gets a fresh :memory: DB with the
      // schema auto-applied.
      INBOX_DB: ":memory:",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/__tests__/**",
        "**/node_modules/**",
        "**/dist/**",
        // Generated boilerplate — the openapi-registry wires Zod schemas into
        // zod-to-openapi and is exercised via the openapi.test.ts output
        // snapshot rather than directly. Excluding keeps coverage numbers
        // reflective of hand-written logic.
        "src/lib/openapi-registry.ts",
      ],
      // Reporting only — no thresholds enforced.
    },
  },
});
