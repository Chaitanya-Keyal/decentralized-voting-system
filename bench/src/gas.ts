// A1 and C1: the gas of publishing a voter list and of casting a ballot, in both tiers, across roll
// sizes. Each point is a real election on a local Anvil node, as the deployed contracts run it.
// Gas is deterministic, so one run per point suffices.
//
//   anvil & pnpm deploy:local && pnpm --filter @dvote/bench gas [max power of two, default 16]
import { mkdir, writeFile } from "node:fs/promises";

import {
  buildIdentityList,
  buildVoterList,
  Identity,
  identityTree,
  merkleElectionAbi,
  proveBallot,
  rootToBytes32,
  semaphoreElectionAbi,
  voterProof,
  voterTree,
} from "@dvote/shared";
import { anvil } from "viem/chains";

import { ensureArtifacts } from "../../packages/shared/scripts/semaphore-artifacts.mjs";
import { ACCOUNTS, newElection, publishAndOpen, send } from "./chain";
import { csv, fillAddresses, fillCommitments, rollSizes } from "./fill";

const ARTIFACTS = new URL("../.cache/semaphore-artifacts/", import.meta.url).pathname;
const RESULTS = new URL("../results/", import.meta.url).pathname;

const max = Number(process.argv[2] ?? 16);
const rows: { tier: number; operation: string; roll_size: number; gas: bigint }[] = [];
const record = (tier: number, operation: string, roll_size: number, gas: bigint) => {
  rows.push({ tier, operation, roll_size, gas });
  console.log(
    `tier ${tier}  ${operation.padEnd(12)} roll ${String(roll_size).padStart(6)}  ${gas}`,
  );
};

async function tier2(size: number) {
  const { election, schedule } = await newElection(2, `Tier 2, ${size} voters`);
  const list = buildVoterList({
    chainId: anvil.id,
    election,
    voters: fillAddresses(size, [ACCOUNTS.first, ACCOUNTS.second]),
  });
  const tree = voterTree(list.voters);
  record(
    2,
    "publish_roll",
    size,
    await publishAndOpen(election, schedule, tree.root as `0x${string}`, size),
  );
  // The second ballot, for the same candidate as the first, is the typical one: the first also
  // pays to write the tally's storage for the first time.
  let gas = 0n;
  for (const voter of [ACCOUNTS.first, ACCOUNTS.second]) {
    ({ gasUsed: gas } = await send({
      address: election,
      abi: merkleElectionAbi,
      functionName: "castVote",
      args: [0n, voterProof(tree, voter)],
      account: voter,
    }));
  }
  record(2, "cast_vote", size, gas);
}

async function tier3(size: number) {
  const voters = [new Identity("dvote bench first"), new Identity("dvote bench second")];
  const { election, schedule } = await newElection(3, `Tier 3, ${size} voters`);
  const list = buildIdentityList({
    chainId: anvil.id,
    election,
    commitments: fillCommitments(
      size,
      voters.map((voter) => voter.commitment),
    ),
  });
  const tree = identityTree(list.commitments);
  const root = rootToBytes32(tree.root);
  record(3, "publish_roll", size, await publishAndOpen(election, schedule, root, size));
  let gas = 0n;
  for (const voter of voters) {
    const ballot = await proveBallot({
      identity: voter,
      tree,
      election,
      choice: 0n,
      artifacts: (depth) => ({
        wasm: `${ARTIFACTS}semaphore-${depth}.wasm`,
        zkey: `${ARTIFACTS}semaphore-${depth}.zkey`,
      }),
    });
    // Anyone may submit an anonymous ballot; the authority's account pays here.
    ({ gasUsed: gas } = await send({
      address: election,
      abi: semaphoreElectionAbi,
      functionName: "castVote",
      args: [ballot.choice, ballot.nullifier, ballot.points],
      account: ACCOUNTS.authority,
    }));
  }
  record(3, "cast_vote", size, gas);
}

const sizes = rollSizes(max);
await ensureArtifacts(
  ARTIFACTS,
  Array.from({ length: max }, (_, i) => i + 1),
);
for (const size of sizes) {
  await tier2(size);
  await tier3(size);
}
await mkdir(RESULTS, { recursive: true });
await writeFile(`${RESULTS}gas.csv`, csv(rows));
console.log(`Wrote ${RESULTS}gas.csv`);

// snarkjs leaves worker threads running, which would keep the process alive.
process.exit(0);
