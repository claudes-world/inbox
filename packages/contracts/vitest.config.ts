import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/__tests__/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/__tests__/**",
        "**/node_modules/**",
        "**/dist/**",
      ],
      // Reporting only — thresholds are not enforced yet. The baseline at
      // docs/reference/coverage-baseline-2026-04-11.md captures the starting
      // point; future PRs can tighten this once we decide targets.
    },
  },
});
