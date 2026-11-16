import {
  forwardRequestTypedData,
  Identity,
  identityTree,
  proveBallot,
  relayAcceptedSchema,
  relayReceiptTypedData,
  relayStatusSchema,
  rootToBytes32,
  semaphoreElectionAbi,
  voteForwarderAbi,
  type AnonymousBallot,
} from "@dvote/shared";
import type { FastifyInstance } from "fastify";
import { encodeFunctionData, recoverTypedDataAddress, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ensureArtifacts } from "../../../packages/shared/scripts/semaphore-artifacts.mjs";
import { buildRelayer } from "../src/relayer/main";
import { chain, contracts, createElection, node, REGISTRAR, warpTo } from "./helpers";

const ARTIFACTS = new URL("../node_modules/.cache/semaphore-artifacts/", import.meta.url).pathname;
const RELAYER = process.env.RELAYER_ADDRESS as Address;

let relayer: FastifyInstance;

beforeAll(async () => {
  await ensureArtifacts(ARTIFACTS, [2]);
  relayer = await buildRelayer({ logger: false });
}, 120_000);

afterAll(async () => {
  await relayer.close();
});

/** A tier 3 election in its voting phase, with three registered identities. */
async function votingElection(title = "Hostel council") {
  const test = await createElection(title, { tier: 3 });
  const voters = [new Identity(), new Identity(), new Identity()];
  const tree = identityTree(
    voters.map((voter) => voter.commitment).sort((a, b) => (a < b ? -1 : 1)),
  );
  const contract = { address: test.election, abi: semaphoreElectionAbi } as const;
  const send = async (request: Parameters<typeof node.writeContract>[0]) =>
    node.waitForTransactionReceipt({ hash: await node.writeContract(request) });

  await warpTo(test.schedule.registrationStart);
  await send({ ...contract, account: REGISTRAR, functionName: "openRegistration" });
  await warpTo(test.schedule.registrationEnd);
  await send({
    ...contract,
    account: REGISTRAR,
    functionName: "publishVoterList",
    args: [rootToBytes32(tree.root), 3n, "bafy-identity-list"],
  });
  await warpTo(test.schedule.votingStart);
  await send({ ...contract, account: REGISTRAR, functionName: "openVoting" });
  return { election: test.election, voters, tree, contract };
}

async function ballotFor(
  identity: Identity,
  tree: ReturnType<typeof identityTree>,
  election: Address,
  choice: bigint,
) {
  return proveBallot({
    identity,
    tree,
    election,
    choice,
    artifacts: (depth) => ({
      wasm: `${ARTIFACTS}semaphore-${depth}.wasm`,
      zkey: `${ARTIFACTS}semaphore-${depth}.zkey`,
    }),
  });
}

/** The booth's side: a forward request signed by a key made for this ballot alone. */
async function forwardRequest(
  election: Address,
  ballot: AnonymousBallot,
  { deadlineIn = 3600, gas = 500_000n }: { deadlineIn?: number; gas?: bigint } = {},
) {
  const throwaway = privateKeyToAccount(generatePrivateKey());
  const data = encodeFunctionData({
    abi: semaphoreElectionAbi,
    functionName: "castVote",
    args: [ballot.choice, ballot.nullifier, ballot.points],
  });
  const nonce = await node.readContract({
    address: contracts.voteForwarder,
    abi: voteForwarderAbi,
    functionName: "nonces",
    args: [throwaway.address],
  });
  const block = await node.getBlock({ blockTag: "pending" });
  const deadline = Number(block.timestamp) + deadlineIn;
  const signature = await throwaway.signTypedData(
    forwardRequestTypedData({
      chainId: chain.id,
      forwarder: contracts.voteForwarder,
      from: throwaway.address,
      to: election,
      gas,
      nonce,
      deadline,
      data,
    }),
  );
  return {
    request: {
      from: throwaway.address,
      to: election,
      value: "0",
      gas: gas.toString(),
      deadline,
      data,
      signature,
    },
  };
}

function submit(body: object) {
  return relayer.inject({ method: "POST", url: "/ballots", payload: body });
}

async function waitUntilMined(id: string) {
  for (let i = 0; i < 100; i++) {
    const status = relayStatusSchema.parse((await relayer.inject(`/ballots/${id}`)).json());
    if (status.status === "mined" || status.status === "failed") return status;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("The ballot was never mined");
}

describe("relayer", () => {
  it("names its account and the forwarder", async () => {
    const config = (await relayer.inject("/config")).json<{ relayer: string; forwarder: string }>();
    expect(config).toMatchObject({ relayer: RELAYER, forwarder: contracts.voteForwarder });
  });

  it("submits an anonymous ballot, pays for it, and signs a receipt", async () => {
    const { election, voters, tree, contract } = await votingElection();
    const ballot = await ballotFor(voters[0]!, tree, election, 1n);
    const response = await submit(await forwardRequest(election, ballot));
    expect(response.statusCode, response.body).toBe(200);
    const { id, receipt } = relayAcceptedSchema.parse(response.json());

    const signer = await recoverTypedDataAddress({
      ...relayReceiptTypedData(receipt),
      signature: receipt.signature,
    });
    expect(signer).toBe(RELAYER);
    expect(receipt.nullifier).toBe(ballot.nullifier.toString());

    const status = await waitUntilMined(id);
    expect(status.status, status.error).toBe("mined");
    expect(await node.readContract({ ...contract, functionName: "tally" })).toEqual([0n, 1n]);
  }, 60_000);

  it("refuses the same ballot twice, before paying for it", async () => {
    const { election, voters, tree } = await votingElection();
    const ballot = await ballotFor(voters[1]!, tree, election, 0n);
    expect((await submit(await forwardRequest(election, ballot))).statusCode).toBe(200);
    const again = await submit(await forwardRequest(election, ballot));
    expect(again.statusCode).toBe(409);
  }, 60_000);

  it("refuses a ballot whose choice was changed after proving", async () => {
    const { election, voters, tree } = await votingElection();
    const ballot = await ballotFor(voters[2]!, tree, election, 0n);
    const response = await submit(await forwardRequest(election, { ...ballot, choice: 1n }));
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/proof/);
  }, 60_000);

  it("only relays ballots for anonymous elections", async () => {
    const { election, voters, tree } = await votingElection();
    const ballot = await ballotFor(voters[0]!, tree, election, 0n);
    const wallets = await createElection("Wallet election");
    const body = await forwardRequest(election, ballot);
    const response = await submit({ request: { ...body.request, to: wallets.election } });
    expect(response.statusCode).toBe(400);
  }, 60_000);

  it("refuses, before promising anything, a proved ballot the election would reject", async () => {
    const { election, voters, tree } = await votingElection();
    // A valid proof, but for a third candidate the election does not have.
    const ballot = await ballotFor(voters[0]!, tree, election, 2n);
    const response = await submit(await forwardRequest(election, ballot));
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/InvalidChoice/);
  }, 60_000);

  it("refuses a request with too little gas to count the ballot", async () => {
    const { election, voters, tree } = await votingElection();
    const ballot = await ballotFor(voters[0]!, tree, election, 0n);
    const response = await submit(await forwardRequest(election, ballot, { gas: 50_000n }));
    expect(response.statusCode).toBe(400);
  }, 60_000);

  it("reports a ballot that someone else submitted first as already voted", async () => {
    const { election, voters, tree, contract } = await votingElection();
    const ballot = await ballotFor(voters[1]!, tree, election, 1n);
    await node.waitForTransactionReceipt({
      hash: await node.writeContract({
        ...contract,
        account: REGISTRAR,
        functionName: "castVote",
        args: [ballot.choice, ballot.nullifier, ballot.points],
      }),
    });
    const response = await submit(await forwardRequest(election, ballot));
    expect(response.statusCode).toBe(409);
  }, 60_000);

  it("refuses a request the forwarder would reject", async () => {
    const { election, voters, tree } = await votingElection();
    const ballot = await ballotFor(voters[0]!, tree, election, 0n);
    const body = await forwardRequest(election, ballot);
    const forged = { request: { ...body.request, signature: `0x${"11".repeat(65)}` } };
    expect((await submit(forged)).statusCode).toBe(400);
  }, 60_000);
});
