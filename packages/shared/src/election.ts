import { keccak256, toHex } from "viem";

/** `Election.Phase`, in the contract's order. */
export const PHASES = [
  "Created",
  "Registration",
  "Voting",
  "Tallying",
  "Finalized",
  "Cancelled",
] as const;

export type PhaseName = (typeof PHASES)[number];

/** The numeric value of each phase, as the contract returns it. */
export const Phase = {
  Created: 0,
  Registration: 1,
  Voting: 2,
  Tallying: 3,
  Finalized: 4,
  Cancelled: 5,
} as const satisfies Record<PhaseName, number>;

export function phaseName(phase: number): PhaseName {
  const name = PHASES[phase];
  if (name === undefined) throw new Error(`Unknown phase ${phase}`);
  return name;
}

/** `Election.AUTHORITY_ROLE`: configures and can cancel the election. */
export const AUTHORITY_ROLE = keccak256(toHex("AUTHORITY_ROLE"));

/** `Election.REGISTRAR_ROLE`: publishes the voter list and signs registration receipts. */
export const REGISTRAR_ROLE = keccak256(toHex("REGISTRAR_ROLE"));

/** `TallyLib.CountingRule`, in the contract's order. */
export const CountingRule = { Plurality: 0, Approval: 1 } as const;

/**
 * The candidates a ballot counts for: the one it names under plurality, or each candidate whose
 * bit is set under approval. Returns an empty list for a choice the contract would refuse.
 */
export function choiceCandidates(
  countingRule: number,
  choice: bigint,
  candidates: number,
): number[] {
  if (countingRule === CountingRule.Plurality) {
    return choice < BigInt(candidates) ? [Number(choice)] : [];
  }
  if (choice === 0n || choice >> BigInt(candidates) !== 0n) return [];
  return Array.from({ length: candidates }, (_, i) => i).filter((i) => (choice >> BigInt(i)) & 1n);
}

/** The choice for an approval ballot that approves `candidates`. */
export function approvalChoice(candidates: Iterable<number>): bigint {
  let choice = 0n;
  for (const candidate of candidates) choice |= 1n << BigInt(candidate);
  return choice;
}
