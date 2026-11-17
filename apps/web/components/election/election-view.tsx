"use client";

import { Phase } from "@dvote/shared";
import { getAddress, isAddress } from "viem";

import { useDocumentTitle } from "@/lib/document-title";
import { useElection } from "@/lib/election";
import { explorerAddress } from "@/lib/env";
import { useMarkWalletForOrganisers } from "@/lib/header-wallet";
import { useChainNow } from "@/lib/time";

import { Card, ExternalLink, Mono } from "../ui";
import { Audit } from "./audit";
import { AuthorityPanel } from "./authority-panel";
import { Ballots } from "./ballots";
import { CheckElsewhere } from "./check-elsewhere";
import { Description } from "./description";
import { ElectionPending } from "./election-pending";
import { NextStep } from "./next-step";
import { BallotBadges, PhaseBadge } from "./phase";
import { Results } from "./results";
import { Timeline } from "./timeline";

export function ElectionView({ address }: { address: string }) {
  const valid = isAddress(address);
  const { data: election, error } = useElection(valid ? getAddress(address) : undefined);
  const now = useChainNow();
  useDocumentTitle(election?.title);
  useMarkWalletForOrganisers(election?.tier === 3);

  if (!valid || error || !election) {
    return <ElectionPending valid={valid} error={error} election={election} />;
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{election.title}</h1>
          <PhaseBadge phase={election.phase} window={election.schedule} now={now} />
          <BallotBadges tier={election.tier} countingRule={election.countingRule} />
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Contract{" "}
          {explorerAddress(election.address) ? (
            <ExternalLink href={explorerAddress(election.address)!}>
              <Mono value={election.address} short={false} />
            </ExternalLink>
          ) : (
            <Mono value={election.address} short={false} />
          )}
        </p>
        <Description cid={election.metadataCid} />
      </div>

      <div className="grid items-start gap-6 md:grid-cols-[3fr_2fr]">
        <Card title="Now">
          <NextStep election={election} now={now} />
        </Card>
        <Card title="Schedule">
          <Timeline schedule={election.schedule} now={now} />
        </Card>
      </div>

      <Card
        title="Candidates and votes"
        description={
          election.tally.length > 0
            ? `${election.ballotsCast} of ${election.voterCount} registered voters have voted. The count is kept by the contract.`
            : "Votes are counted by the contract once voting opens."
        }
      >
        <Results election={election} />
      </Card>

      <AuthorityPanel election={election} now={now} />

      {election.voterListCid !== "" && (
        <Card
          title="Audit this election"
          description="Recount the election yourself, in this browser, from the chain and IPFS alone."
        >
          <Audit election={election} />
          <CheckElsewhere election={election} />
        </Card>
      )}

      {(election.phase === Phase.Voting || election.ballotsCast > 0) && (
        <Card
          title="Ballots"
          description={
            election.tier === 3
              ? 'Each ballot is shown by its ballot ID alone, never with who cast it. One cast in this browser is marked "yours".'
              : "Each ballot is shown with the wallet that cast it."
          }
        >
          <Ballots
            election={election.address}
            candidates={election.candidates.map((candidate) => candidate.name)}
            tier={election.tier}
          />
        </Card>
      )}
    </>
  );
}
