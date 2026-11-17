"use client";

// Sending an anonymous ballot through the relayer, which submits it and pays its gas. The ballot
// carries no signature and no address: its proof alone shows it comes from someone on the list,
// and binds the choice and the election, so the relayer can neither change it nor learn who cast
// it. The only address on the transaction is the relayer's own.
import {
  relayAcceptedSchema,
  relayConfigSchema,
  relayReceiptTypedData,
  relayStatusSchema,
  type AnonymousBallot,
} from "@dvote/shared";
import { isAddressEqual, recoverTypedDataAddress, type Address } from "viem";

import { call } from "./api";
import { chain, relayerUrl } from "./env";

export const relayerApi = {
  config: () => call(relayConfigSchema, "/config", undefined, relayerUrl),
  status: (id: string) => call(relayStatusSchema, `/ballots/${id}`, undefined, relayerUrl),
};

/**
 * Hands the ballot to the relayer, which checks it and returns its signed promise to submit it.
 * The promise is checked before it is kept: it must be for this ballot, signed by the relayer.
 */
export async function relayBallot(args: { election: Address; ballot: AnonymousBallot }) {
  const accepted = await call(
    relayAcceptedSchema,
    "/ballots",
    {
      election: args.election,
      choice: args.ballot.choice.toString(),
      nullifier: args.ballot.nullifier.toString(),
      points: args.ballot.points.map(String),
    },
    relayerUrl,
  );
  const { receipt } = accepted;
  const forThisBallot =
    receipt.chainId === chain.id &&
    isAddressEqual(receipt.election, args.election) &&
    receipt.nullifier === args.ballot.nullifier.toString() &&
    receipt.choice === args.ballot.choice.toString();
  const signer = await recoverTypedDataAddress({
    ...relayReceiptTypedData(receipt),
    signature: receipt.signature,
  }).catch(() => undefined);
  if (!forThisBallot || !signer || !isAddressEqual(signer, receipt.relayer)) {
    throw new Error("The relayer's receipt does not match this ballot. Submit it from a wallet.");
  }
  return accepted;
}
