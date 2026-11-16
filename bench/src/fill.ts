// Made-up voter lists of a given size, around the few real voters a benchmark casts ballots for.
import { SNARK_FIELD } from "@dvote/shared";
import { getAddress, keccak256, toHex, type Address } from "viem";

/** `count` distinct addresses that belong to nobody, plus the real ones. */
export function fillAddresses(count: number, real: Address[]): Address[] {
  const fake = Array.from({ length: Math.max(0, count - real.length) }, (_, i) =>
    getAddress(keccak256(toHex(`dvote bench voter ${i}`)).slice(0, 42)),
  );
  return [...real, ...fake];
}

/** `count` distinct identity commitments, plus the real ones. Any field element is a valid leaf. */
export function fillCommitments(count: number, real: bigint[]): bigint[] {
  const fake = Array.from(
    { length: Math.max(0, count - real.length) },
    (_, i) => BigInt(keccak256(toHex(`dvote bench identity ${i}`))) % SNARK_FIELD,
  );
  return [...real, ...fake];
}

/** Writes rows as CSV, with a header from the first row's keys. */
export function csv(rows: Record<string, string | number | bigint>[]): string {
  if (rows.length === 0) return "";
  const header = Object.keys(rows[0]!);
  return [header.join(","), ...rows.map((row) => header.map((key) => String(row[key])).join(","))]
    .join("\n")
    .concat("\n");
}

/** The roll sizes measured: powers of two from 2 to 2^max. */
export function rollSizes(max: number): number[] {
  return Array.from({ length: max }, (_, i) => 2 ** (i + 1));
}
