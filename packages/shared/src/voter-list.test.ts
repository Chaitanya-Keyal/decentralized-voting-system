import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { getAddress, keccak256, toHex, type Address, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import {
  buildVoterList,
  normalizeVoters,
  parseVoterList,
  VOTER_LIST_FORMAT,
  verifyVoterList,
  voterLeaf,
  voterProof,
  voterTree,
} from "./voter-list";

const ELECTION = getAddress("0x5fbdb2315678afecb367f032d93f642f64180aa3");

/** `n` deterministic addresses. */
function addresses(n: number, label = "voter"): Address[] {
  return Array.from({ length: n }, (_, i) =>
    getAddress(keccak256(toHex(`${label} ${i}`)).slice(0, 42)),
  );
}

describe("normalizeVoters", () => {
  it("checksums, removes duplicates whatever their case, and sorts", () => {
    const low = "0x00000000000000000000000000000000000000aa";
    const high = "0x00000000000000000000000000000000000000bb";
    expect(normalizeVoters([high, low.toUpperCase().replace("0X", "0x"), low])).toEqual([
      getAddress(low),
      getAddress(high),
    ]);
  });

  it("rejects something that is not an address", () => {
    expect(() => normalizeVoters(["0x1234"])).toThrow();
  });
});

describe("voterTree", () => {
  const voters = addresses(7);
  const tree = voterTree(voters);

  it("hashes leaves the way MerkleElection.voterLeaf does", () => {
    for (const voter of voters) {
      expect(voterLeaf(voter)).toBe(tree.leafHash([voter]));
    }
  });

  it("gives every voter a proof that verifies against the root", () => {
    for (const voter of voters) {
      const proof = voterProof(tree, voter);
      expect(proof).toBeDefined();
      expect(StandardMerkleTree.verify(tree.root, ["address"], [voter], proof!)).toBe(true);
    }
  });

  it("gives no proof to an address that is not on the list", () => {
    const [outsider] = addresses(1, "outsider");
    expect(voterProof(tree, outsider!)).toBeUndefined();
  });

  it("does not depend on the order of the list", () => {
    expect(voterTree([...voters].reverse()).root).toBe(tree.root);
  });

  it("works for a single voter", () => {
    const [only] = addresses(1);
    const single = voterTree([only!]);
    expect(single.root).toBe(voterLeaf(only!));
    expect(voterProof(single, only!)).toEqual([]);
  });

  // The Solidity tests replay these proofs against MerkleElection, so the two sides cannot
  // drift apart. Run `pnpm --filter @dvote/shared test -u` to rewrite the fixture.
  it("matches the fixture the Solidity tests read", async () => {
    const fixture = {
      description: "Written by packages/shared/src/voter-list.test.ts. Do not edit by hand.",
      voters,
      root: tree.root,
      proofs: voters.map((voter) => voterProof(tree, voter)),
    };
    await expect(`${JSON.stringify(fixture, null, 2)}\n`).toMatchFileSnapshot(
      "../../../contracts/test/fixtures/voter-list.json",
    );
  });
});

describe("verifyVoterList", () => {
  const list = buildVoterList({ chainId: 31337, election: ELECTION, voters: addresses(5) });
  const expected = {
    chainId: 31337,
    election: ELECTION,
    root: voterTree(list.voters).root as Hex,
    count: 5n,
  };

  it("accepts the list the root was built from", () => {
    expect(verifyVoterList(list, expected).root).toBe(expected.root);
  });

  it("rejects a list for another election", () => {
    expect(() => verifyVoterList({ ...list, chainId: 1 }, expected)).toThrow(/different election/);
  });

  it("rejects a list with a different number of voters", () => {
    expect(() => verifyVoterList(list, { ...expected, count: 6n })).toThrow(/recorded 6/);
  });

  it("rejects a list that names a voter twice, even if the root and count match", () => {
    const padded = { ...list, voters: [...list.voters, list.voters[0]!] };
    const tree = voterTree(padded.voters);
    expect(() =>
      verifyVoterList(padded, { ...expected, root: tree.root as Hex, count: 6n }),
    ).toThrow(/more than once/);
  });

  it("rejects a list with a voter swapped out", () => {
    const [intruder] = addresses(1, "intruder");
    const swapped = { ...list, voters: [...list.voters.slice(1), intruder!] };
    expect(() => verifyVoterList(swapped, expected)).toThrow(/does not match the root/);
  });
});

describe("parseVoterList", () => {
  const list = buildVoterList({ chainId: 31337, election: ELECTION, voters: addresses(3) });

  it("round-trips through JSON", () => {
    expect(parseVoterList(JSON.parse(JSON.stringify(list)))).toEqual(list);
  });

  it("checksums addresses written in lower case", () => {
    const lower = { ...list, voters: list.voters.map((voter) => voter.toLowerCase()) };
    expect(parseVoterList(lower).voters).toEqual(list.voters);
  });

  it.each([
    ["an unknown format", { ...list, format: "something-else" }],
    ["an empty list", { ...list, voters: [] }],
    ["a bad address", { ...list, voters: ["0x1234"] }],
    ["no election", { format: VOTER_LIST_FORMAT, chainId: 31337, voters: list.voters }],
  ])("rejects %s", (_, data) => {
    expect(() => parseVoterList(data)).toThrow();
  });
});
