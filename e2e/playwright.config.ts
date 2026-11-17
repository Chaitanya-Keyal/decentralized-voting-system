import { defineConfig } from "@playwright/test";

// The end-to-end test drives the running app in a browser. Start the stack first, as described in
// CONTRIBUTING.md, with the API pointed at the Google sign-in stand-in's keys, then run `pnpm e2e`.
export default defineConfig({
  testDir: ".",
  globalSetup: "./global-setup.ts",
  timeout: 5 * 60_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_WEB_URL ?? "http://localhost:3000",
    browserName: "chromium",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
