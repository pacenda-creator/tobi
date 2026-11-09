import { defineConfig } from "@playwright/test";

const rawPort = process.env.TOBI_E2E_PORT ?? "15173";
if (!/^[0-9]+$/u.test(rawPort) || !Number.isInteger(Number(rawPort)) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
  throw new Error("TOBI_E2E_PORT must be an integer between 1 and 65535");
}
const port = Number(rawPort);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: ".playwright-results",
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
    headless: true,
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      TOBI_IN_MEMORY_CONFIG: "true",
      NODE_ENV: "development",
    },
  },
});
