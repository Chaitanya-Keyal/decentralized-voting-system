// The backup video of the demo: the same story as docs/demo.md, recorded from one browser on a
// local chain, with a caption for each step. Two more voters register and vote in browsers that
// are not recorded, so the election has more than one ballot.
//
//   E2E_VIDEO=1 E2E_VIDEO_OUT=/tmp/demo.webm pnpm e2e --grep "backup video"
import { expect, test, type Browser, type Page } from "@playwright/test";

import { connect, emailedCode, skipAhead } from "./helpers";

test.use({ launchOptions: { slowMo: 120 } });

const SIZE = { width: 1280, height: 720 };

/** A caption over the page, kept across reloads, as a narrator would add. */
function narrator(page: Page) {
  let current = "";
  const show = (text: string) =>
    page
      .evaluate((caption) => {
        let el = document.getElementById("demo-caption");
        if (!el) {
          el = document.createElement("div");
          el.id = "demo-caption";
          Object.assign(el.style, {
            position: "fixed",
            left: "50%",
            bottom: "28px",
            transform: "translateX(-50%)",
            zIndex: "2147483647",
            background: "rgba(27, 42, 65, 0.93)",
            color: "#fff",
            font: "600 19px system-ui, sans-serif",
            padding: "12px 22px",
            borderRadius: "10px",
            maxWidth: "88%",
            textAlign: "center",
            pointerEvents: "none",
          });
          document.body.appendChild(el);
        }
        el.textContent = caption;
      }, text)
      .catch(() => undefined);
  page.on("load", () => void show(current));
  return async (text: string, readMs = 2_800) => {
    current = text;
    await show(text);
    await page.waitForTimeout(readMs);
  };
}

async function register(page: Page, election: string, email: string) {
  await page.goto(`${election}/register`);
  await page.getByRole("button", { name: "Create my voting key" }).click();
  await expect(page.getByText("This browser holds your voting key")).toBeVisible();
  await page.getByLabel("Institute email address").fill(email);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("Code").fill(await emailedCode(email));
  await page.getByRole("button", { name: "Register my voting key" }).click();
  await expect(page.getByText("You're registered")).toBeVisible();
}

async function vote(page: Page, election: string, candidate: string) {
  await page.goto(`${election}/vote`);
  await expect(page.getByText("on the voter list, checked in this browser")).toBeVisible();
  await page.getByLabel(candidate, { exact: true }).check();
  await page.getByRole("button", { name: /Cast my ballot, no wallet needed/ }).click();
  await expect(page.getByText("You have voted")).toBeVisible({ timeout: 60_000 });
}

async function otherVoter(browser: Browser) {
  const context = await browser.newContext({ acceptDownloads: true });
  return { context, page: await context.newPage() };
}

test("the backup video of the demo", async ({ browser }) => {
  test.skip(!process.env.E2E_VIDEO, "Set E2E_VIDEO=1 to record the backup video");
  test.setTimeout(10 * 60_000);
  const context = await browser.newContext({
    viewport: SIZE,
    recordVideo: { dir: "test-results/video", size: SIZE },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const say = narrator(page);
  const run = Date.now();
  const others = [await otherVoter(browser), await otherVoter(browser)];

  await page.goto("/");
  await say("DVote: an anonymous election whose rules and count live in a smart contract", 3_500);
  await say("The organiser connects a wallet and creates the election");
  await connect(page, 0);
  await page.goto("/elections/new");
  await page.getByPlaceholder("Student Senate 2026").fill("Library committee");
  await page.getByLabel("Name of candidate 1").fill("Asha");
  await page.getByLabel("Name of candidate 2").fill("Ravi");
  await expect(page.getByLabel("Anonymous ballots")).toBeChecked();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Create election" }).click();
  await page.waitForURL(/\/elections\/0x[0-9a-fA-F]{40}$/);
  const election = new URL(page.url()).pathname;
  await expect(page.getByText("Anonymous ballots").filter({ visible: true })).toBeVisible();
  await say("Its schedule is fixed in the contract. On this local chain we move the clock forward");
  await skipAhead(page);
  await expect(page.getByRole("link", { name: "Register to vote" })).toBeVisible();

  await say("A student registers. They need no wallet and no cryptocurrency");
  const disconnect = page.locator("header").getByRole("button").last();
  await disconnect.click();
  await page.getByRole("button", { name: "Disconnect" }).click();
  await register(page, election, `demo0.${run}@hyderabad.bits-pilani.ac.in`);
  await say(
    "The browser made a voting key. Only a public code made from it went to the registrar",
    3_500,
  );
  for (const [index, other] of others.entries()) {
    await register(other.page, election, `demo${index + 1}.${run}@hyderabad.bits-pilani.ac.in`);
  }

  await page.goto(election);
  await say("When registration closes, the registrar publishes the list by itself");
  await skipAhead(page);
  await expect(page.getByText(/The voter list has 3 voters/)).toBeVisible({ timeout: 30_000 });
  await say(
    "The list is on IPFS; its root and size are recorded on-chain and cannot change",
    3_500,
  );
  await skipAhead(page);
  await say("Anyone can open voting once its time has come");
  await connect(page, 1);
  await page.getByRole("button", { name: "Open voting" }).click();
  await expect(page.getByRole("link", { name: "Go to the ballot booth" })).toBeVisible();
  await page.locator("header").getByRole("button").last().click();
  await page.getByRole("button", { name: "Disconnect" }).click();

  await say(
    "The student votes. The browser proves they are on the list without saying who they are",
  );
  await vote(page, election, "Asha");
  await say("The relayer checked the proof and paid the gas; the ballot is on the chain", 3_500);
  await page.reload();
  await expect(page.getByText("You have voted")).toBeVisible();
  await say("Opening the booth again: this key has voted, so there is no second ballot", 3_500);
  await vote(others[0]!.page, election, "Ravi");
  await vote(others[1]!.page, election, "Asha");

  await page.goto(election);
  await say("When voting closes, anyone can close it and finalize the result");
  await skipAhead(page);
  await connect(page, 2);
  await page.getByRole("button", { name: "Close voting" }).click();
  await page.getByRole("button", { name: "Finalize the result" }).click();
  await expect(page.getByText("The result is final")).toBeVisible();
  await say("The result is final. Each ballot is listed by its ballot ID alone", 3_500);
  await say("Anyone can audit: the page recounts from the chain and IPFS, without our services");
  await page.getByRole("button", { name: "Run the audit" }).click();
  await expect(page.getByText("Every check passed")).toBeVisible({ timeout: 60_000 });
  await page.getByText("Every check passed").scrollIntoViewIfNeeded();
  await say("Every check passed: the list, every proof, the count and the winner", 4_500);

  const video = page.video();
  await context.close();
  for (const other of others) await other.context.close();
  if (video && process.env.E2E_VIDEO_OUT) await video.saveAs(process.env.E2E_VIDEO_OUT);
});
