import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // Vitest default includes match Playwright specs under e2e/. Exclude
    // that dir explicitly — those tests run via `pnpm test:e2e`, not
    // vitest, and the two test runners aren't compatible.
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/__tests__/**",
        "**/node_modules/**",
        "**/dist/**",
        "**/e2e/**",
      ],
      // Reporting only — no thresholds enforced.
    },
  },
});
