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
  },
});
