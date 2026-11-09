import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

let sequence = 0;
async function config(port, extra = {}) {
  const previous = { ...process.env };
  try {
    delete process.env.TOBI_E2E_PORT;
    if (port !== undefined) process.env.TOBI_E2E_PORT = port;
    Object.assign(process.env, extra);
    return (await import(`../playwright.config.ts?case=${sequence++}`)).default;
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
}
function assertEndpoint(value, port) {
  assert.equal(value.use.baseURL, `http://127.0.0.1:${port}`);
  assert.equal(value.webServer.url, value.use.baseURL);
  assert.equal(value.webServer.command, `npm run dev -- --port ${port}`);
  assert.equal(value.workers, 1);
  assert.equal(value.retries, 0);
}
test("Playwright uses isolated default port 15173", async () => {
  assertEndpoint(await config(), 15173);
  const { scripts } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(scripts.dev, /(?:^| )--hostname 127\.0\.0\.1(?: |$)/u);
});
test("Playwright accepts explicit port and range boundaries", async () => {
  for (const port of ["15174", "1", "65535"]) assertEndpoint(await config(port), Number(port));
});
test("Playwright rejects malformed and out-of-range ports", async () => {
  for (const port of ["", "0", "65536", "-1", "1.5", "15173abc", "1e3", "0x123", " 15173", "15173 ", "15173\n", "+15173", "NaN", "Infinity"]) {
    await assert.rejects(config(port), /TOBI_E2E_PORT/);
  }
});
test("Playwright never reuses an existing server, including CI", async () => {
  for (const CI of ["", "true"]) assert.equal((await config(undefined, { CI })).webServer.reuseExistingServer, false);
});
