import type { Address } from "viem";

/**
 * EIP-712 domain for messages about one election. The election's address is the verifying
 * contract, so a signature made for one election means nothing for any other.
 */
export function electionDomain(chainId: number, election: Address) {
  return { name: "DVote", version: "1", chainId, verifyingContract: election } as const;
}

/**
 * Signed by the voter's wallet when they register, to show that whoever proved the email address
 * also controls the wallet being registered.
 */
export const registrationTypes = {
  Registration: [
    { name: "voter", type: "address" },
    { name: "email", type: "string" },
  ],
} as const;

/**
 * Signed by the registrar for every registration it accepts (FR2). A voter whose address is
 * missing from the published list can show this receipt as proof that the registrar left them
 * out.
 */
export const receiptTypes = {
  RegistrationReceipt: [
    { name: "voter", type: "address" },
    { name: "issuedAt", type: "uint64" },
  ],
} as const;

/** The typed data a voter signs to register, ready for viem's `signTypedData`. */
export function registrationTypedData(args: {
  chainId: number;
  election: Address;
  voter: Address;
  email: string;
}) {
  return {
    domain: electionDomain(args.chainId, args.election),
    types: registrationTypes,
    primaryType: "Registration",
    message: { voter: args.voter, email: args.email },
  } as const;
}

/** The typed data the registrar signs as a receipt; `issuedAt` is in Unix seconds. */
export function receiptTypedData(args: {
  chainId: number;
  election: Address;
  voter: Address;
  issuedAt: number;
}) {
  return {
    domain: electionDomain(args.chainId, args.election),
    types: receiptTypes,
    primaryType: "RegistrationReceipt",
    message: { voter: args.voter, issuedAt: BigInt(args.issuedAt) },
  } as const;
}
