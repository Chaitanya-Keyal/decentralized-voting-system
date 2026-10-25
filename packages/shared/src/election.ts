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
