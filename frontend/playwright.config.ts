import { defineConfig, devices } from "@playwright/test";

// Requires the backend (127.0.0.1:8000) and Vite dev server (localhost:5173) to be running.
// Credentials come from CL_EMAIL / CL_PASSWORD (an analyst or admin account) - never hard-coded.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  use: { baseURL: process.env.CL_BASE ?? "http://localhost:5173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
