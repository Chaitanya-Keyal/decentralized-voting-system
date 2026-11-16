"use client";

import { getAddress, isAddress } from "viem";

import { useElection } from "@/lib/election";
import { describeError } from "@/lib/errors";
import { useChainNow } from "@/lib/time";

import { Audit } from "./election/audit";
import { AuthorityPanel } from "./election/authority-panel";
import { Ballots } from "./election/ballots";
import { Description } from "./election/description";
import { NextStep } from "./election/next-step";
import { Results } from "./election/results";
import { Timeline } from "./election/timeline";
import { BallotBadges, PhaseBadge } from "./phase";
import { Card, Mono, Notice, Spinner } from "./ui";

export function ElectionView({ address }: { address: string }) {
  const valid = isAddress(address);
  const { data: election, error } = useElection(valid ? getAddress(address) : undefined);
  const now = useChainNow();

  if (!valid) return <Notice tone="error">That is not an election address.</Notice>;
  if (error) return <Notice tone="error">{describeError(error)}</Notice>;
  if (election === undefined) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner /> Reading the election from the chain…
      </p>
    );
  }
  if (election === null) {
    return (
      <Notice tone="error">
        This contract was not created by the election factory, so it is not a DVote election.
      </Notice>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{election.title}</h1>
          <PhaseBadge phase={election.phase} window={election.schedule} now={now} />
          <BallotBadges tier={election.tier} countingRule={election.countingRule} />
        </div>
        <p className="text-xs text-zinc-500">
          Contract <Mono value={election.address} short={false} />
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
        </Card>
      )}

      <Card
        title="Ballots"
        description="Each ballot is a transaction on the chain; each row links to it."
      >
        <Ballots
          election={election.address}
          candidates={election.candidates.map((candidate) => candidate.name)}
          tier={election.tier}
        />
      </Card>
    </>
  );
}
