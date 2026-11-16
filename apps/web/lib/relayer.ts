"use client";

// Sending an anonymous ballot through the relayer, which submits it and pays its gas. The ballot
// carries no signature and no address: its proof alone shows it comes from someone on the list,
// and binds the choice and the election, so the relayer can neither change it nor learn who cast
// it. The only address on the transaction is the relayer's own.
import {
  relayAcceptedSchema,
  relayConfigSchema,
  relayStatusSchema,
  type AnonymousBallot,
} from "@dvote/shared";
import type { Address } from "viem";

import { call } from "./api";
import { relayerUrl } from "./env";

export const relayerApi = {
  config: () => call(relayConfigSchema, "/config", undefined, relayerUrl),
  status: (id: string) => call(relayStatusSchema, `/ballots/${id}`, undefined, relayerUrl),
};

/** Hands the ballot to the relayer, which checks it and returns its signed promise to submit it. */
export function relayBallot(args: { election: Address; ballot: AnonymousBallot }) {
  return call(
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
}
