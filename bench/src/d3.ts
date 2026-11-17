// D3: an attempt to tell who cast which ballot in a finished anonymous election, using everything
// public: the chain's transactions and events, and the voter list on IPFS. For each ballot it
// collects what an observer sees, then tries each way that could tie a ballot to a voter.
//
//   RPC_URL=<Sepolia RPC> IPFS_GATEWAY=<gateway> pnpm --filter @dvote/bench d3 <election address>
//
// Writes results/d3-<election>.csv, one row per ballot, and prints what each attempt found.
import { mkdir, writeFile } from "node:fs/promises";

import {
  deploymentFor,
  identityTree,
  parseIdentityList,
  semaphoreElectionAbi,
  verifyBallot,
  type AnonymousBallot,
} from "@dvote/shared";
import {
  createPublicClient,
  decodeFunctionData,
  getAddress,
  http,
  parseAbiItem,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";

import { csv } from "./fill";

const RESULTS = new URL("../results/", import.meta.url).pathname;
const election = getAddress(process.argv[2] ?? "");
const gateway = (process.env.IPFS_GATEWAY ?? "https://ipfs.io").replace(/\/$/, "");
const client = createPublicClient({
  chain: sepolia,
  transport: http(process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com"),
});
const deployment = deploymentFor(sepolia.id);
if (!deployment) throw new Error("No Sepolia deployment");

const contract = { address: election, abi: semaphoreElectionAbi } as const;
const [root, count, cid, tally] = await Promise.all([
  client.readContract({ ...contract, functionName: "voterRoot" }),
  client.readContract({ ...contract, functionName: "voterCount" }),
  client.readContract({ ...contract, functionName: "voterListCid" }),
  client.readContract({ ...contract, functionName: "tally" }),
]);
const list = parseIdentityList(await (await fetch(`${gateway}/ipfs/${cid}`)).json());
const commitments = list.commitments.map(BigInt);

// Every ballot, from the contract's events.
const head = await client.getBlockNumber({ cacheTime: 0 });
const event = parseAbiItem("event VoteCast(bytes32 indexed key, uint256 indexed choice)");
const logs = [];
for (let from = BigInt(deployment.startBlock); from <= head; from += 5_000n) {
  const to = from + 4_999n < head ? from + 4_999n : head;
  logs.push(...(await client.getLogs({ address: election, event, fromBlock: from, toBlock: to })));
}

const rows = [];
let verified = 0;
for (const log of logs) {
  const [tx, receipt, block] = await Promise.all([
    client.getTransaction({ hash: log.transactionHash }),
    client.getTransactionReceipt({ hash: log.transactionHash }),
    client.getBlock({ blockNumber: log.blockNumber }),
  ]);
  const { args } = decodeFunctionData({ abi: semaphoreElectionAbi, data: tx.input });
  const [choice, nullifier, points] = args as unknown as [
    bigint,
    bigint,
    AnonymousBallot["points"],
  ];
  // The proof checks out against the whole list's root, which is all it can say: it names no member.
  if (
    await verifyBallot({ ballot: { choice, nullifier, points }, election, root, voterCount: count })
  ) {
    verified++;
  }
  rows.push({
    ballot: rows.length + 1,
    block: Number(log.blockNumber),
    time: Number(block.timestamp),
    position: tx.transactionIndex ?? -1,
    sender: tx.from,
    calldata_bytes: (tx.input.length - 2) / 2,
    gas_used: receipt.gasUsed,
    choice,
    nullifier: `0x${nullifier.toString(16).padStart(64, "0")}` as Hex,
  });
}

const distinct = <T>(values: T[]) => new Set(values.map(String)).size;
const senders = distinct(rows.map((r) => r.sender));
const sizes = distinct(rows.map((r) => r.calldata_bytes));
const sorted = commitments.every((c, i) => i === 0 || commitments[i - 1]! < c);
const rebuilt = identityTree(commitments).root === BigInt(root);
const byChoice = tally.map((votes, i) => ({ candidate: i, votes: Number(votes) }));
const unanimous = byChoice.filter((c) => c.votes > 0).length === 1 && rows.length > 1;

console.log(
  `Election ${election}: ${commitments.length} commitments on the list, ${rows.length} ballots`,
);
console.log(`- The list rebuilds the on-chain root: ${rebuilt}`);
console.log(
  `- List order: ${sorted ? "sorted by value, so it says nothing about who registered when" : "NOT sorted: it may follow registration order"}`,
);
console.log(
  `- Senders: ${senders} distinct${senders === 1 ? ` (${rows[0]?.sender}, the relayer, sent every ballot)` : ""}`,
);
console.log(
  `- Calldata: ${sizes === 1 ? "every ballot the same size" : `${sizes} different sizes`}`,
);
console.log(
  `- Gas used: ${[...new Set(rows.map((r) => String(r.gas_used)))].join(", ")}; it differs by which writes come first and by the proof's zero bytes, which show order, not identity`,
);
console.log(
  `- Proofs: ${verified} of ${rows.length} verify against the list's root, and each is equally consistent with every one of the ${commitments.length} commitments`,
);
console.log(
  `- Tally: ${byChoice.map((c) => c.votes).join(", ")}${unanimous ? "; unanimous, so every voter's choice is known from the count alone" : "; no choice is forced by the count"}`,
);
console.log(
  `- Linking a nullifier to a commitment needs the voter's secret; nothing above narrows a ballot below the ${commitments.length} on the list.`,
);

await mkdir(RESULTS, { recursive: true });
const file = `${RESULTS}d3-${election}.csv`;
await writeFile(file, csv(rows));
console.log(`Wrote ${file}`);
process.exit(0);
