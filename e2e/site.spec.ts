// The site's frame: the light and dark switch, and the page that explains how DVote works.
import { expect, test, type Page } from "@playwright/test";

/** Waits until the page is drawn in the scheme with this background colour. */
const shows = (page: Page, colour: string) =>
  expect(page.locator("body")).toHaveCSS("background-color", colour);
const DARK = "rgb(9, 9, 11)";
const LIGHT = "rgb(255, 255, 255)";

test.use({ colorScheme: "light" });

test("the switch shows the other scheme, keeps it, and gives it back to the system", async ({
  page,
}) => {
  await page.goto("/");
  await shows(page, LIGHT);

  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await shows(page, DARK);
  await page.reload();
  await shows(page, DARK);
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();

  // Back to what the system shows: the choice is forgotten, so the page follows the system again.
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await shows(page, LIGHT);
  expect(await page.evaluate(() => localStorage.getItem("color-scheme"))).toBeNull();
  await page.emulateMedia({ colorScheme: "dark" });
  await shows(page, DARK);
});

test("the header links to how it works", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "How it works" })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "How DVote works" })).toBeVisible();
});
