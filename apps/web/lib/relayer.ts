"use client";

// Sending an anonymous ballot through the relayer, which pays its gas. The booth signs the call
// with a key made for this ballot alone, so the only address on the transaction besides the
// relayer's is one that has never been used before and never will be again.
import {
  forwardRequestTypedData,
  relayAcceptedSchema,
  relayConfigSchema,
  relayStatusSchema,
  semaphoreElectionAbi,
  voteForwarderAbi,
  type AnonymousBallot,
} from "@dvote/shared";
import { encodeFunctionData, type Address, type PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { call } from "./api";
import { chain, relayerUrl } from "./env";

/** Enough for a relayed ballot (about 340,000 gas), with room to spare. */
const GAS = 500_000n;

export const relayerApi = {
  config: () => call(relayConfigSchema, "/config", undefined, relayerUrl),
  status: (id: string) => call(relayStatusSchema, `/ballots/${id}`, undefined, relayerUrl),
};

export function ballotCalldata(ballot: AnonymousBallot) {
  return encodeFunctionData({
    abi: semaphoreElectionAbi,
    functionName: "castVote",
    args: [ballot.choice, ballot.nullifier, ballot.points],
  });
}

/** Signs the ballot with a fresh throwaway key and hands it to the relayer. */
export async function relayBallot(args: {
  client: PublicClient;
  forwarder: Address;
  election: Address;
  ballot: AnonymousBallot;
}) {
  const throwaway = privateKeyToAccount(generatePrivateKey());
  const data = ballotCalldata(args.ballot);
  const nonce = await args.client.readContract({
    address: args.forwarder,
    abi: voteForwarderAbi,
    functionName: "nonces",
    args: [throwaway.address],
  });
  const now = (await args.client.getBlock()).timestamp;
  const deadline = Number(now) + 60 * 60;
  const signature = await throwaway.signTypedData(
    forwardRequestTypedData({
      chainId: chain.id,
      forwarder: args.forwarder,
      from: throwaway.address,
      to: args.election,
      gas: GAS,
      nonce,
      deadline,
      data,
    }),
  );
  return call(
    relayAcceptedSchema,
    "/ballots",
    {
      request: {
        from: throwaway.address,
        to: args.election,
        value: "0",
        gas: GAS.toString(),
        deadline,
        data,
        signature,
      },
    },
    relayerUrl,
  );
}
