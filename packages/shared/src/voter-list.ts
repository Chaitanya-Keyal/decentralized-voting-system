import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  isAddressEqual,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";

/** Format tag of the voter list the registrar publishes to IPFS. */
export const VOTER_LIST_FORMAT = "dvote-voter-list-v1";

export const addressSchema = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), "Not an Ethereum address")
  .transform((value) => getAddress(value));

/**
 * The voter list of one election, as published to IPFS when registration closes. In tier 2 a
 * voter is their wallet address, and the on-chain root is the root of `voterTree(voters)`.
 */
export const voterListSchema = z.object({
  format: z.literal(VOTER_LIST_FORMAT),
  chainId: z.number().int().positive(),
  election: addressSchema,
  voters: z.array(addressSchema).min(1),
});

export type VoterList = z.infer<typeof voterListSchema>;

export type VoterTree = StandardMerkleTree<[Address]>;

/** Checksums, de-duplicates and sorts a list of addresses. */
export function normalizeVoters(voters: Iterable<string>): Address[] {
  const unique = new Set(Array.from(voters, (voter) => getAddress(voter)));
  return [...unique].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
}

export function buildVoterList(args: {
  chainId: number;
  election: Address;
  voters: Iterable<string>;
}): VoterList {
  return {
    format: VOTER_LIST_FORMAT,
    chainId: args.chainId,
    election: getAddress(args.election),
    voters: normalizeVoters(args.voters),
  };
}

/** Parses a downloaded voter list, throwing if it is not one. */
export function parseVoterList(data: unknown): VoterList {
  return voterListSchema.parse(data);
}

/**
 * The Merkle tree over a voter list: OpenZeppelin's StandardMerkleTree with `address` leaves,
 * which is what `MerkleElection` verifies against. The root does not depend on the list's order.
 */
export function voterTree(voters: readonly Address[]): VoterTree {
  return StandardMerkleTree.of(
    voters.map((voter): [Address] => [voter]),
    ["address"],
  );
}

/** The leaf for `voter`, hashed exactly as `MerkleElection.voterLeaf` hashes it. */
export function voterLeaf(voter: Address): Hex {
  return keccak256(keccak256(encodeAbiParameters([{ type: "address" }], [voter])));
}

/** The proof `castVote` needs from `voter`, or undefined if they are not on the list. */
export function voterProof(tree: VoterTree, voter: Address): Hex[] | undefined {
  for (const [index, [leaf]] of tree.entries()) {
    if (isAddressEqual(leaf, voter)) return tree.getProof(index) as Hex[];
  }
  return undefined;
}

/**
 * Checks a downloaded voter list against what the election recorded on-chain, and returns its
 * tree. Throws with a readable reason if the list belongs to another election, names a voter
 * twice, has a different number of voters, or does not produce the published root.
 */
export function verifyVoterList(
  list: VoterList,
  expected: { chainId: number; election: Address; root: Hex; count: bigint },
): VoterTree {
  if (list.chainId !== expected.chainId || !isAddressEqual(list.election, expected.election)) {
    throw new Error("This voter list belongs to a different election.");
  }
  // A repeated voter would let the recorded count, and so the cap on ballots, exceed the number
  // of people on the list.
  const distinct = new Set(list.voters.map((voter) => voter.toLowerCase()));
  if (distinct.size !== list.voters.length) {
    throw new Error("The list names the same voter more than once.");
  }
  if (BigInt(list.voters.length) !== expected.count) {
    throw new Error(
      `The list has ${list.voters.length} voters, but the election recorded ${expected.count}.`,
    );
  }
  const tree = voterTree(list.voters);
  if (tree.root.toLowerCase() !== expected.root.toLowerCase()) {
    throw new Error("The list does not match the root the election recorded.");
  }
  return tree;
}
