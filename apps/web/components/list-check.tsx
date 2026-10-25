"use client";

import type { Address } from "viem";

import type { OnchainElection } from "@/lib/election";
import { describeError } from "@/lib/errors";
import { proofFor, useVoterList } from "@/lib/voter-list";

import { Notice, Spinner } from "./ui";

/**
 * Whether `voter` is on the published voter list, checked in the browser: it downloads the list
 * from IPFS and rebuilds the root the contract recorded before trusting it.
 */
export function ListCheck({ election, voter }: { election: OnchainElection; voter: Address }) {
  const list = useVoterList(election);
  if (election.voterListCid === "") return null;
  if (list.isPending) {
    return (
      <Notice>
        <span className="flex items-center gap-2">
          <Spinner /> Downloading the voter list and checking it against the contract…
        </span>
      </Notice>
    );
  }
  if (list.error) {
    return (
      <Notice tone="error">The voter list could not be checked: {describeError(list.error)}</Notice>
    );
  }
  return proofFor(list.data, voter) ? (
    <Notice tone="success">
      Your wallet is on the published voter list of {list.data.voters.length}. The list matches the
      root in the contract.
    </Notice>
  ) : (
    <Notice tone="error">
      Your wallet is not on the published voter list. If you registered it, its receipt is evidence
      that the registrar left you out.
    </Notice>
  );
}
