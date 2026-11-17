// What a Google sign-in is for. Google puts the nonce it was given into the ID token it signs, so a
// token made for registering one wallet or voting key in one election cannot be used for another:
// a token that leaked could not register someone else's key under the voter's address.
import { keccak256, toBytes, type Address, type Hex } from "viem";

/**
 * The nonce for a sign-in that registers `subject`, a wallet address (wallet ballots) or an
 * identity commitment (anonymous ballots), in `election` on chain `chainId`.
 */
export function googleNonce(chainId: number, election: Address, subject: string): Hex {
  const canonical = /^0x[0-9a-fA-F]{40}$/.test(subject)
    ? subject.toLowerCase()
    : BigInt(subject).toString();
  return keccak256(toBytes(`dvote-registration:${chainId}:${election.toLowerCase()}:${canonical}`));
}
