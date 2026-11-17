import {
  AUTHORITY_ROLE,
  deploymentFor,
  electionFactories,
  electionFactoryAbi,
  merkleElectionAbi,
  REGISTRAR_ROLE,
} from "@dvote/shared";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil, sepolia } from "viem/chains";

import { env } from "./env";
import { HttpError } from "./http";

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

export const chain = required(
  [anvil, sepolia].find((candidate) => candidate.id === env.CHAIN_ID),
  `CHAIN_ID ${env.CHAIN_ID} is not supported`,
);

export const deployment = required(
  deploymentFor(chain.id),
  `Nothing is deployed on chain ${chain.id}; see contracts/deployments`,
);

// Anvil mines each transaction at once, so waiting for receipts can poll often.
const pollingInterval = chain.id === anvil.id ? 100 : 4_000;

export const publicClient = createPublicClient({
  chain,
  pollingInterval,
  transport: http(env.RPC_URL),
});

/** Signs receipts and publishes voter lists. On Anvil it can be an account the node unlocked. */
export const registrar = createWalletClient({
  account: env.REGISTRAR_PRIVATE_KEY
    ? privateKeyToAccount(env.REGISTRAR_PRIVATE_KEY)
    : required(env.REGISTRAR_ADDRESS, "Set REGISTRAR_PRIVATE_KEY or REGISTRAR_ADDRESS"),
  chain,
  pollingInterval,
  transport: http(env.RPC_URL),
});

export interface ElectionState {
  /** 2 for wallet ballots, 3 for anonymous ballots. */
  tier: number;
  phase: number;
  title: string;
  registrationStart: bigint;
  registrationEnd: bigint;
  votingStart: bigint;
  isVoterListPublished: boolean;
}

/** Elections this registrar is known to serve. The roles are granted at creation and kept. */
const served = new Set<Address>();

/**
 * Reads what the registrar needs to know about an election, and checks that it serves it: the
 * factory created it, this registrar holds its registrar role, and, if AUTHORITIES is set, its
 * authority is one of them. Anyone can create an election naming this registrar, so without
 * these checks it would register voters under anyone's title and pay gas to publish anyone's list.
 * The checks are made once per election, which keeps each request to a few reads.
 */
export async function readElection(election: Address): Promise<ElectionState> {
  const contract = { address: election, abi: merkleElectionAbi } as const;
  if (!served.has(election)) {
    if (!(await isElection(election))) throw new HttpError(404, "There is no such election.");
    const hasRole = (role: Hex, account: Address) =>
      publicClient.readContract({ ...contract, functionName: "hasRole", args: [role, account] });
    const [isRegistrar, approved] = await Promise.all([
      hasRole(REGISTRAR_ROLE, registrar.account.address),
      env.AUTHORITIES.length === 0
        ? true
        : Promise.all(env.AUTHORITIES.map((authority) => hasRole(AUTHORITY_ROLE, authority))).then(
            (held) => held.includes(true),
          ),
    ]);
    if (!isRegistrar || !approved) {
      throw new HttpError(403, "This registrar does not serve that election.");
    }
    served.add(election);
  }

  const [
    tier,
    phase,
    [registrationStart, registrationEnd, votingStart],
    title,
    isVoterListPublished,
  ] = await Promise.all([
    publicClient.readContract({ ...contract, functionName: "tier" }),
    publicClient.readContract({ ...contract, functionName: "phase" }),
    publicClient.readContract({ ...contract, functionName: "schedule" }),
    publicClient.readContract({ ...contract, functionName: "title" }),
    publicClient.readContract({ ...contract, functionName: "isVoterListPublished" }),
  ]);
  return {
    tier,
    phase,
    title,
    registrationStart,
    registrationEnd,
    votingStart,
    isVoterListPublished,
  };
}

/** Whether one of this deployment's factories created `election`. */
async function isElection(election: Address): Promise<boolean> {
  const created = await Promise.all(
    electionFactories(deployment).map((factory) =>
      publicClient.readContract({
        address: factory,
        abi: electionFactoryAbi,
        functionName: "isElection",
        args: [election],
      }),
    ),
  );
  return created.includes(true);
}

/**
 * The current time in Unix seconds, as the next block will see it. On Anvil that is the pending
 * block's time: its clock can be moved ahead of the wall clock, and it keeps running while no
 * blocks are mined, so the latest block can be well behind it.
 */
export async function chainNow(): Promise<bigint> {
  if (chain.id === anvil.id) {
    return (await publicClient.getBlock({ blockTag: "pending" })).timestamp;
  }
  const { timestamp } = await publicClient.getBlock();
  const wall = BigInt(Math.floor(Date.now() / 1000));
  return timestamp > wall ? timestamp : wall;
}

/**
 * Where to simulate transactions. A simulation against Anvil's latest block runs at that block's
 * time, so after an idle spell a step that is due would appear too early; the pending block has
 * the current time.
 */
export const simulateAt = chain.id === anvil.id ? ({ blockTag: "pending" } as const) : {};
