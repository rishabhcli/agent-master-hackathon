import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: "http://localhost:3001",
    headless: true,
    screenshot: "on",
    trace: "on-first-retry",
  },
  retries: 0,
});
