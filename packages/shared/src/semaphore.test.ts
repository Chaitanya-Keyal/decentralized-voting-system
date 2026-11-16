import { readFileSync, writeFileSync } from "node:fs";

import { Identity } from "@semaphore-protocol/identity";
import { getAddress, type Address } from "viem";
import { beforeAll, describe, expect, it } from "vitest";

import { ensureArtifacts } from "../scripts/semaphore-artifacts.mjs";
import {
  buildIdentityList,
  identityTree,
  normalizeCommitments,
  proveBallot,
  rootToBytes32,
  verifyBallot,
  verifyIdentityList,
  voterTreeDepth,
  type ArtifactSource,
  type AnonymousBallot,
} from "./semaphore";
import { semaphoreArtifact } from "./semaphore-artifacts";

const ARTIFACTS = new URL("../node_modules/.cache/semaphore-artifacts/", import.meta.url).pathname;
const FIXTURE = new URL("../../../contracts/test/fixtures/semaphore-ballots.json", import.meta.url)
  .pathname;

/** The election the fixture's ballots are bound to; the contract tests deploy one there. */
const ELECTION = getAddress("0x1000000000000000000000000000000000000001");
const OTHER_ELECTION = getAddress("0x2000000000000000000000000000000000000002");

const identity = (i: number) => new Identity(`dvote fixture voter ${i}`);

const artifacts: ArtifactSource = (depth) => ({
  wasm: `${ARTIFACTS}semaphore-${depth}.wasm`,
  zkey: `${ARTIFACTS}semaphore-${depth}.zkey`,
});

interface FixtureBallot {
  voter: number;
  choice: string;
  nullifier: string;
  points: string[];
}

const hex = (value: bigint) => `0x${value.toString(16)}`;
const toFixture = (voter: number, ballot: AnonymousBallot): FixtureBallot => ({
  voter,
  choice: hex(ballot.choice),
  nullifier: hex(ballot.nullifier),
  points: ballot.points.map(hex),
});
const fromFixture = (ballot: FixtureBallot): AnonymousBallot => ({
  choice: BigInt(ballot.choice),
  nullifier: BigInt(ballot.nullifier),
  points: ballot.points.map((point) => BigInt(point)) as unknown as AnonymousBallot["points"],
});

describe("voterTreeDepth", () => {
  it("matches the depth of a LeanIMT, and is at least 1", () => {
    expect([1, 2, 3, 4, 5, 1024, 1025].map(voterTreeDepth)).toEqual([1, 1, 2, 2, 3, 10, 11]);
    for (const n of [1, 2, 3, 7, 8, 9, 33]) {
      const tree = identityTree(Array.from({ length: n }, (_, i) => BigInt(i + 1)));
      expect(voterTreeDepth(n)).toBe(Math.max(1, tree.depth));
    }
  });
});

describe("identity lists", () => {
  const commitments = [3n, 1n, 2n, 3n].map(String);
  const list = buildIdentityList({ chainId: 31337, election: ELECTION, commitments });
  const expected = {
    chainId: 31337,
    election: ELECTION,
    root: rootToBytes32(identityTree(list.commitments).root),
    count: 3n,
  };

  it("sorts and de-duplicates commitments", () => {
    expect(normalizeCommitments(commitments)).toEqual(["1", "2", "3"]);
    expect(list.commitments).toEqual(["1", "2", "3"]);
  });

  it("accepts the list the root was built from", () => {
    expect(BigInt(verifyIdentityList(list, expected).root)).toBe(BigInt(expected.root));
  });

  it("rejects a repeated voter, a reordered list, a wrong count and a swapped voter", () => {
    expect(() => verifyIdentityList({ ...list, commitments: ["1", "2", "2"] }, expected)).toThrow(
      /more than once/,
    );
    expect(() => verifyIdentityList({ ...list, commitments: ["2", "1", "3"] }, expected)).toThrow(
      /order/,
    );
    expect(() => verifyIdentityList(list, { ...expected, count: 4n })).toThrow(/recorded 4/);
    expect(() => verifyIdentityList({ ...list, commitments: ["1", "2", "4"] }, expected)).toThrow(
      /root/,
    );
  });
});

describe("ballots", () => {
  beforeAll(async () => {
    await ensureArtifacts(ARTIFACTS, [2]);
  }, 120_000);

  it("proves a ballot that verifies, and only for its own choice and election", async () => {
    const voters = [identity(1), identity(2), identity(3)];
    const tree = identityTree(voters.map((voter) => voter.commitment));
    const ballot = await proveBallot({
      identity: voters[1]!,
      tree,
      election: ELECTION,
      choice: 2n,
      artifacts,
    });
    const check = (b: AnonymousBallot, election: Address) =>
      verifyBallot({ ballot: b, election, root: tree.root, voterCount: 3 });

    expect(await check(ballot, ELECTION)).toBe(true);
    expect(await check({ ...ballot, choice: 1n }, ELECTION)).toBe(false);
    expect(await check(ballot, OTHER_ELECTION)).toBe(false);
  }, 120_000);

  it("pins the proving files it uses", () => {
    expect(semaphoreArtifact(10, "zkey")?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(semaphoreArtifact(21, "zkey")).toBeUndefined();
  });
});

describe("the contract tests' fixture", () => {
  // Proofs are randomized, so the fixture is rewritten only on request:
  // WRITE_SEMAPHORE_FIXTURE=1 pnpm --filter @dvote/shared test
  it.runIf(process.env.WRITE_SEMAPHORE_FIXTURE)(
    "is written from 1,024 voters and a one-voter election",
    async () => {
      await ensureArtifacts(ARTIFACTS, [1, 10]);
      const voters = Array.from({ length: 1024 }, (_, i) => identity(i));
      const list = buildIdentityList({
        chainId: 31337,
        election: ELECTION,
        commitments: voters.map((voter) => voter.commitment),
      });
      const tree = identityTree(list.commitments);
      const prove = async (voter: number, choice: bigint, election = ELECTION) =>
        toFixture(
          voter,
          await proveBallot({ identity: voters[voter]!, tree, election, choice, artifacts }),
        );

      const single = identity(5000);
      const singleTree = identityTree([single.commitment]);
      const fixture = {
        election: ELECTION,
        otherElection: OTHER_ELECTION,
        voterCount: list.commitments.length,
        depth: voterTreeDepth(list.commitments.length),
        root: rootToBytes32(tree.root),
        // Plurality ballots for candidates 1, 1, 2 and 1.
        ballots: [await prove(0, 1n), await prove(1, 1n), await prove(2, 2n), await prove(5, 1n)],
        // An approval ballot for candidates 0 and 2.
        approval: await prove(3, 0b101n),
        // A valid ballot, but for another election.
        foreign: await prove(4, 0n, OTHER_ELECTION),
        single: {
          root: rootToBytes32(singleTree.root),
          ballot: toFixture(
            0,
            await proveBallot({
              identity: single,
              tree: singleTree,
              election: ELECTION,
              choice: 0n,
              artifacts,
            }),
          ),
        },
      };
      writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
    },
    600_000,
  );

  it("holds ballots that verify off-chain, as the contract tests expect", async () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
      election: Address;
      voterCount: number;
      root: string;
      ballots: FixtureBallot[];
      approval: FixtureBallot;
      foreign: FixtureBallot;
      single: { root: string; ballot: FixtureBallot };
    };
    const check = (ballot: FixtureBallot, root = fixture.root, voterCount = fixture.voterCount) =>
      verifyBallot({ ballot: fromFixture(ballot), election: fixture.election, root, voterCount });

    for (const ballot of [...fixture.ballots, fixture.approval]) {
      expect(await check(ballot)).toBe(true);
    }
    expect(await check(fixture.foreign)).toBe(false);
    expect(await check(fixture.single.ballot, fixture.single.root, 1)).toBe(true);
  }, 60_000);
});
