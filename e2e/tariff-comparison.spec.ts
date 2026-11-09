import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const screenshotDirectory = resolve("artifacts/tariff-comparison");
mkdirSync(screenshotDirectory, { recursive: true });

const viewports = [
  { name: "mobile-320", width: 320, height: 568 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-480", width: 480, height: 800 },
  { name: "compact-420x560", width: 420, height: 560 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

async function submit(page: Page, text: string) {
  const composer = page.getByLabel("Zpráva pro TOBiho");
  await expect(composer).toBeEnabled();
  await composer.fill(text);
  const submitButton = page.getByRole("button", { name: "Odeslat" });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  return composer;
}

async function expectInsideVisibleMessages(control: Locator, scroller: Locator, composerForm: Locator) {
  const [controlBox, scrollerBox, composerBox] = await Promise.all([
    control.boundingBox(),
    scroller.boundingBox(),
    composerForm.boundingBox(),
  ]);
  expect(controlBox).not.toBeNull();
  expect(scrollerBox).not.toBeNull();
  expect(composerBox).not.toBeNull();
  expect(controlBox!.y).toBeGreaterThanOrEqual(scrollerBox!.y - 1);
  expect(controlBox!.y + controlBox!.height).toBeLessThanOrEqual(composerBox!.y + 1);
}

for (const viewport of viewports) {
  test(`tarifní carousel je přímé srovnání ovladatelné v ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/", { waitUntil: "networkidle" });

    const composer = await submit(page, "Chci tarif do 800 Kč s 10 GB dat.");
    const composerForm = composer.locator("xpath=ancestor::form");
    const scroller = page.locator(".chat-scrollbar");
    const previous = page.getByRole("button", { name: "Předchozí tarif" });
    const next = page.getByRole("button", { name: "Další tarif" });
    const position = page.getByText("Tarif 1 ze 3", { exact: true });

    await expect(page.getByRole("button", { name: /Porovnat/u })).toHaveCount(0);
    await expect(previous).toBeVisible();
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    await expect(position).toBeVisible();
    await expectInsideVisibleMessages(previous, scroller, composerForm);
    await expectInsideVisibleMessages(next, scroller, composerForm);
    await expect(composer).toBeVisible();

    const firstCard = page.getByRole("heading", { name: "sLimitem M" }).locator("xpath=parent::article");
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByText("497 Kč / měsíc", { exact: true })).toBeVisible();
    await expect(firstCard.getByText("12 GB", { exact: true })).toBeVisible();
    await expect(firstCard.getByText("Neomezeně", { exact: true })).toBeVisible();
    await expect(firstCard.getByText("Samostatný tarif; zvýhodněná cena bez uvedeného data konce.", { exact: true })).toBeVisible();
    await expect(firstCard.getByRole("link", { name: /Detail tarifu sLimitem M/ })).toBeVisible();
    await expect(page.getByText(/Vybráno pro srovnání/u)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Odebrat .* z porovnání/u })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Konec" })).toHaveCount(0);

    await next.click();
    await expect(page.getByText("Tarif 2 ze 3", { exact: true })).toBeVisible();
    const secondCard = page.getByRole("heading", { name: "BezLimitu M" }).locator("xpath=parent::article");
    await expect(secondCard).toBeVisible();
    await expect(secondCard.getByText("Neomezeně · 8 Mb/s", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Detail tarifu / })).toHaveCount(1);

    const carousel = page.locator("[aria-roledescription='carousel']");
    await carousel.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText("Tarif 3 ze 3", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "BezLimitu L" })).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(page.getByRole("link", { name: /^Detail tarifu / })).toHaveCount(1);
    const activeDetail = page.getByRole("link", { name: /Detail tarifu BezLimitu L/ });
    await activeDetail.focus();
    await expect(activeDetail).toBeFocused();

    await previous.click();
    await expect(page.getByText("Tarif 2 ze 3", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "BezLimitu M" })).toBeVisible();

    const horizontalOverflow = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth);
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: "Změnit požadavky" })).toHaveCount(1);

    await page.screenshot({
      path: resolve(screenshotDirectory, `${viewport.name}-carousel.png`),
      fullPage: false,
    });
  });
}

test("doslovný požadavek do 400 Kč s 10 GB drží rozdíl na každé kartě", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await submit(page, "tarif do 400 Kč s 10 GB");
  await expect(page.getByRole("paragraph").filter({ hasText: "Přesnou shodu jsem v katalogu nenašel" })).toBeVisible();
  const carousel = page.locator("[aria-roledescription='carousel']");
  await expect(carousel.locator("[aria-hidden='false']").getByText(/Nesplňuje přesně zadání/)).toBeVisible();
  await page.getByRole("button", { name: "Další tarif" }).click();
  await expect(page.getByText("Tarif 2 ze 3", { exact: true })).toBeVisible();
  await expect(carousel.locator("[aria-hidden='false']").getByText(/Nesplňuje přesně zadání/)).toBeVisible();
});

test("jediná shoda je jedna karta bez navigace a Porovnat", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await submit(page, "Chci tarif do 500 Kč s 12 GB dat.");
  await expect(page.getByRole("heading", { name: "sLimitem M" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Detail tarifu sLimitem M/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Porovnat/u })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Předchozí tarif" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Další tarif" })).toHaveCount(0);
});

test("doptání nemá duplicitní nadpis ani tlačítko Konec", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await submit(page, "Doporučíš mi mobilní tarif?");
  await expect(page.getByRole("paragraph").filter({ hasText: /^Kolik mobilních dat potřebujete\?$/u })).toBeVisible();
  await expect(page.getByText("Vyberte množství dat", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Konec" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Alespoň 10 GB" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Neomezená data" })).toBeVisible();
});
