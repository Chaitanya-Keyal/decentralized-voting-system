"use client";

import { getAddress, isAddress } from "viem";

import { useElection } from "@/lib/election";
import { describeError } from "@/lib/errors";
import { useChainNow } from "@/lib/time";

import { AuthorityPanel } from "./election/authority-panel";
import { Ballots } from "./election/ballots";
import { Description } from "./election/description";
import { NextStep } from "./election/next-step";
import { Results } from "./election/results";
import { Timeline } from "./election/timeline";
import { PhaseBadge } from "./phase";
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
          <PhaseBadge phase={election.phase} />
        </div>
        <p className="text-xs text-zinc-500">
          Contract <Mono value={election.address} short={false} />
        </p>
        <Description cid={election.metadataCid} />
      </div>

      <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
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

      <Card
        title="Ballots"
        description="Every ballot is a transaction on the chain. This list comes from our indexer, and each entry names its transaction, linked to a block explorer where the chain has one."
      >
        <Ballots
          election={election.address}
          candidates={election.candidates.map((candidate) => candidate.name)}
        />
      </Card>
    </>
  );
}
