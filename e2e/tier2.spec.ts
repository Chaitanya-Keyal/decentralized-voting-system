// Tier 2 end to end: a wallet election, run from the browser. The authority creates it, five voters
// register and vote from their own wallets, and the tally is final. It runs on Anvil, using its
// unlocked accounts as wallets and moving its clock between steps.
import { expect, test } from "@playwright/test";

import { signInWithGoogle, useGoogleStandIn } from "./google";
import { connect, screenshot, skipAhead } from "./helpers";

test.beforeEach(({ context }) => useGoogleStandIn(context));

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
    await page.getByLabel("Wallet ballots").check();
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
      await signInWithGoogle(page, email);
      if (index === 2) await screenshot(page, "20-wallet-register");
      await page.getByRole("button", { name: /Sign with my wallet and register/ }).click();
      await expect(
        page.getByText("Checked: signed by the registrar named in this election's contract"),
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
      await expect(page.getByText("on the voter list, checked in this browser")).toBeVisible();
      if (index === 2) await screenshot(page, "21-wallet-booth");
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
    await expect(page.getByText("Asha won with 3 votes.")).toBeVisible();
    await expect(page.getByText("3 votes", { exact: true })).toBeVisible();
    await expect(page.getByText("2 votes", { exact: true })).toBeVisible();
    await expect(page.getByText("Winner")).toHaveCount(1);
    await screenshot(page, "22-wallet-election-final");
  });

  await test.step("an observer audits the election from the chain and IPFS alone", async () => {
    await page.getByRole("button", { name: "Run the audit" }).click();
    await expect(page.getByText("Every check passed")).toBeVisible({ timeout: 60_000 });
    await screenshot(page, "23-wallet-election-audited");
  });

  await test.step("the indexer lists every ballot", async () => {
    await expect(page.locator("tbody tr")).toHaveCount(5);
  });

  expect(errors).toEqual([]);
});
