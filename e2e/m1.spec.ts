// M1 is done when an election runs end to end from the browser: the authority creates it, five
// voters register and vote from their own wallets, and the tally is final. This test does exactly
// that, on Anvil, using its unlocked accounts as wallets and moving its clock between steps.
import { expect, test, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:8025";

/** Connects Anvil's account `index`, disconnecting whichever wallet was connected. */
async function connect(page: Page, index: number) {
  const header = page.locator("header");
  const button = header.getByRole("button").last();
  await expect(button).toBeVisible();
  // RainbowKit shows "Connect Wallet" until it has restored any earlier connection.
  await page.waitForTimeout(300);
  if (!(await button.textContent())?.includes("Connect Wallet")) {
    await button.click();
    await page.getByRole("button", { name: "Disconnect" }).click();
  }
  await header.getByRole("button", { name: "Connect Wallet" }).click();
  await page.getByText(`Anvil account ${index} (`).click();
  await expect(header.getByRole("button", { name: "Connect Wallet" })).toHaveCount(0);
}

/** Moves the chain's clock to the next step, with the election page's Anvil-only button. */
async function skipAhead(page: Page) {
  await page.getByRole("button", { name: /Move the chain's clock/ }).click();
}

/** The latest code the registrar emailed to `email`, read from Mailpit. */
async function emailedCode(email: string): Promise<string> {
  let code: string | undefined;
  await expect
    .poll(async () => {
      const query = encodeURIComponent(`to:"${email}"`);
      const response = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
      const { messages } = (await response.json()) as { messages?: { Subject: string }[] };
      code = /^(\d{6}) is your DVote code/.exec(messages?.[0]?.Subject ?? "")?.[1];
      return code;
    })
    .toBeTruthy();
  return code ?? "";
}

test("an election runs end to end in the browser", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const run = Date.now();
  const voters = [2, 3, 4, 5, 6];
  const choices: Record<number, string> = { 2: "Asha", 3: "Ravi", 4: "Asha", 5: "Ravi", 6: "Asha" };
  let election = "";

  await test.step("the authority creates an election", async () => {
    await page.goto("/");
    await connect(page, 0);
    await page.goto("/elections/new");
    await page.getByPlaceholder("Student Senate 2026").fill("Hostel council");
    await page.getByLabel("Name of candidate 1").fill("Asha");
    await page.getByLabel("Name of candidate 2").fill("Ravi");
    await page.getByRole("button", { name: "Create election" }).click();
    await page.waitForURL(/\/elections\/0x[0-9a-fA-F]{40}$/);
    election = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hostel council");
  });

  await test.step("registration opens", async () => {
    await skipAhead(page);
    await expect(page.getByRole("link", { name: "Register to vote" })).toBeVisible();
  });

  for (const index of voters) {
    await test.step(`voter ${index} registers with an institute email`, async () => {
      const email = `voter${index}.${run}@hyderabad.bits-pilani.ac.in`;
      await page.goto(`${election}/register`);
      await connect(page, index);
      await page.getByLabel("Institute email address").fill(email);
      await page.getByRole("button", { name: "Send me a code" }).click();
      await page.getByLabel("Code").fill(await emailedCode(email));
      await page.getByRole("button", { name: /Sign with my wallet and register/ }).click();
      await expect(
        page.getByText("The receipt is signed by this election's registrar"),
      ).toBeVisible();
    });
  }

  await test.step("registration closes and the registrar publishes the voter list", async () => {
    await page.goto(election);
    await skipAhead(page);
    // The registrar publishes by itself once registration has closed.
    await expect(page.getByText(/The voter list has 5 voters/)).toBeVisible({ timeout: 30_000 });
  });

  await test.step("voting opens", async () => {
    await skipAhead(page);
    await page.getByRole("button", { name: "Open voting" }).click();
    await expect(page.getByRole("link", { name: "Go to the ballot booth" })).toBeVisible();
  });

  for (const index of voters) {
    await test.step(`voter ${index} votes for ${choices[index]}`, async () => {
      await page.goto(`${election}/vote`);
      await connect(page, index);
      await expect(page.getByText("found your wallet on it")).toBeVisible();
      await page.getByLabel(choices[index] ?? "").check();
      await page.getByRole("button", { name: "Cast my ballot" }).click();
      await expect(page.getByText("You have voted in this election")).toBeVisible();
    });
  }

  await test.step("anyone closes voting and finalizes the result", async () => {
    await page.goto(election);
    await skipAhead(page);
    await page.getByRole("button", { name: "Close voting" }).click();
    await page.getByRole("button", { name: "Finalize the result" }).click();
    await expect(page.getByText("The result is final")).toBeVisible();
    await expect(page.getByText("3 votes")).toBeVisible();
    await expect(page.getByText("2 votes")).toBeVisible();
    await expect(page.getByText("Winner")).toHaveCount(1);
  });

  await test.step("the indexer lists every ballot", async () => {
    await expect(page.locator("tbody tr")).toHaveCount(5);
  });

  expect(errors).toEqual([]);
});
