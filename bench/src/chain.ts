// A local Anvil node with the contracts deployed by `pnpm deploy:local`, and helpers to run an
// election on it quickly: Anvil's clock is moved straight to each phase.
import {
  deploymentFor,
  electionFactoryAbi,
  factoryFor,
  merkleElectionAbi,
  type Deployment,
} from "@dvote/shared";
import {
  createTestClient,
  http,
  parseEventLogs,
  publicActions,
  walletActions,
  type Abi,
  type Address,
  type Hash,
} from "viem";
import { anvil } from "viem/chains";

export const RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";

/** Anvil's default accounts, which the node unlocks. */
export const ACCOUNTS = {
  authority: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  first: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  second: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
} as const satisfies Record<string, Address>;

export const node = createTestClient({ chain: anvil, mode: "anvil", transport: http(RPC_URL) })
  .extend(publicActions)
  .extend(walletActions);

const found = deploymentFor(anvil.id);
if (!found) throw new Error("Run `pnpm deploy:local` against a fresh Anvil first");
export const deployment: Deployment = found;

export async function send(request: {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  account: Address;
}): Promise<{ hash: Hash; gasUsed: bigint }> {
  // Simulated first, so a call the contract would reject fails with the contract's reason.
  await node.simulateContract({ ...request, chain: anvil } as never);
  const hash = await node.writeContract({ ...request, chain: anvil } as never);
  const receipt = await node.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${request.functionName} reverted`);
  return { hash, gasUsed: receipt.gasUsed };
}

/** Moves Anvil's clock forward to `timestamp`; if it is already past it, just mines a block. */
export async function warpTo(timestamp: bigint) {
  const { timestamp: latest } = await node.getBlock();
  if (timestamp > latest) await node.setNextBlockTimestamp({ timestamp });
  await node.mine({ blocks: 1 });
}

/**
 * Creates an election with the authority as its registrar, and opens its registration. Its phases
 * are `step` seconds apart; Anvil's clock is moved to each, but it also runs on in real time, so
 * a run that does slow work between phases needs a longer step.
 */
export async function newElection(tier: 2 | 3, title: string, step = 10n) {
  const now = (await node.getBlock()).timestamp;
  const schedule = {
    registrationStart: now + step,
    registrationEnd: now + 2n * step,
    votingStart: now + 3n * step,
    votingEnd: now + 100_000n,
  };
  const candidates = [
    { name: "Asha", manifestoCid: "" },
    { name: "Ravi", manifestoCid: "" },
  ];
  const { hash } = await send({
    address: factoryFor(deployment, tier),
    abi: electionFactoryAbi,
    functionName: "createElection",
    args: [ACCOUNTS.authority, 0, title, "", schedule, candidates],
    account: ACCOUNTS.authority,
  });
  const receipt = await node.getTransactionReceipt({ hash });
  const [created] = parseEventLogs({
    abi: electionFactoryAbi,
    eventName: "ElectionCreated",
    logs: receipt.logs,
  });
  if (!created) throw new Error("No ElectionCreated event");
  const election = created.args.election;
  await warpTo(schedule.registrationStart);
  await send({
    address: election,
    abi: merkleElectionAbi,
    functionName: "openRegistration",
    account: ACCOUNTS.authority,
  });
  return { election, schedule };
}

/** Publishes a voter list and opens voting; returns the publication's gas. */
export async function publishAndOpen(
  election: Address,
  schedule: { registrationEnd: bigint; votingStart: bigint },
  root: `0x${string}`,
  count: number,
): Promise<bigint> {
  await warpTo(schedule.registrationEnd);
  const { gasUsed } = await send({
    address: election,
    abi: merkleElectionAbi,
    functionName: "publishVoterList",
    args: [root, BigInt(count), "bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"],
    account: ACCOUNTS.authority,
  });
  await warpTo(schedule.votingStart);
  await send({
    address: election,
    abi: merkleElectionAbi,
    functionName: "openVoting",
    account: ACCOUNTS.authority,
  });
  return gasUsed;
}
