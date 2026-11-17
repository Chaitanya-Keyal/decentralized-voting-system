// The backup video of the demo: the story of docs/demo.md, recorded from one browser on a local
// chain, in dark mode, with a title card, a caption for each step and room for a spoken narration.
// Two more voters register and vote in browsers that are not recorded, so the election has more
// than one ballot.
//
//   E2E_VIDEO=1 E2E_VIDEO_OUT=/tmp/demo.webm pnpm e2e --grep "backup video"
//
// The narration is narration.json, one line per step. With E2E_NARRATION_MS set to a JSON object
// giving each line's spoken length in milliseconds, each step lasts at least as long as its line,
// and the moment each line starts is written next to the video as <E2E_VIDEO_OUT>.timeline.json,
// for laying the spoken lines over it with ffmpeg. The narration in docs/demo-backup.mp4 was
// spoken by Kokoro-82M, voice af_heart.
import { readFileSync, writeFileSync } from "node:fs";

import { expect, test, type Browser, type Page } from "@playwright/test";

import { connect, emailedCode, skipAhead } from "./helpers";

test.use({ launchOptions: { slowMo: 120 } });

// Full HD, with every page zoomed to twice its size: laid out as on a 960-pixel screen, so text is
// large, and drawn at full resolution, so it is sharp. (Playwright records at the page's size in
// CSS pixels, whatever the device's pixel density.)
const SIZE = { width: 1920, height: 1080 };
const ZOOM = "2";

const lines = JSON.parse(readFileSync(new URL("narration.json", import.meta.url), "utf8")) as {
  id: string;
  text: string;
}[];
const spoken = JSON.parse(process.env.E2E_NARRATION_MS ?? "{}") as Record<string, number>;

/** Captions over the page, kept across navigations, and the time each one appeared. */
function narrator(page: Page, startedAt: number) {
  const timeline: { id: string; at: number }[] = [];
  let current = "";
  const show = (text: string) =>
    page
      .evaluate((caption) => {
        let bar = document.getElementById("demo-caption");
        if (!bar) {
          bar = document.createElement("div");
          bar.id = "demo-caption";
          Object.assign(bar.style, {
            position: "fixed",
            insetInline: "0",
            bottom: "14px",
            margin: "0 auto",
            width: "fit-content",
            maxWidth: "90%",
            zIndex: "2147483646",
            background: "rgba(9, 9, 11, 0.9)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            boxShadow: "0 8px 30px rgba(0, 0, 0, 0.45)",
            color: "#f4f4f5",
            font: "500 17px/1.45 var(--font-geist-sans), system-ui, sans-serif",
            padding: "10px 18px",
            borderRadius: "12px",
            textAlign: "center",
            textWrap: "balance",
            pointerEvents: "none",
          });
          document.body.appendChild(bar);
          // Room below the content, so nothing has to sit under the caption.
          document.body.style.paddingBottom = "96px";
        }
        bar.textContent = caption;
        bar.style.display = caption ? "block" : "none";
      }, text)
      .catch(() => undefined);
  page.on("load", () => void show(current));

  /** Speaks line `id` while `work` runs, and waits for whichever takes longer. */
  const say = async (id: string, work?: () => Promise<unknown>) => {
    const line = lines.find((candidate) => candidate.id === id);
    if (!line) throw new Error(`No narration line ${id}`);
    current = line.text;
    timeline.push({ id, at: Date.now() - startedAt });
    await show(current);
    await Promise.all([page.waitForTimeout((spoken[id] ?? 2_600) + 400), work?.()]);
  };
  return { say, timeline };
}

/** A full-screen card, for the opening and the close. */
async function card(page: Page, shown: boolean) {
  await page.evaluate((visible) => {
    document.getElementById("demo-card")?.remove();
    if (!visible) return;
    const card = document.createElement("div");
    card.id = "demo-card";
    card.innerHTML = `
      <img src="/icon.svg" alt="" width="88" height="88" style="border-radius:20px" />
      <div style="font:700 56px/1.1 var(--font-geist-sans),system-ui;letter-spacing:-0.02em">DVote</div>
      <div style="font:400 22px/1.4 var(--font-geist-sans),system-ui;color:#a1a1aa;text-align:center">
        Secret-ballot elections whose count anyone can check</div>
      <div style="font:500 15px/1 var(--font-geist-sans),system-ui;color:#71717a;margin-top:6px">
        BITS F452 · Group 6</div>`;
    Object.assign(card.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483645",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "14px",
      background: "#09090b",
      color: "#f4f4f5",
    });
    document.body.appendChild(card);
  }, shown);
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

/** Marks a candidate and casts the ballot through the relayer, without waiting for it. */
async function cast(page: Page, election: string, candidate: string) {
  await page.goto(`${election}/vote`);
  await expect(page.getByText("on the voter list, checked in this browser")).toBeVisible();
  // The ballot in the middle of the screen, clear of the caption.
  await page
    .getByText("Your anonymous ballot")
    .evaluate((title) => title.scrollIntoView({ block: "center" }));
  await page.getByLabel(candidate, { exact: true }).check();
  await page.getByRole("button", { name: /Cast my ballot, no wallet needed/ }).click();
}

async function vote(page: Page, election: string, candidate: string) {
  await cast(page, election, candidate);
  await expect(page.getByText("You have voted")).toBeVisible({ timeout: 60_000 });
}

async function disconnect(page: Page) {
  await page.locator("header").getByRole("button").last().click();
  await page.getByRole("button", { name: "Disconnect" }).click();
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
    colorScheme: "dark",
    recordVideo: { dir: "test-results/video", size: SIZE },
    acceptDownloads: true,
  });
  await context.addInitScript((zoom) => {
    const apply = () => document.documentElement.style.setProperty("zoom", zoom);
    if (document.documentElement) apply();
    else {
      new MutationObserver((_, observer) => {
        if (!document.documentElement) return;
        apply();
        observer.disconnect();
      }).observe(document, { childList: true });
    }
  }, ZOOM);
  const page = await context.newPage();
  const { say, timeline } = narrator(page, Date.now());
  const run = Date.now();
  const others = [await otherVoter(browser), await otherVoter(browser)];
  let election = "";

  await page.goto("/");
  await card(page, true);
  await say("intro");
  await card(page, false);

  await say("create", async () => {
    await connect(page, 0);
    await page.goto("/elections/new");
    await page.getByLabel("Title", { exact: true }).fill("Library committee");
    await page.getByLabel("Name of candidate 1").fill("Asha");
    await page.getByLabel("Name of candidate 2").fill("Ravi");
    await expect(page.getByLabel("Anonymous ballots")).toBeChecked();
    await page.getByRole("button", { name: "Create election" }).click();
    await page.waitForURL(/\/elections\/0x[0-9a-fA-F]{40}$/);
    election = new URL(page.url()).pathname;
    await expect(page.getByText("Anonymous ballots").filter({ visible: true })).toBeVisible();
  });
  await say("clock", async () => {
    await skipAhead(page);
    await expect(page.getByRole("link", { name: "Register to vote" })).toBeVisible();
  });

  await say("register", async () => {
    await disconnect(page);
    await register(page, election, `demo0.${run}@hyderabad.bits-pilani.ac.in`);
  });
  await say("key", async () => {
    for (const [index, other] of others.entries()) {
      await register(other.page, election, `demo${index + 1}.${run}@hyderabad.bits-pilani.ac.in`);
    }
  });

  await page.goto(election);
  await say("list", async () => {
    await skipAhead(page);
    const list = page.getByText(/The voter list has 3 voters/);
    await expect(list).toBeVisible({ timeout: 30_000 });
    await list.scrollIntoViewIfNeeded();
  });
  await say("open", async () => {
    await skipAhead(page);
    await connect(page, 1);
    await page.getByRole("button", { name: "Open voting" }).click();
    await expect(page.getByRole("link", { name: "Go to the ballot booth" })).toBeVisible();
    await disconnect(page);
  });

  await say("vote", () => cast(page, election, "Asha"));
  // The other voters vote while this line plays, so that their proving, which takes the
  // processor, is over before this page loads again.
  await say("relayed", async () => {
    await expect(page.getByText("You have voted")).toBeVisible({ timeout: 60_000 });
    await vote(others[0]!.page, election, "Ravi");
    await vote(others[1]!.page, election, "Asha");
  });
  await page.reload();
  await expect(page.getByText("You have voted")).toBeVisible({ timeout: 60_000 });
  await say("again");

  await page.goto(election);
  await say("close", async () => {
    await skipAhead(page);
    await connect(page, 2);
    await page.getByRole("button", { name: "Close voting" }).click();
    await page.getByRole("button", { name: "Finalize the result" }).click();
    await expect(page.getByText("The result is final")).toBeVisible();
  });
  await say("result", () => page.getByRole("table").scrollIntoViewIfNeeded());
  await say("audit", async () => {
    await page.getByRole("button", { name: "Run the audit" }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Run the audit" }).click();
    await expect(page.getByText("Every check passed")).toBeVisible({ timeout: 60_000 });
  });
  await say("passed", () =>
    page.getByText("Every check passed, using only the chain and IPFS").scrollIntoViewIfNeeded(),
  );

  await card(page, true);
  await say("outro");

  const video = page.video();
  await context.close();
  for (const other of others) await other.context.close();
  const out = process.env.E2E_VIDEO_OUT;
  if (video && out) {
    await video.saveAs(out);
    writeFileSync(`${out}.timeline.json`, JSON.stringify(timeline, null, 1));
  }
});
