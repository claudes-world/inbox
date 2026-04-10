import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 58850,
    allowedHosts: ["inbox.claude.do"],
    proxy: {
      "/api": {
        target: "http://localhost:38850",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
