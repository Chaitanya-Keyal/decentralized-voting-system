"use client";

import type { Address } from "viem";

import type { OnchainElection } from "@/lib/election";
import { describeError } from "@/lib/errors";
import { proofFor, useIdentityList, useVoterList } from "@/lib/voter-list";

import { Notice } from "../ui";

/**
 * Whether `voter` is on the published voter list, checked in the browser: it downloads the list
 * from IPFS and rebuilds the root the contract recorded before trusting it.
 */
export function ListCheck({ election, voter }: { election: OnchainElection; voter: Address }) {
  const list = useVoterList(election);
  if (election.voterListCid === "") return null;
  if (list.isPending) {
    return <Notice busy>Checking that you&apos;re on the voter list…</Notice>;
  }
  if (list.error) {
    return (
      <Notice tone="error">The voter list could not be checked: {describeError(list.error)}</Notice>
    );
  }
  return proofFor(list.data, voter) ? (
    <Notice tone="success">
      Your wallet is on the published voter list ({list.data.voters.length} voters). This browser
      checked the list against its fingerprint on the blockchain.
    </Notice>
  ) : (
    <Notice tone="error">
      Your wallet is not on the published voter list. If you registered it, download your receipt
      and send it to the organiser. It proves the registrar left you out.
    </Notice>
  );
}

/** Tier 3: whether this browser's voting key is on the published list, checked the same way. */
export function IdentityListCheck({
  election,
  commitment,
}: {
  election: OnchainElection;
  commitment: string;
}) {
  const list = useIdentityList(election);
  if (list.isPending) {
    return <Notice busy>Checking that you&apos;re on the voter list…</Notice>;
  }
  if (list.error) {
    return (
      <Notice tone="error">The voter list could not be checked: {describeError(list.error)}</Notice>
    );
  }
  return list.data.commitments.includes(commitment) ? (
    <Notice tone="success">
      Your voting key is on the published voter list ({list.data.commitments.length} voters). This
      browser checked the list against its fingerprint on the blockchain.
    </Notice>
  ) : (
    <Notice tone="error">
      Your voting key is not on the published voter list. If you registered it, download your
      receipt and send it to the organiser. It proves the registrar left you out.
    </Notice>
  );
}
