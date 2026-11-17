import {
  ballotListSchema,
  electionDetailSchema,
  electionListSchema,
  indexerStatusSchema,
  merkleElectionAbi,
  Phase,
  voterProof,
  voterTree,
} from "@dvote/shared";
import type { FastifyInstance } from "fastify";
import { pad, type Address, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app";
import { db } from "../src/db";
import { publicClient } from "../src/chain";
import { indexNextBatch } from "../src/indexer/sync";
import { chain, createElection, newVoter, node, REGISTRAR, warpTo } from "./helpers";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ logger: false });
});

afterAll(async () => {
  await app.close();
});

async function indexEverything() {
  while ((await indexNextBatch()).kind !== "caught-up") {
    // Keep going until the indexer has caught up with the chain.
  }
}

/** Sends a transaction from `account` to the election and waits for it. */
async function call(
  election: Address,
  account: Address | PrivateKeyAccount,
  request:
    | { functionName: "openRegistration" | "openVoting" | "closeVoting" | "finalize" }
    | { functionName: "publishVoterList"; args: [Hex, bigint, string] }
    | { functionName: "castVote"; args: [bigint, Hex[]] },
) {
  const hash = await node.writeContract({
    address: election,
    abi: merkleElectionAbi,
    account,
    ...request,
  });
  const receipt = await node.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
}

describe("indexer", () => {
  it("copies an election, its ballots and its result into the database", async () => {
    const { election, schedule } = await createElection("Hostel council");
    const voters = [newVoter(), newVoter(), newVoter()];
    const tree = voterTree(voters.map((voter) => voter.address));

    await warpTo(schedule.registrationStart);
    await call(election, REGISTRAR, { functionName: "openRegistration" });
    await warpTo(schedule.registrationEnd);
    await call(election, REGISTRAR, {
      functionName: "publishVoterList",
      args: [tree.root as Hex, 3n, "bafy-voter-list"],
    });
    await warpTo(schedule.votingStart);
    await call(election, REGISTRAR, { functionName: "openVoting" });
    const choices = [1n, 1n, 0n];
    for (const [i, voter] of voters.entries()) {
      await node.setBalance({ address: voter.address, value: 10n ** 18n });
      await call(election, voter, {
        functionName: "castVote",
        args: [choices[i] ?? 0n, voterProof(tree, voter.address) ?? []],
      });
    }
    await warpTo(schedule.votingEnd);
    await call(election, REGISTRAR, { functionName: "closeVoting" });
    await call(election, REGISTRAR, { functionName: "finalize" });

    await indexEverything();

    const list = electionListSchema.parse((await app.inject("/elections")).json());
    expect(list.elections.map((summary) => summary.address)).toContain(election);

    const detail = electionDetailSchema.parse((await app.inject(`/elections/${election}`)).json());
    expect(detail).toMatchObject({
      title: "Hostel council",
      phase: Phase.Finalized,
      registrar: REGISTRAR,
      voterCount: 3,
      voterListCid: "bafy-voter-list",
      voterRoot: tree.root,
      ballotsCast: 3,
      winners: [1],
      registrationStart: Number(schedule.registrationStart),
      votingEnd: Number(schedule.votingEnd),
    });
    expect(detail.candidates).toEqual([
      { name: "Alice", manifestoCid: "", votes: 1 },
      { name: "Bob", manifestoCid: "", votes: 2 },
    ]);

    const { ballots } = ballotListSchema.parse(
      (await app.inject(`/elections/${election}/ballots`)).json(),
    );
    expect(ballots.map((ballot) => ballot.key)).toEqual(
      voters.map((voter) => pad(voter.address.toLowerCase() as Hex)),
    );
    expect(ballots.map((ballot) => ballot.candidates)).toEqual([[1], [1], [0]]);
    expect(ballots.map((ballot) => ballot.choice)).toEqual(["1", "1", "0"]);
  });

  it("follows an election in batches after the one that created it", async () => {
    const { election, schedule } = await createElection("Mess committee");
    await indexEverything();
    await warpTo(schedule.registrationStart);
    await call(election, REGISTRAR, { functionName: "openRegistration" });
    await indexEverything();

    const detail = electionDetailSchema.parse((await app.inject(`/elections/${election}`)).json());
    expect(detail.phase).toBe(Phase.Registration);
  });

  it("asks for the events of at most ten elections at a time, as public nodes require", async () => {
    // Public RPC providers refuse eth_getLogs for more than ten addresses; Anvil does not, so the
    // requests themselves are checked.
    for (let i = 0; i < 11; i++) await createElection(`Hostel block ${i}`);
    const spy = vi.spyOn(publicClient, "getContractEvents");
    try {
      const last = await createElection("Hostel block 11");
      await indexEverything();
      await warpTo(last.schedule.registrationStart);
      await call(last.election, REGISTRAR, { functionName: "openRegistration" });
      await indexEverything();
      const sizes = spy.mock.calls.map(([request]) =>
        Array.isArray(request.address) ? request.address.length : 1,
      );
      expect(Math.max(...sizes)).toBeLessThanOrEqual(10);
      expect((await db.election.count()) > 10).toBe(true);
      const detail = electionDetailSchema.parse(
        (await app.inject(`/elections/${last.election}`)).json(),
      );
      expect(detail.phase).toBe(Phase.Registration);
    } finally {
      spy.mockRestore();
    }
  });

  it("reports that it has caught up with the chain", async () => {
    await indexEverything();
    const status = indexerStatusSchema.parse((await app.inject("/indexer")).json());
    expect(status.block).toBe(status.head);
  });

  it("rebuilds the index when a block it read is replaced", async () => {
    await indexEverything();
    const before = await db.election.count();
    await db.indexerCursor.update({
      where: { chainId: chain.id },
      data: { blockHash: pad("0x01", { size: 32 }) },
    });

    expect((await indexNextBatch()).kind).toBe("restarted");
    expect(await db.election.count()).toBe(0);
    await indexEverything();
    expect(await db.election.count()).toBe(before);
  });

  it("waits for a node that is behind instead of rebuilding the index", async () => {
    await indexEverything();
    const cursor = await db.indexerCursor.findUniqueOrThrow({ where: { chainId: chain.id } });
    const before = await db.election.count();
    // As if the last batch had been read from a node further along than the one now answering.
    await db.indexerCursor.update({
      where: { chainId: chain.id },
      data: { block: cursor.block + 10n },
    });
    try {
      await expect(indexNextBatch()).rejects.toThrow(/catch up/);
      expect(await db.election.count()).toBe(before);
    } finally {
      await db.indexerCursor.update({
        where: { chainId: chain.id },
        data: { block: cursor.block },
      });
    }
  });

  it("refuses a database that already describes another chain", async () => {
    await db.indexerCursor.create({ data: { chainId: 11155111, block: 1n } });
    try {
      await expect(indexNextBatch()).rejects.toThrow(/chain 11155111/);
    } finally {
      await db.indexerCursor.delete({ where: { chainId: 11155111 } });
    }
  });

  it("forgets everything about a previous Anvil chain, the registrar's records included", async () => {
    await indexEverything();
    await db.registration.create({
      data: {
        election: newVoter().address,
        email: "old-chain@hyderabad.bits-pilani.ac.in",
        voter: newVoter().address,
        voterSignature: "0x",
        receiptSignature: "0x",
        issuedAt: new Date(),
      },
    });
    await db.indexerCursor.update({
      where: { chainId: chain.id },
      data: { genesisHash: pad("0x02", { size: 32 }) },
    });

    expect((await indexNextBatch()).kind).toBe("restarted");
    expect(await db.registration.count()).toBe(0);
    await indexEverything();
    expect(await db.election.count()).toBeGreaterThan(0);
  });

  it("stores what Postgres cannot hold in a form it can, rather than stopping", async () => {
    // Anvil's fourth default account, unlocked, plays a registrar the API does not serve.
    const registrar = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
    const { election, schedule } = await createElection("Null\u0000title", { registrar });
    await warpTo(schedule.registrationStart);
    await call(election, registrar, { functionName: "openRegistration" });
    await warpTo(schedule.registrationEnd);
    await call(election, registrar, {
      functionName: "publishVoterList",
      args: [pad("0x01", { size: 32 }), 2n ** 64n, "cid\u0000"],
    });

    await indexEverything();
    const detail = electionDetailSchema.parse((await app.inject(`/elections/${election}`)).json());
    expect(detail.title).toBe("Nulltitle");
    expect(detail.voterCount).toBe(2 ** 31 - 1);
    expect(detail.voterListCid).toBe("cid");
  });

  it("answers 404 for an election it has not seen", async () => {
    const response = await app.inject(`/elections/${newVoter().address}`);
    expect(response.statusCode).toBe(404);
  });
});
