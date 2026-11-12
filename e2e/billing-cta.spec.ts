import { expect, test, type Locator, type Page } from "@playwright/test";

const label = "Otevřít Můj Vodafone v nové kartě";
const accountUrl = "https://muj.vodafone.cz/";

// Keep Chromium's sandbox enabled; never work around a blocked browser launch.
test.use({ launchOptions: { chromiumSandbox: true }, serviceWorkers: "block" });

async function submit(page: Page, text: string) {
  const composer = page.getByLabel("Zpráva pro TOBiho");
  await expect(composer).toBeEnabled();
  await composer.fill(text);
  const responsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/chat/v1" && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Odeslat", exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload.mode).toBe("preset");
  return payload;
}

async function expectReadable(link: Locator) {
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeVisible();
  const metrics = await link.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const textBoxes = [...range.getClientRects()].map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }));
    const scroller = element.closest(".chat-scrollbar")!;
    const visible = scroller.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom },
      visible: { left: visible.left, right: visible.right, top: visible.top, bottom: visible.bottom },
      viewportWidth: window.innerWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      messageOverflow: scroller.scrollWidth - scroller.clientWidth,
      linkOverflow: element.scrollWidth - element.clientWidth,
      textBoxes,
      fontSize: style.fontSize,
      documentZoom: getComputedStyle(document.documentElement).zoom,
    };
  });
  expect(metrics.documentOverflow).toBeLessThanOrEqual(1);
  expect(metrics.messageOverflow).toBeLessThanOrEqual(1);
  expect(metrics.linkOverflow).toBeLessThanOrEqual(1);
  expect(metrics.box.left).toBeGreaterThanOrEqual(Math.max(0, metrics.visible.left) - 1);
  expect(metrics.box.right).toBeLessThanOrEqual(Math.min(metrics.viewportWidth, metrics.visible.right) + 1);
  expect(metrics.box.top).toBeGreaterThanOrEqual(metrics.visible.top - 1);
  expect(metrics.box.bottom).toBeLessThanOrEqual(metrics.visible.bottom + 1);
  for (const rect of metrics.textBoxes) {
    expect(rect.left).toBeGreaterThanOrEqual(metrics.box.left - 1);
    expect(rect.right).toBeLessThanOrEqual(metrics.box.right + 1);
    expect(rect.top).toBeGreaterThanOrEqual(metrics.box.top - 1);
    expect(rect.bottom).toBeLessThanOrEqual(metrics.box.bottom + 1);
  }
  return metrics;
}

for (const scenario of [
  { name: "desktop", width: 1440, height: 900, cssZoom: 1 },
  { name: "mobile-320", width: 320, height: 568, cssZoom: 1 },
  // CSS layout zoom is explicit evidence of magnification, not native browser zoom.
  { name: "css-layout-zoom-200", width: 1280, height: 900, cssZoom: 2 },
]) {
  test(`billing CTA: ${scenario.name}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    const externalNavigations: string[] = [];
    const unexpectedExternal: string[] = [];
    const writes: string[] = [];
    context.on("request", (request) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writes.push(`${request.method()} ${request.url()}`);
    });
    // Safety boundary (billing and eSIM): abort ALL non-loopback requests,
    // including subresources/fetch; only the expected external navigation is
    // recorded as the target action. Real local /chat and /api/chat/v1 run
    // in the application with local in-memory config; no real account IO.
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") return route.continue();
      if (url.origin === "https://muj.vodafone.cz" && request.isNavigationRequest()) {
        externalNavigations.push(request.url());
      } else {
        unexpectedExternal.push(request.url());
      }
      await route.abort("blockedbyclient");
    });
    await page.goto("/chat", { waitUntil: "networkidle" });
    if (scenario.cssZoom !== 1) {
      await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, scenario.cssZoom);
    }
    const payload = await submit(page, "vyúčtování");
    expect(payload.intent.id).toBe("billing");
    expect(payload.blocks.find((block: { type: string }) => block.type === "action")).toMatchObject({
      label, action: { kind: "openUrl", url: accountUrl, external: true },
    });
    const link = page.getByRole("link", { name: label, exact: true });
    await expect(link).toHaveText(label);
    await expect(link).toHaveAccessibleName(label);
    await expect(link).toHaveAttribute("href", accountUrl);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
    // Start locally at the composer and reach the CTA only via real Tab presses.
    const composer = page.getByLabel("Zpráva pro TOBiho");
    await composer.focus();
    await expect(composer).toBeFocused();
    // Overcount potential tab stops (including hidden/disabled elements) and
    // allow two extra steps for browser focus when wrapping around the document.
    const maxTabSteps = await page.locator(
      "a[href], area[href], button, input, select, textarea, summary, iframe, object, embed, [tabindex], [contenteditable], audio[controls], video[controls]",
    ).count() + 2;
    let tabSteps = 0;
    while (tabSteps < maxTabSteps) {
      await page.keyboard.press("Tab");
      tabSteps += 1;
      if (await link.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(link, `CTA must be reached from the composer within ${maxTabSteps} Tab presses`).toBeFocused();
    const metrics = await expectReadable(link);
    // Capture the keyboard focus indicator for later visual review.
    await page.screenshot({ path: testInfo.outputPath(`${scenario.name}.png`) });
    const messages = page.locator(".chat-scrollbar > article");
    const messageCount = await messages.count();
    const messageText = await messages.allTextContents();
    const writesBeforeEnter = [...writes];
    expect(writesBeforeEnter).toHaveLength(1);
    expect(writesBeforeEnter[0]).toContain("POST ");
    expect(writesBeforeEnter[0]).toContain("/api/chat/v1");
    await expect(link).toBeFocused();
    const popupPromise = context.waitForEvent("page");
    await page.keyboard.press("Enter");
    const popup = await popupPromise;
    expect(popup).not.toBe(page);
    await expect.poll(() => externalNavigations).toEqual([accountUrl]);
    // Observe the settled local UI after the intercepted external navigation.
    await page.waitForTimeout(350);
    await expect(messages).toHaveCount(messageCount);
    expect(await messages.allTextContents()).toEqual(messageText);
    expect(writes).toEqual(writesBeforeEnter);
    expect(unexpectedExternal).toEqual([]);
    expect(new URL(page.url()).pathname).toBe("/chat");
    await testInfo.attach("billing-evidence", {
      body: JSON.stringify({ scenario, metrics, keyboardFocus: { start: "composer", key: "Tab", tabSteps, maxTabSteps }, externalNavigations, writesBeforeEnter, writesAfterEnter: writes, messageCount, boundary: "Real local /chat and /api/chat/v1; all non-loopback requests (navigation, subresources and fetch) are aborted as a test safety boundary; only the expected external navigation is recorded as the target action; no real account IO", zoom: "CSS layout zoom only; native browser zoom is NOT_VERIFIED" }, null, 2),
      contentType: "application/json",
    });
    await popup.close();
  });
}

test("eSIM CTA zůstává beze změny na skutečném /chat", async ({ page, context }) => {
  await context.route("**/*", (route) => {
    const hostname = new URL(route.request().url()).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" ? route.continue() : route.abort("blockedbyclient");
  });
  await page.goto("/chat", { waitUntil: "networkidle" });
  const payload = await submit(page, "esim");
  expect(payload.intent.id).toBe("esim");
  const link = page.getByRole("link", { name: "Otevřít Můj Vodafone", exact: true });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", accountUrl);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noreferrer");
  await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
});
