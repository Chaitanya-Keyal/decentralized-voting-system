// C3: the concurrent-voter ceiling. For each load, a tier 3 election with that many registered
// voters, every one of whom casts a ballot through the relayer at the same moment, on a local
// Anvil node that mines a block every 12 seconds, as Ethereum does. Records when each ballot was
// accepted and when it was counted, and in which block, to find what gives way first.
//
// Needs a fresh Anvil with the contracts deployed (`pnpm deploy:local`) and a relayer for it with
// a rate limit high enough not to refuse the burst (RELAYER_RATE_LIMIT), then:
//
//   pnpm --filter @dvote/bench load [loads, default 16,64,256]
//
// RELAYER_URL (default http://127.0.0.1:4100), BENCH_BLOCK_TIME (seconds, default 12) and
// BENCH_LABEL (a name for the relayer's configuration, written into the results) are optional.
import { mkdir, writeFile } from "node:fs/promises";

import {
  buildIdentityList,
  Identity,
  identityTree,
  proveBallot,
  rootToBytes32,
} from "@dvote/shared";
import type { Hex } from "viem";
import { anvil } from "viem/chains";

import { ensureArtifacts } from "../../packages/shared/scripts/semaphore-artifacts.mjs";
import { newElection, node, publishAndOpen } from "./chain";
import { csv } from "./fill";

const ARTIFACTS = new URL("../.cache/semaphore-artifacts/", import.meta.url).pathname;
const RESULTS = new URL("../results/", import.meta.url).pathname;
const RELAYER_URL = process.env.RELAYER_URL ?? "http://127.0.0.1:4100";
const BLOCK_TIME = Number(process.env.BENCH_BLOCK_TIME ?? 12);
const LABEL = process.env.BENCH_LABEL ?? "default";

const loads = (process.argv[2] ?? "16,64,256").split(",").map(Number);
const rows: {
  relayer: string;
  load: number;
  ballot: number;
  outcome: string;
  accepted_ms: number;
  counted_ms: number;
  block: number;
}[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const depthFor = (count: number) => Math.max(1, Math.ceil(Math.log2(count)));

await ensureArtifacts(ARTIFACTS, [...new Set(loads.map(depthFor))]);

for (const load of loads) {
  const voters = Array.from({ length: load }, (_, i) => new Identity(`dvote load ${load} ${i}`));
  const { election, schedule } = await newElection(3, `Load ${load}`);
  const list = buildIdentityList({
    chainId: anvil.id,
    election,
    commitments: voters.map((voter) => voter.commitment),
  });
  const tree = identityTree(list.commitments);
  await publishAndOpen(election, schedule, rootToBytes32(tree.root), load);

  console.log(`load ${load}: proving ${load} ballots`);
  const ballots = [];
  for (const [index, voter] of voters.entries()) {
    ballots.push(
      await proveBallot({
        identity: voter,
        tree,
        election,
        choice: BigInt(index % 2),
        artifacts: (depth) => ({
          wasm: `${ARTIFACTS}semaphore-${depth}.wasm`,
          zkey: `${ARTIFACTS}semaphore-${depth}.zkey`,
        }),
      }),
    );
  }

  await node.setIntervalMining({ interval: BLOCK_TIME });
  const firstBlock = await node.getBlockNumber();
  const start = performance.now();
  const outcomes = await Promise.all(
    ballots.map(async (ballot, index) => {
      const row = { relayer: LABEL, load, ballot: index + 1, accepted_ms: -1, counted_ms: -1 };
      const response = await fetch(`${RELAYER_URL}/ballots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          election,
          choice: ballot.choice.toString(),
          nullifier: ballot.nullifier.toString(),
          points: ballot.points.map(String),
        }),
      }).catch(() => undefined);
      if (!response?.ok) {
        return { ...row, outcome: `refused ${response?.status ?? "no answer"}`, block: -1 };
      }
      row.accepted_ms = Math.round(performance.now() - start);
      const { id } = (await response.json()) as { id: string };
      for (;;) {
        await sleep(1_000);
        const status = (await (await fetch(`${RELAYER_URL}/ballots/${id}`)).json()) as {
          status: string;
          txHash?: Hex;
        };
        if (status.status === "failed") return { ...row, outcome: "failed", block: -1 };
        if (status.status === "mined" && status.txHash) {
          row.counted_ms = Math.round(performance.now() - start);
          const receipt = await node.getTransactionReceipt({ hash: status.txHash });
          return { ...row, outcome: "counted", block: Number(receipt.blockNumber - firstBlock) };
        }
      }
    }),
  );
  await node.setAutomine(true);
  rows.push(...outcomes);

  const counted = outcomes.filter((outcome) => outcome.outcome === "counted");
  const perBlock = new Map<number, number>();
  for (const { block } of counted) perBlock.set(block, (perBlock.get(block) ?? 0) + 1);
  const last = Math.max(...outcomes.map((outcome) => outcome.counted_ms));
  const accepted = Math.max(...outcomes.map((outcome) => outcome.accepted_ms));
  console.log(
    `load ${load}: ${counted.length} counted, ${load - counted.length} not; all accepted within ` +
      `${(accepted / 1000).toFixed(1)} s, the last counted after ${(last / 1000).toFixed(1)} s, ` +
      `over ${perBlock.size} blocks, at most ${Math.max(...perBlock.values())} in one`,
  );
}

await mkdir(RESULTS, { recursive: true });
const file = `${RESULTS}load-${LABEL}.csv`;
await writeFile(file, csv(rows));
console.log(`Wrote ${file}`);

// snarkjs leaves worker threads running, which would keep the process alive.
process.exit(0);
