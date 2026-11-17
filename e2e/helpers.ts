// Steps both end-to-end tests share.
import { mkdir } from "node:fs/promises";

import { expect, type Page } from "@playwright/test";

/** Connects Anvil's account `index`, disconnecting whichever wallet was connected. */
export async function connect(page: Page, index: number) {
  const header = page.locator("header");
  const button = header.getByRole("button").last();
  await expect(button).toBeVisible();
  // The button reads "Connect wallet" until the wallet has restored any earlier connection.
  await page.waitForTimeout(300);
  if (!(await button.textContent())?.includes("Connect wallet")) {
    await button.click();
    await page.getByRole("button", { name: "Disconnect" }).click();
  }
  await header.getByRole("button", { name: "Connect wallet" }).click();
  await page.getByText(`Anvil account ${index} (`).click();
  await expect(header.getByRole("button", { name: "Connect wallet" })).toHaveCount(0);
}

/** Moves the chain's clock to the next step, with the election page's Anvil-only button. */
export async function skipAhead(page: Page) {
  await page.getByRole("button", { name: /Move the chain's clock/ }).click();
}

const SIZES = [
  ["desktop", { width: 1280, height: 800 }],
  ["phone", { width: 390, height: 844 }],
] as const;

/**
 * With SCREENSHOTS=<directory>, saves the page at desktop and phone widths, for reviewing the
 * design of every step. Without it, does nothing.
 */
export async function screenshot(page: Page, name: string) {
  const dir = process.env.SCREENSHOTS;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  const original = page.viewportSize();
  for (const [label, size] of SIZES) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${dir}/${name}-${label}.png`, fullPage: true });
  }
  if (original) await page.setViewportSize(original);
}
