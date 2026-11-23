import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// CL_API_TARGET lets E2E runs use an isolated backend (see docs/TESTING_REPORT.md); default is the dev backend.
const API = process.env.CL_API_TARGET ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.CL_PORT ?? 5173),
    proxy: { "/api": { target: API, changeOrigin: false } },
  },
  preview: { port: 4173, proxy: { "/api": { target: API } } },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test-setup.ts"], include: ["src/**/*.test.{ts,tsx}"] },
} as never);
