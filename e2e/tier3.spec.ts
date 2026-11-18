// Tier 3 end to end: an anonymous approval election. Voters need no wallet. Each one's browser
// makes a voting key and registers only its public commitment; in the booth it proves, in a Web
// Worker, that the ballot comes from someone on the published list, and the relayer pays the gas.
// One voter votes from a second browser after restoring their key from its backup file.
import { readFile } from "node:fs/promises";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { signInWithGoogle, useGoogleStandIn } from "./google";
import { connect, screenshot, skipAhead } from "./helpers";

/** A browser of the voter's own: its storage, and so its voting key, belongs to that voter. */
async function voterBrowser(browser: Browser, errors: string[]) {
  const context = await browser.newContext({
    acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await useGoogleStandIn(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page };
}

test("an anonymous approval election runs end to end without voter wallets", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const run = Date.now();
  // Approvals: Asha 3, Ravi 1, Meera 1.
  const ballots = [["Asha", "Ravi"], ["Asha"], ["Asha", "Meera"]];
  const voters: { context: BrowserContext; page: Page; backup?: string }[] = [];
  let election = "";

  await test.step("the authority creates an anonymous approval election", async () => {
    await page.goto("/");
    await connect(page, 0);
    await screenshot(page, "01-home");
    await page.goto("/elections/new");
    await screenshot(page, "02-new-election-empty");
    await page.getByPlaceholder("Student Senate 2026").fill("Library committee");
    await page.getByRole("button", { name: "Add a candidate" }).click();
    await page.getByLabel("Name of candidate 1").fill("Asha");
    await page.getByLabel("Name of candidate 2").fill("Ravi");
    await page.getByLabel("Name of candidate 3").fill("Meera");
    await expect(page.getByLabel("Anonymous ballots")).toBeChecked();
    await page.getByLabel("Approval").check();
    await screenshot(page, "03-new-election-filled");
    await page.getByRole("button", { name: "Create election" }).click();
    await page.waitForURL(/\/elections\/0x[0-9a-fA-F]{40}$/);
    election = new URL(page.url()).pathname;
    // Next keeps the form page mounted but hidden, so only visible matches count.
    await expect(page.getByText("Anonymous ballots").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Approval voting").filter({ visible: true })).toBeVisible();
    await screenshot(page, "04-election-created");
  });

  await test.step("registration opens", async () => {
    await skipAhead(page);
    await expect(page.getByRole("link", { name: "Register to vote" })).toBeVisible();
    await screenshot(page, "05-election-registration-open");
  });

  for (const [index] of ballots.entries()) {
    await test.step(`voter ${index + 1} makes a voting key and registers it`, async () => {
      const voter = await voterBrowser(browser, errors);
      voters.push(voter);
      const email = `anon${index}.${run}@hyderabad.bits-pilani.ac.in`;
      await voter.page.goto(`${election}/register`);
      if (index === 0) await screenshot(voter.page, "06-register-no-key");
      const download = voter.page.waitForEvent("download");
      await voter.page.getByRole("button", { name: "Create my voting key" }).click();
      const backup = await (await download).path();
      voters[index]!.backup = (await readFile(backup)).toString();
      await expect(voter.page.getByText("This browser holds your voting key")).toBeVisible();
      await signInWithGoogle(voter.page, email);
      if (index === 0) await screenshot(voter.page, "07-register-signed-in");
      await voter.page.getByRole("button", { name: "Register my voting key" }).click();
      await expect(voter.page.getByText("You're registered")).toBeVisible();
      await voter.page.getByText("Your registration receipt", { exact: true }).click();
      await expect(
        voter.page.getByText("Checked: signed by the registrar named in this election's contract"),
      ).toBeVisible();
      if (index === 0) await screenshot(voter.page, "08-register-done");
    });
  }

  await test.step("the registration page never takes a key from a link", async () => {
    // A link carrying someone else's key must not get that key registered under a victim's email.
    const visitor = await voterBrowser(browser, errors);
    const planted = JSON.parse(voters[0]!.backup ?? "{}") as { privateKey: string };
    await visitor.page.goto(`${election}/register#key=${encodeURIComponent(planted.privateKey)}`);
    await expect(visitor.page.getByRole("button", { name: "Create my voting key" })).toBeVisible();
    await expect(visitor.page.getByText("This browser holds your voting key")).toHaveCount(0);
    await visitor.context.close();
  });

  await test.step("registration closes and the registrar publishes the identity list", async () => {
    await page.goto(election);
    await skipAhead(page);
    await expect(page.getByText(/The voter list has 3 voters/)).toBeVisible({ timeout: 30_000 });
    await screenshot(page, "09-election-list-published");
  });

  await test.step("voting opens", async () => {
    await skipAhead(page);
    await page.getByRole("button", { name: "Open voting" }).click();
    await expect(page.getByRole("link", { name: "Go to the ballot booth" })).toBeVisible();
    await screenshot(page, "10-election-voting-open");
  });

  await test.step("the third voter moves to a new browser with their backup", async () => {
    const moved = await voterBrowser(browser, errors);
    await voters[2]!.context.close();
    await moved.page.goto(`${election}/vote`);
    await expect(moved.page.getByText("doesn't have your voting key yet")).toBeVisible();
    await screenshot(moved.page, "11-booth-no-key");
    await moved.page.getByLabel("Choose my key file").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(voters[2]!.backup ?? ""),
    });
    voters[2] = { ...moved, backup: voters[2]!.backup };
  });

  await test.step("the second voter moves to a new browser with the private link", async () => {
    const { page: source } = voters[1]!;
    await source.goto(`${election}/register`);
    await source.getByRole("button", { name: "Share or copy the link" }).click();
    await expect(source.getByRole("button", { name: "Link copied" })).toBeVisible();
    const link = await source.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain("#key=");
    const moved = await voterBrowser(browser, errors);
    await voters[1]!.context.close();
    await moved.page.goto(link);
    // The key is taken out of the address bar at once, and used only once the voter confirms.
    await expect(moved.page).not.toHaveURL(/#key=/);
    await moved.page.getByRole("button", { name: "Use this key" }).click();
    voters[1] = { ...moved, backup: voters[1]!.backup };
  });

  await test.step("a key in a link never replaces the key a browser holds", async () => {
    const { page: holder } = voters[0]!;
    const other = JSON.parse(voters[2]!.backup ?? "{}") as { privateKey: string };
    await holder.goto(`${election}/vote#key=${encodeURIComponent(other.privateKey)}`);
    await expect(holder.getByText("the key in the link was not used")).toBeVisible();
    await expect(holder).not.toHaveURL(/#key=/);
  });

  for (const [index, marks] of ballots.entries()) {
    await test.step(`voter ${index + 1} votes anonymously, for ${marks.join(" and ")}`, async () => {
      const { page: booth } = voters[index]!;
      await booth.goto(`${election}/vote`);
      await expect(booth.getByText("on the voter list, checked in this browser")).toBeVisible();
      for (const name of marks) await booth.getByLabel(name, { exact: true }).check();
      if (index === 0) await screenshot(booth, "12-booth-marked");
      await booth.getByRole("button", { name: /Cast my ballot, no wallet needed/ }).click();
      await expect(booth.getByText("You have voted")).toBeVisible({ timeout: 90_000 });
      if (index === 0) await screenshot(booth, "13-booth-voted");
    });
  }

  await test.step("a voter who has voted is told so, even in a fresh browser", async () => {
    const again = await voterBrowser(browser, errors);
    await again.page.goto(`${election}/vote`);
    await again.page.getByLabel("Choose my key file").setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(voters[0]!.backup ?? ""),
    });
    // Known from the key's nullifier before any proof is made, so no ballot form is offered.
    await expect(again.page.getByText("You have voted")).toBeVisible();
    await expect(again.page.getByRole("button", { name: /Cast my ballot/ })).toHaveCount(0);
    await screenshot(again.page, "14-booth-already-voted");
    await again.context.close();
  });

  await test.step("anyone closes voting and finalizes the result", async () => {
    await page.goto(election);
    await skipAhead(page);
    await page.getByRole("button", { name: "Close voting" }).click();
    await page.getByRole("button", { name: "Finalize the result" }).click();
    await expect(page.getByText("The result is final")).toBeVisible();
    await expect(page.getByText("Asha won with 3 approvals.")).toBeVisible();
    await expect(page.getByText("3 approvals", { exact: true })).toBeVisible();
    await expect(page.getByText("1 approval", { exact: true })).toHaveCount(2);
    await expect(page.getByText("Winner")).toHaveCount(1);
  });

  await test.step("an observer audits the election with our services unreachable (D4)", async () => {
    // Every request to the API, the indexer and the relayer fails while the audit runs: it must
    // pass from the chain and IPFS alone.
    const services = /^http:\/\/(127\.0\.0\.1|localhost):(4000|4100)\//;
    let blocked = 0;
    await page.route(services, (route) => {
      blocked++;
      return route.abort();
    });
    await page.getByRole("button", { name: "Run the audit" }).click();
    await expect(page.getByText("Every check passed")).toBeVisible({ timeout: 60_000 });
    await page.unroute(services);
    test
      .info()
      .annotations.push({ type: "D4", description: `${blocked} requests to our services blocked` });
    await screenshot(page, "16-election-audited");
  });

  await test.step("the indexer lists every ballot, by nullifier only", async () => {
    await expect(page.locator("tbody tr")).toHaveCount(3);
    await screenshot(page, "15-election-final");
  });

  await test.step("a voter's own browser marks their ballot in the list", async () => {
    const { page: own } = voters[0]!;
    await own.goto(election);
    await expect(own.locator("tbody tr").filter({ hasText: "yours" })).toHaveCount(1);
    await screenshot(own, "17-election-final-voter");
  });

  for (const voter of voters) await voter.context.close();
  expect(errors).toEqual([]);
});
