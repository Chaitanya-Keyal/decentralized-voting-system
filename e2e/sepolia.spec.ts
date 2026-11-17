// The whole system on Sepolia, in real time: the authority's steps are sent from a script, and
// two voters with no wallets register, vote anonymously through the relayer, and audit the result
// in the browser. It also measures B1, the time from pressing "Cast" to seeing the ballot counted.
//
//   E2E_SEPOLIA=1 AUTHORITY_PRIVATE_KEY=0x... pnpm e2e --grep "on Sepolia"
//
// It needs the stack running against Sepolia (registrar, indexer, relayer, web app) with the API
// pointed at the Google sign-in stand-in's keys (google.ts), and AUTHORITY_PRIVATE_KEY for a funded
// account the registrar serves.
import { mkdir, writeFile } from "node:fs/promises";

import { expect, test, type Browser } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  http,
  pad,
  parseAbiItem,
  parseEventLogs,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

// The ABIs and addresses only: the package index also loads JSON, which Playwright's loader refuses.
import { deploymentFor } from "../packages/shared/src/deployment";
import { electionFactoryAbi, merkleElectionAbi } from "../packages/shared/src/generated";
import { signInWithGoogle, useGoogleStandIn } from "./google";

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const API = process.env.E2E_API_URL ?? "http://127.0.0.1:4000";
const RESULTS = new URL("../bench/results/", import.meta.url).pathname;
/** Voters to register and vote; each ballot is one B1 sample. */
const VOTERS = Number(process.env.E2E_SEPOLIA_VOTERS ?? 2);
/** With E2E_SEPOLIA_BURST=1, every voter presses Cast at the same moment, as a room would. */
const BURST = Boolean(process.env.E2E_SEPOLIA_BURST);

async function voterBrowser(browser: Browser, errors: string[]) {
  const context = await browser.newContext({ acceptDownloads: true });
  await useGoogleStandIn(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page };
}

test("an anonymous election runs end to end on Sepolia", async ({ page, browser }) => {
  test.skip(!process.env.E2E_SEPOLIA, "Set E2E_SEPOLIA=1 and AUTHORITY_PRIVATE_KEY");
  test.setTimeout(45 * 60_000);

  const transport = http(RPC);
  const node = createPublicClient({ chain: sepolia, transport, pollingInterval: 2_000 });
  const authority = createWalletClient({
    account: privateKeyToAccount(process.env.AUTHORITY_PRIVATE_KEY as Hex),
    chain: sepolia,
    transport,
  });
  const deployment = deploymentFor(sepolia.id);
  if (!deployment) throw new Error("DVote is not deployed on Sepolia");
  const config = (await (await fetch(`${API}/config`)).json()) as { registrar: Address };

  /** Waits until the chain has passed `timestamp` by two blocks: a public RPC may lag a block. */
  const waitForChain = async (timestamp: bigint) => {
    await expect
      .poll(async () => (await node.getBlock()).timestamp >= timestamp + 24n, {
        timeout: 20 * 60_000,
        intervals: [5_000],
      })
      .toBe(true);
  };
  /** Sends a step from the authority, retrying a simulation that hit a lagging node. */
  const step = async (
    election: Address,
    functionName: "openVoting" | "closeVoting" | "finalize",
  ) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const { request } = await node.simulateContract({
          account: authority.account,
          address: election,
          abi: merkleElectionAbi,
          functionName,
        });
        const hash = await authority.writeContract(request);
        await node.waitForTransactionReceipt({ hash });
        return;
      } catch (error) {
        if (attempt === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 12_000));
      }
    }
  };

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const run = Date.now();
  const timings: { voter: number; ms: number; toBlockMs: number }[] = [];
  let createdIn = 0n;
  let election: Address = "0x";

  const { timestamp: now } = await node.getBlock();
  const schedule = {
    registrationStart: now + 60n,
    // About 30 s per voter to register, and as long to vote, with room to spare.
    registrationEnd: now + 120n + BigInt(VOTERS * 45),
    votingStart: now + 240n + BigInt(VOTERS * 45),
    votingEnd: now + 600n + BigInt(VOTERS * 90),
  };

  await test.step("the authority creates an anonymous election on Sepolia", async () => {
    const hash = await authority.writeContract({
      address: deployment.semaphoreFactory,
      abi: electionFactoryAbi,
      functionName: "createElection",
      args: [
        config.registrar,
        0,
        `Sepolia end-to-end ${new Date(run).toISOString().slice(0, 16)}`,
        "",
        schedule,
        [
          { name: "Asha", manifestoCid: "" },
          { name: "Ravi", manifestoCid: "" },
        ],
      ],
    });
    const receipt = await node.waitForTransactionReceipt({ hash });
    createdIn = receipt.blockNumber;
    const [created] = parseEventLogs({
      abi: electionFactoryAbi,
      eventName: "ElectionCreated",
      logs: receipt.logs,
    });
    election = created!.args.election;
    await page.goto(`/elections/${election}`);
    await expect(page.getByText("Anonymous ballots").filter({ visible: true })).toBeVisible({
      timeout: 120_000,
    });
  });

  const voters: Awaited<ReturnType<typeof voterBrowser>>[] = [];
  await test.step(`${VOTERS} voters with no wallets register`, async () => {
    await waitForChain(schedule.registrationStart);
    for (let index = 0; index < VOTERS; index++) {
      const voter = await voterBrowser(browser, errors);
      voters.push(voter);
      const email = `sepolia${index}.${run}@hyderabad.bits-pilani.ac.in`;
      await voter.page.goto(`/elections/${election}/register`);
      const download = voter.page.waitForEvent("download");
      await voter.page.getByRole("button", { name: "Create my voting key" }).click();
      await download;
      await signInWithGoogle(voter.page, email);
      await voter.page.getByRole("button", { name: "Register my voting key" }).click();
      await expect(voter.page.getByText("You're registered")).toBeVisible({ timeout: 60_000 });
    }
  });

  await test.step("registration closes and the registrar publishes the list on Sepolia", async () => {
    await waitForChain(schedule.registrationEnd);
    await page.goto(`/elections/${election}`);
    await expect(page.getByText(`The voter list has ${VOTERS} voters`)).toBeVisible({
      timeout: 5 * 60_000,
    });
  });

  await test.step("voting opens", async () => {
    await waitForChain(schedule.votingStart);
    await step(election, "openVoting");
  });

  /**
   * When the block holding this voter's ballot was produced, found by the nullifier the booth kept.
   * From the click to that moment is proving, the relayer and waiting for a slot; the rest of the
   * time to "counted" is the booth noticing.
   */
  const blockTime = async (voter: (typeof voters)[number]) => {
    const stored = await voter.page.evaluate(
      (key) => localStorage.getItem(key),
      `dvote.anonymous-ballot.${sepolia.id}.${election}`.toLowerCase(),
    );
    const { nullifier } = JSON.parse(stored ?? "{}") as { nullifier?: string };
    // A load-balanced node may not have the block yet, so the search is tried again for a while.
    for (let attempt = 0; attempt < 10; attempt++) {
      const [log] = await node.getLogs({
        address: election,
        event: parseAbiItem("event VoteCast(bytes32 indexed key, uint256 indexed choice)"),
        args: { key: pad(toHex(BigInt(nullifier ?? 0))) },
        fromBlock: createdIn,
        toBlock: "latest",
      });
      if (log) {
        const block = await node.getBlock({ blockNumber: log.blockNumber });
        return Number(block.timestamp) * 1000;
      }
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
    return Number.NaN;
  };
  const ready = async (voter: (typeof voters)[number], index: number) => {
    await voter.page.goto(`/elections/${election}/vote`);
    await expect(voter.page.getByText("on the voter list, checked in this browser")).toBeVisible({
      timeout: 120_000,
    });
    await voter.page.getByLabel(index % 2 === 0 ? "Asha" : "Ravi", { exact: true }).check();
  };
  const cast = async (voter: (typeof voters)[number], index: number) => {
    const started = Date.now();
    await voter.page.getByRole("button", { name: /Cast my ballot, no wallet needed/ }).click();
    await expect(voter.page.getByText("You have voted")).toBeVisible({ timeout: 5 * 60_000 });
    const ms = Date.now() - started;
    timings.push({ voter: index + 1, ms, toBlockMs: (await blockTime(voter)) - started });
  };
  if (BURST) {
    await test.step(`${VOTERS} voters cast their ballots at the same moment`, async () => {
      for (const [index, voter] of voters.entries()) await ready(voter, index);
      await Promise.all(voters.map((voter, index) => cast(voter, index)));
    });
  } else {
    for (const [index, voter] of voters.entries()) {
      await test.step(`voter ${index + 1} votes through the relayer`, async () => {
        await ready(voter, index);
        await cast(voter, index);
      });
    }
  }

  // Saved now, so a later failure does not lose them.
  await mkdir(RESULTS, { recursive: true });
  await writeFile(
    `${RESULTS}b1-sepolia-${BURST ? "burst-" : ""}${new Date(run).toISOString().slice(0, 16).replace(/[-:T]/g, "")}.csv`,
    [
      "voter,election,click_to_counted_ms,click_to_block_ms",
      ...timings.map((t) => `${t.voter},${election},${t.ms},${t.toBlockMs}`),
    ]
      .join("\n")
      .concat("\n"),
  );

  await test.step("voting closes, the authority finalizes, and an observer audits", async () => {
    await waitForChain(schedule.votingEnd);
    await step(election, "closeVoting");
    await step(election, "finalize");
    await page.goto(`/elections/${election}`);
    await expect(page.getByText("The result is final")).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: "Run the audit" }).click();
    await expect(page.getByText("Every check passed")).toBeVisible({ timeout: 5 * 60_000 });
  });

  for (const voter of voters) await voter.context.close();
  expect(errors).toEqual([]);
});
