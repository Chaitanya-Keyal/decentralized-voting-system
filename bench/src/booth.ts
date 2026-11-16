// C2 (and B2 for this machine): the booth's two costs, timed separately across roll sizes:
// rebuilding the voter tree from the published list, which grows with the roll, and proving,
// which should grow only with the tree's depth. Runs in Node, single-threaded, as a browser's
// worker would; the device is named in every row.
//
//   BENCH_DEVICE=<name> pnpm --filter @dvote/bench booth [max power of two, default 16] [runs, default 5]
import { mkdir, writeFile } from "node:fs/promises";

import { Identity, identityTree, proveBallot } from "@dvote/shared";
import type { Address } from "viem";

import { ensureArtifacts } from "../../packages/shared/scripts/semaphore-artifacts.mjs";
import { csv, fillCommitments, rollSizes } from "./fill";

const ARTIFACTS = new URL("../.cache/semaphore-artifacts/", import.meta.url).pathname;
const RESULTS = new URL("../results/", import.meta.url).pathname;
const ELECTION: Address = "0x1000000000000000000000000000000000000001";

const max = Number(process.argv[2] ?? 16);
const runs = Number(process.argv[3] ?? 5);
const device = process.env.BENCH_DEVICE ?? "node";

const voter = new Identity("dvote bench voter");
const rows: { device: string; roll_size: number; phase: string; run: number; ms: number }[] = [];

await ensureArtifacts(
  ARTIFACTS,
  Array.from({ length: max }, (_, i) => i + 1),
);
for (const size of rollSizes(max)) {
  const commitments = fillCommitments(size, [voter.commitment]).map(String);
  for (let run = 1; run <= runs; run++) {
    let started = performance.now();
    const tree = identityTree(commitments);
    rows.push({
      device,
      roll_size: size,
      phase: "tree_rebuild",
      run,
      ms: performance.now() - started,
    });

    started = performance.now();
    await proveBallot({
      identity: voter,
      tree,
      election: ELECTION,
      choice: 0n,
      artifacts: (depth) => ({
        wasm: `${ARTIFACTS}semaphore-${depth}.wasm`,
        zkey: `${ARTIFACTS}semaphore-${depth}.zkey`,
      }),
    });
    rows.push({ device, roll_size: size, phase: "prove", run, ms: performance.now() - started });
  }
  const median = (phase: string) => {
    const values = rows
      .filter((row) => row.roll_size === size && row.phase === phase)
      .map((row) => row.ms)
      .sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)]!.toFixed(0);
  };
  console.log(
    `roll ${String(size).padStart(6)}  rebuild ${median("tree_rebuild")} ms  prove ${median("prove")} ms`,
  );
}
await mkdir(RESULTS, { recursive: true });
const file = `${RESULTS}timings-${device}.csv`;
await writeFile(file, csv(rows.map((row) => ({ ...row, ms: row.ms.toFixed(1) }))));
console.log(`Wrote ${file}`);

// snarkjs leaves worker threads running, which would keep the process alive.
process.exit(0);
