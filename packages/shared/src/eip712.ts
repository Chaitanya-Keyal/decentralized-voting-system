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

/**
 * Signed by the registrar for every tier 3 registration it accepts (FR2): the identity commitment
 * the voter's device created, for this election.
 */
export const identityReceiptTypes = {
  IdentityReceipt: [
    { name: "commitment", type: "uint256" },
    { name: "issuedAt", type: "uint64" },
  ],
} as const;

/** The typed data the registrar signs as a tier 3 receipt; `issuedAt` is in Unix seconds. */
export function identityReceiptTypedData(args: {
  chainId: number;
  election: Address;
  commitment: bigint | string;
  issuedAt: number;
}) {
  return {
    domain: electionDomain(args.chainId, args.election),
    types: identityReceiptTypes,
    primaryType: "IdentityReceipt",
    message: { commitment: BigInt(args.commitment), issuedAt: BigInt(args.issuedAt) },
  } as const;
}

/** The EIP-712 domain of the `VoteForwarder`, which checks a relayed ballot's signature. */
export function forwarderDomain(chainId: number, forwarder: Address) {
  return {
    name: "DVote VoteForwarder",
    version: "1",
    chainId,
    verifyingContract: forwarder,
  } as const;
}

/** OpenZeppelin `ERC2771Forwarder`'s request type. */
export const forwardRequestTypes = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
  ],
} as const;

/**
 * The typed data a booth signs, with a throwaway key, to have the relayer submit a ballot. The
 * key exists for one ballot only, so its address links to nothing.
 */
export function forwardRequestTypedData(args: {
  chainId: number;
  forwarder: Address;
  from: Address;
  to: Address;
  gas: bigint;
  nonce: bigint;
  deadline: number;
  data: `0x${string}`;
}) {
  return {
    domain: forwarderDomain(args.chainId, args.forwarder),
    types: forwardRequestTypes,
    primaryType: "ForwardRequest",
    message: {
      from: args.from,
      to: args.to,
      value: 0n,
      gas: args.gas,
      nonce: args.nonce,
      deadline: args.deadline,
      data: args.data,
    },
  } as const;
}

/**
 * Signed by the relayer for every ballot it accepts (FR7): a promise to submit it. A ballot that
 * never reaches the chain leaves the voter holding this receipt as evidence.
 */
export const relayReceiptTypes = {
  RelayReceipt: [
    { name: "nullifier", type: "uint256" },
    { name: "choice", type: "uint256" },
    { name: "acceptedAt", type: "uint64" },
  ],
} as const;

/** The typed data the relayer signs as a receipt; `acceptedAt` is in Unix seconds. */
export function relayReceiptTypedData(args: {
  chainId: number;
  election: Address;
  nullifier: bigint | string;
  choice: bigint | string;
  acceptedAt: number;
}) {
  return {
    domain: electionDomain(args.chainId, args.election),
    types: relayReceiptTypes,
    primaryType: "RelayReceipt",
    message: {
      nullifier: BigInt(args.nullifier),
      choice: BigInt(args.choice),
      acceptedAt: BigInt(args.acceptedAt),
    },
  } as const;
}
