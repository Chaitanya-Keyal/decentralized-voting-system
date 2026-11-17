// The site's frame: the light and dark switch, and the page that explains how DVote works.
import { expect, test, type Page } from "@playwright/test";

const shown = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const DARK = "rgb(9, 9, 11)";
const LIGHT = "rgb(255, 255, 255)";

test.use({ colorScheme: "light" });

test("the switch shows the other scheme, keeps it, and gives it back to the system", async ({
  page,
}) => {
  await page.goto("/");
  expect(await shown(page)).toBe(LIGHT);

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  expect(await shown(page)).toBe(DARK);
  await page.reload();
  expect(await shown(page)).toBe(DARK);
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();

  // Back to what the system shows: the choice is forgotten, so the page follows the system again.
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  expect(await shown(page)).toBe(LIGHT);
  expect(await page.evaluate(() => localStorage.getItem("color-scheme"))).toBeNull();
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await shown(page)).toBe(DARK);
});

test("the home page links to how it works", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "How it works" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How DVote works" })).toBeVisible();
});
