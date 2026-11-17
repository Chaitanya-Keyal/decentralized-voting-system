// A1 under Glamsterdam, and the on-chain part of B1: runs a tier 2 and a tier 3 election on
// Sepolia in real time and records the gas of every step and how long each ballot took from
// submission to inclusion. Sepolia runs Glamsterdam, whose EIP-8037 prices state creation far
// above mainnet's current rules, and Foundry's local EVM does not model it, so these figures can
// only come from Sepolia itself.
//
// Keys are throwaway testnet keys, read from the environment:
//   AUTHORITY_PRIVATE_KEY  creates the elections and acts as their registrar
//   VOTER_PRIVATE_KEY      the tier 2 voter
//   SENDER_PRIVATE_KEY     submits tier 3 ballots directly, as any wallet may
//   RELAYER_PRIVATE_KEY    submits tier 3 ballots as the relayer does, and through the forwarder
//
//   RPC_URL=<sepolia> ... pnpm --filter @dvote/bench sepolia [ballots per path, default 3]
import { mkdir, writeFile } from "node:fs/promises";

import {
  buildIdentityList,
  buildVoterList,
  deploymentFor,
  electionFactoryAbi,
  forwardRequestTypedData,
  Identity,
  identityTree,
  merkleElectionAbi,
  proveBallot,
  rootToBytes32,
  semaphoreElectionAbi,
  voteForwarderAbi,
  voterProof,
  voterTree,
  type AnonymousBallot,
} from "@dvote/shared";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseEventLogs,
  type Abi,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

import { ensureArtifacts } from "../../packages/shared/scripts/semaphore-artifacts.mjs";
import { csv, fillAddresses, fillCommitments } from "./fill";

const ARTIFACTS = new URL("../.cache/semaphore-artifacts/", import.meta.url).pathname;
const RESULTS = new URL("../results/", import.meta.url).pathname;
const ROLL = 1024;
const PER_PATH = Number(process.argv[2] ?? 3);
const CID = "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";

function key(name: string): Hex {
  const value = process.env[name];
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`Set ${name}`);
  return value as Hex;
}

const transport = http(process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com");
const node = createPublicClient({ chain: sepolia, transport, pollingInterval: 1_000 });
const wallet = (name: string) =>
  createWalletClient({ account: privateKeyToAccount(key(name)), chain: sepolia, transport });
const authority = wallet("AUTHORITY_PRIVATE_KEY");
const voter = wallet("VOTER_PRIVATE_KEY");
const sender = wallet("SENDER_PRIVATE_KEY");
const relayer = wallet("RELAYER_PRIVATE_KEY");

const found = deploymentFor(sepolia.id);
if (!found) throw new Error("DVote is not deployed on Sepolia");
const deployment = found;

interface GasRow {
  tier: number;
  operation: string;
  roll_size: number;
  gas: bigint;
  gas_price_wei: bigint;
  block: bigint;
  tx: Hash;
}
interface LatencyRow {
  path: string;
  submitted_at: string;
  ms: number;
  block: bigint;
  tx: Hash;
}
const gasRows: GasRow[] = [];
const latencyRows: LatencyRow[] = [];

/** Sends a call, waits for it, and records its gas; returns the receipt and the latency. */
async function send(
  client: ReturnType<typeof wallet>,
  call: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] },
  record?: { tier: number; operation: string; roll?: number },
) {
  // A public RPC spreads requests over several nodes; one may not have the previous transaction's
  // block yet, so a simulation that fails is tried again, a block later, a few times.
  let request: unknown;
  for (let attempt = 1; ; attempt++) {
    try {
      ({ request } = await node.simulateContract({ ...call, account: client.account } as never));
      break;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 12_000));
    }
  }
  const started = Date.now();
  const hash = await client.writeContract(request as never);
  const receipt = await node.waitForTransactionReceipt({ hash, timeout: 300_000 });
  const ms = Date.now() - started;
  if (receipt.status !== "success") throw new Error(`${call.functionName} reverted: ${hash}`);
  if (record) {
    gasRows.push({
      tier: record.tier,
      operation: record.operation,
      roll_size: record.roll ?? ROLL,
      gas: receipt.gasUsed,
      gas_price_wei: receipt.effectiveGasPrice,
      block: receipt.blockNumber,
      tx: hash,
    });
    console.log(`tier ${record.tier} ${record.operation}: ${receipt.gasUsed} gas (${hash})`);
  }
  return { receipt, ms, started };
}

/**
 * Waits until the chain has passed `timestamp` by two blocks. A public RPC spreads requests over
 * several nodes, and one may be a block behind the one that answered the time.
 */
async function waitUntil(timestamp: bigint) {
  for (;;) {
    const { timestamp: now } = await node.getBlock();
    if (now >= timestamp + 24n) return;
    await new Promise((resolve) => setTimeout(resolve, 4_000));
  }
}

async function create(tier: 2 | 3, schedule: Record<string, bigint>) {
  const { receipt } = await send(
    authority,
    {
      address: tier === 3 ? deployment.semaphoreFactory : deployment.electionFactory,
      abi: electionFactoryAbi,
      functionName: "createElection",
      args: [
        authority.account.address,
        0,
        `DVote Sepolia measurement, tier ${tier}`,
        CID,
        schedule,
        [
          { name: "Asha", manifestoCid: CID },
          { name: "Ravi", manifestoCid: CID },
          { name: "Meera", manifestoCid: CID },
        ],
      ],
    },
    { tier, operation: "create_election" },
  );
  const [created] = parseEventLogs({
    abi: electionFactoryAbi,
    eventName: "ElectionCreated",
    logs: receipt.logs,
  });
  if (!created) throw new Error("No ElectionCreated event");
  return created.args.election;
}

/** Through the ERC-2771 forwarder, signed by a fresh key: the path the relayer no longer takes. */
async function forward(election: Address, ballot: AnonymousBallot) {
  const throwaway = privateKeyToAccount(generatePrivateKey());
  const data = encodeFunctionData({
    abi: semaphoreElectionAbi,
    functionName: "castVote",
    args: [ballot.choice, ballot.nullifier, ballot.points],
  });
  const { timestamp } = await node.getBlock();
  const request = {
    from: throwaway.address,
    to: election,
    value: 0n,
    gas: 500_000n,
    deadline: Number(timestamp) + 3600,
    data,
  };
  const signature = await throwaway.signTypedData(
    forwardRequestTypedData({
      chainId: sepolia.id,
      forwarder: deployment.voteForwarder,
      nonce: 0n,
      ...request,
    }),
  );
  return send(
    relayer,
    {
      address: deployment.voteForwarder,
      abi: voteForwarderAbi,
      functionName: "execute",
      args: [{ ...request, signature }],
    },
    { tier: 3, operation: "cast_vote_forwarded" },
  );
}

/** Writes what was measured so far; a run that fails late keeps its earlier figures. */
async function save() {
  await mkdir(RESULTS, { recursive: true });
  await writeFile(`${RESULTS}sepolia-gas-${STAMP}.csv`, csv(gasRows as never));
  await writeFile(`${RESULTS}sepolia-latency-${STAMP}.csv`, csv(latencyRows as never));
  console.log(`Wrote ${gasRows.length} gas rows and ${latencyRows.length} latency rows`);
}
const STAMP = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

try {
  const identities = Array.from(
    { length: 3 * PER_PATH },
    (_, i) => new Identity(`sepolia ${Date.now()} ${i}`),
  );
  await ensureArtifacts(ARTIFACTS, [10, 11]);

  const { timestamp: now } = await node.getBlock();
  const schedule = {
    registrationStart: now + 120n,
    registrationEnd: now + 240n,
    // Both lists are built and published, one after the other, before voting is due.
    votingStart: now + 420n,
    votingEnd: now + 1020n,
  };
  const tier2 = await create(2, schedule);
  const tier3 = await create(3, schedule);
  console.log(`Elections: tier 2 ${tier2}, tier 3 ${tier3}`);

  await waitUntil(schedule.registrationStart);
  for (const [tier, election] of [
    [2, tier2],
    [3, tier3],
  ] as const) {
    await send(
      authority,
      { address: election, abi: merkleElectionAbi, functionName: "openRegistration" },
      { tier, operation: "open_registration" },
    );
  }

  await waitUntil(schedule.registrationEnd);
  const voterList = buildVoterList({
    chainId: sepolia.id,
    election: tier2,
    voters: fillAddresses(ROLL, [voter.account.address]),
  });
  const wallets = voterTree(voterList.voters);
  const identityList = buildIdentityList({
    chainId: sepolia.id,
    election: tier3,
    commitments: fillCommitments(
      ROLL,
      identities.map((identity) => identity.commitment),
    ),
  });
  const tree = identityTree(identityList.commitments);
  await send(
    authority,
    {
      address: tier2,
      abi: merkleElectionAbi,
      functionName: "publishVoterList",
      args: [wallets.root as Hex, BigInt(ROLL), CID],
    },
    { tier: 2, operation: "publish_roll" },
  );
  await send(
    authority,
    {
      address: tier3,
      abi: merkleElectionAbi,
      functionName: "publishVoterList",
      args: [rootToBytes32(tree.root), BigInt(ROLL), CID],
    },
    { tier: 3, operation: "publish_roll" },
  );

  // Proved while waiting for voting to open, so the latencies below are the chain's alone.
  const ballots: AnonymousBallot[] = [];
  for (const [i, identity] of identities.entries()) {
    ballots.push(
      await proveBallot({
        identity,
        tree,
        election: tier3,
        choice: BigInt(i % 3),
        artifacts: (depth) => ({
          wasm: `${ARTIFACTS}semaphore-${depth}.wasm`,
          zkey: `${ARTIFACTS}semaphore-${depth}.zkey`,
        }),
      }),
    );
  }

  await waitUntil(schedule.votingStart);
  for (const [tier, election] of [
    [2, tier2],
    [3, tier3],
  ] as const) {
    await send(
      authority,
      { address: election, abi: merkleElectionAbi, functionName: "openVoting" },
      { tier, operation: "open_voting" },
    );
  }

  const latency = (path: string, result: Awaited<ReturnType<typeof send>>) =>
    latencyRows.push({
      path,
      submitted_at: new Date(result.started).toISOString(),
      ms: result.ms,
      block: result.receipt.blockNumber,
      tx: result.receipt.transactionHash,
    });

  latency(
    "tier2_wallet",
    await send(
      voter,
      {
        address: tier2,
        abi: merkleElectionAbi,
        functionName: "castVote",
        args: [0n, voterProof(wallets, voter.account.address)!],
      },
      { tier: 2, operation: "cast_vote" },
    ),
  );
  // Three ways in: a wallet submitting the ballot itself, the relayer submitting it (what the
  // relayer service does), and the ERC-2771 forwarder, kept for comparison.
  for (const [i, ballot] of ballots.entries()) {
    const call = {
      address: tier3,
      abi: semaphoreElectionAbi,
      functionName: "castVote",
      args: [ballot.choice, ballot.nullifier, ballot.points],
    } as const;
    if (i % 3 === 0) {
      latency("tier3_direct", await send(sender, call, { tier: 3, operation: "cast_vote" }));
    } else if (i % 3 === 1) {
      latency(
        "tier3_relayed",
        await send(relayer, call, { tier: 3, operation: "cast_vote_relayed" }),
      );
    } else {
      latency("tier3_forwarded", await forward(tier3, ballot));
    }
  }

  await waitUntil(schedule.votingEnd);
  for (const [tier, election] of [
    [2, tier2],
    [3, tier3],
  ] as const) {
    await send(
      authority,
      { address: election, abi: merkleElectionAbi, functionName: "closeVoting" },
      { tier, operation: "close_voting" },
    );
    await send(
      authority,
      { address: election, abi: merkleElectionAbi, functionName: "finalize" },
      { tier, operation: "finalize" },
    );
  }
} finally {
  await save();
}

// snarkjs leaves worker threads running, which would keep the process alive.
process.exit(0);
