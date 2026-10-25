import { deploymentFor, electionFactoryAbi, registrationTypedData } from "@dvote/shared";
import {
  createTestClient,
  http,
  parseEventLogs,
  publicActions,
  walletActions,
  type Address,
} from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { anvil } from "viem/chains";

import { AUTHORITY } from "./global-setup";

export const chain = anvil;
export const REGISTRAR = process.env.REGISTRAR_ADDRESS as Address;

const deployment = deploymentFor(anvil.id);
if (!deployment) throw new Error("contracts/deployments/31337.json is missing");
export const factory = deployment.electionFactory;

/** Talks to the test node, and can move its clock. */
export const node = createTestClient({
  chain,
  mode: "anvil",
  pollingInterval: 100,
  transport: http(process.env.RPC_URL),
})
  .extend(publicActions)
  .extend(walletActions);

/** The time the next block will have, as the API's `chainNow` sees it. */
export async function chainTime(): Promise<bigint> {
  return (await node.getBlock({ blockTag: "pending" })).timestamp;
}

/** Mines a block at `timestamp`, so the chain and the API both see that time. */
export async function warpTo(timestamp: bigint): Promise<void> {
  await node.setNextBlockTimestamp({ timestamp });
  await node.mine({ blocks: 1 });
}

export interface TestElection {
  election: Address;
  schedule: {
    registrationStart: bigint;
    registrationEnd: bigint;
    votingStart: bigint;
    votingEnd: bigint;
  };
}

/**
 * Creates an election whose registration opens in ten seconds and lasts a thousand. By default the
 * authority is Anvil's first account and the registrar is the API's.
 */
export async function createElection(
  title = "Student Senate",
  {
    authority = AUTHORITY,
    registrar = REGISTRAR,
  }: { authority?: Address; registrar?: Address } = {},
): Promise<TestElection> {
  const now = await chainTime();
  const schedule = {
    registrationStart: now + 10n,
    registrationEnd: now + 1_000n,
    votingStart: now + 2_000n,
    votingEnd: now + 3_000n,
  };
  const hash = await node.writeContract({
    account: authority,
    address: factory,
    abi: electionFactoryAbi,
    functionName: "createElection",
    args: [
      registrar,
      title,
      "",
      schedule,
      [
        { name: "Alice", manifestoCid: "" },
        { name: "Bob", manifestoCid: "" },
      ],
    ],
  });
  const receipt = await node.waitForTransactionReceipt({ hash });
  const [created] = parseEventLogs({
    abi: electionFactoryAbi,
    eventName: "ElectionCreated",
    logs: receipt.logs,
  });
  if (!created) throw new Error("ElectionCreated was not emitted");
  return { election: created.args.election, schedule };
}

export function newVoter(): PrivateKeyAccount {
  return privateKeyToAccount(generatePrivateKey());
}

let emails = 0;

/** A fresh institute email address. */
export function newEmail(): string {
  emails += 1;
  return `f2023${String(emails).padStart(4, "0")}@hyderabad.bits-pilani.ac.in`;
}

export function signRegistration(
  voter: PrivateKeyAccount,
  election: Address,
  email: string,
): Promise<`0x${string}`> {
  return voter.signTypedData(
    registrationTypedData({ chainId: chain.id, election, voter: voter.address, email }),
  );
}
