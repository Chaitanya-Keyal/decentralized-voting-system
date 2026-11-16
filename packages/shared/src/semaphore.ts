// Tier 3: anonymous voters. A voter is a Semaphore identity, created on their own device; the
// registrar only ever sees its public commitment. The published identity list rebuilds into a
// Poseidon LeanIMT whose root the election records, and a ballot is a Semaphore proof that its
// sender holds one of the listed identities, bound to the choice and to the election.
import { Group } from "@semaphore-protocol/group";
import { Identity } from "@semaphore-protocol/identity";
import { generateProof, verifyProof } from "@semaphore-protocol/proof";
import { getAddress, isAddressEqual, type Address } from "viem";
import { z } from "zod";

import { addressSchema } from "./voter-list";

export { Identity };

/** Format tag of the identity list the registrar publishes to IPFS for a tier 3 election. */
export const IDENTITY_LIST_FORMAT = "dvote-identity-list-v1";

/** The SNARK scalar field: commitments, roots and nullifiers are all below it. */
export const SNARK_FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export const commitmentSchema = z
  .string()
  .regex(/^\d{1,78}$/, "Not a decimal number")
  .refine((value) => BigInt(value) < SNARK_FIELD, "Not a field element")
  .transform((value) => BigInt(value).toString());

/**
 * The voter list of a tier 3 election: identity commitments as decimal strings, sorted in
 * ascending order with no repeats, so that the tree and its root never depend on who registered
 * first.
 */
export const identityListSchema = z.object({
  format: z.literal(IDENTITY_LIST_FORMAT),
  chainId: z.number().int().positive(),
  election: addressSchema,
  commitments: z.array(commitmentSchema).min(1),
});

export type IdentityList = z.infer<typeof identityListSchema>;

/** Sorts and de-duplicates commitments into the order the tree is built in. */
export function normalizeCommitments(commitments: Iterable<bigint | string>): string[] {
  const unique = new Set(Array.from(commitments, (commitment) => BigInt(commitment)));
  return [...unique].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map(String);
}

export function buildIdentityList(args: {
  chainId: number;
  election: Address;
  commitments: Iterable<bigint | string>;
}): IdentityList {
  return {
    format: IDENTITY_LIST_FORMAT,
    chainId: args.chainId,
    election: getAddress(args.election),
    commitments: normalizeCommitments(args.commitments),
  };
}

export function parseIdentityList(data: unknown): IdentityList {
  return identityListSchema.parse(data);
}

/** The Poseidon LeanIMT over a list of commitments, as Semaphore v4 builds it. */
export function identityTree(commitments: readonly (bigint | string)[]): Group {
  return new Group(commitments.map((commitment) => BigInt(commitment)));
}

/**
 * The tree depth a ballot is proven at: ceil(log2(voters)) and at least 1, exactly as
 * `SemaphoreElection.merkleTreeDepth` computes it from the published voter count.
 */
export function voterTreeDepth(voterCount: number | bigint): number {
  const count = BigInt(voterCount);
  let depth = 1;
  while (1n << BigInt(depth) < count) depth += 1;
  return depth;
}

/** The scope of an election's ballots: its address, so nullifiers differ between elections. */
export function ballotScope(election: Address): bigint {
  return BigInt(election);
}

/** The root as the contract stores it: a bytes32. */
export function rootToBytes32(root: bigint | string): `0x${string}` {
  return `0x${BigInt(root).toString(16).padStart(64, "0")}`;
}

/**
 * Checks a downloaded identity list against what the election recorded on-chain, and returns
 * its tree. Throws with a readable reason if the list belongs to another election, is not in
 * canonical order, has a different number of voters, or does not produce the published root.
 */
export function verifyIdentityList(
  list: IdentityList,
  expected: { chainId: number; election: Address; root: `0x${string}`; count: bigint },
): Group {
  if (list.chainId !== expected.chainId || !isAddressEqual(list.election, expected.election)) {
    throw new Error("This voter list belongs to a different election.");
  }
  const canonical = normalizeCommitments(list.commitments);
  if (canonical.length !== list.commitments.length) {
    throw new Error("The list names the same voter more than once.");
  }
  if (canonical.some((commitment, i) => commitment !== list.commitments[i])) {
    throw new Error("The list is not in the order its tree is built in.");
  }
  if (BigInt(list.commitments.length) !== expected.count) {
    throw new Error(
      `The list has ${list.commitments.length} voters, but the election recorded ${expected.count}.`,
    );
  }
  const tree = identityTree(list.commitments);
  if (BigInt(tree.root) !== BigInt(expected.root)) {
    throw new Error("The list does not match the root the election recorded.");
  }
  return tree;
}

/** A tier 3 ballot as `SemaphoreElection.castVote` takes it. */
export interface AnonymousBallot {
  choice: bigint;
  nullifier: bigint;
  /** The Groth16 proof, packed as Semaphore v4 packs it. */
  points: readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
}

/** Where to load a depth's proving files from: URLs in a browser, file paths in Node. */
export type ArtifactSource = (depth: number) => { wasm: string; zkey: string };

/**
 * Proves a ballot: that `identity` is in `tree`, for `choice`, in `election`. The proof is made at
 * the depth the contract will check it at, with proving files from `artifacts`.
 */
export async function proveBallot(args: {
  identity: Identity;
  tree: Group;
  election: Address;
  choice: bigint;
  artifacts: ArtifactSource;
}): Promise<AnonymousBallot> {
  const depth = voterTreeDepth(args.tree.size);
  const proof = await generateProof(
    args.identity,
    args.tree,
    args.choice,
    ballotScope(args.election),
    depth,
    args.artifacts(depth),
  );
  const points = proof.points.map((point) => BigInt(point));
  if (points.length !== 8) throw new Error("A Semaphore proof has eight points.");
  return {
    choice: args.choice,
    nullifier: BigInt(proof.nullifier),
    points: points as unknown as AnonymousBallot["points"],
  };
}

/**
 * Checks a ballot's proof off-chain, the same way the contract does: against the published root,
 * at the depth the published voter count implies, for this election's scope.
 */
export function verifyBallot(args: {
  ballot: AnonymousBallot;
  election: Address;
  root: bigint | string;
  voterCount: number | bigint;
}): Promise<boolean> {
  return verifyProof({
    merkleTreeDepth: voterTreeDepth(args.voterCount),
    merkleTreeRoot: BigInt(args.root).toString(),
    nullifier: args.ballot.nullifier.toString(),
    message: args.ballot.choice.toString(),
    scope: ballotScope(args.election).toString(),
    points: args.ballot.points.map(String) as unknown as Parameters<
      typeof verifyProof
    >[0]["points"],
  });
}
