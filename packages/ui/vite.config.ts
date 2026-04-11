import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/app/",
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PLAYWRIGHT_PORT || process.env.VITE_PORT) || 58550,
    allowedHosts: ["inbox.claude.do"],
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.INBOX_BFF_PORT || 38550}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
