import { CountingRule, Phase } from "@dvote/shared";

import type { OnchainElection } from "@/lib/election";
import { documentSources } from "@/lib/sources";

import { Badge } from "../ui";
import { SourcesLink } from "../sources-link";

/** The candidates and the tally as the contract holds it: it changes only when a ballot is accepted. */
export function Results({ election }: { election: OnchainElection }) {
  // Under approval a ballot can count for several candidates, so a bar shows the share of ballots
  // that approve the candidate rather than a share of all votes.
  const approval = election.countingRule === CountingRule.Approval;
  const total = approval
    ? election.ballotsCast
    : election.tally.reduce((sum, votes) => sum + votes, 0);
  const finalized = election.phase === Phase.Finalized;
  const counting = election.tally.length > 0;

  return (
    <ul role="list" className="flex flex-col gap-4">
      {election.candidates.map((candidate, index) => {
        const votes = election.tally[index] ?? 0;
        const share = total > 0 ? Math.round((votes / total) * 100) : 0;
        return (
          <li key={index} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 font-medium">
                {candidate.name}
                {finalized && election.winners.includes(index) && <Badge tone="done">Winner</Badge>}
              </span>
              <span className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
                {candidate.manifestoCid && (
                  <span className="text-xs">
                    <SourcesLink
                      sources={documentSources(
                        candidate.manifestoCid,
                        Boolean(election.voterListCid),
                      )}
                    >
                      Manifesto
                    </SourcesLink>
                  </span>
                )}
                {counting &&
                  (approval
                    ? `${votes} approval${votes === 1 ? "" : "s"}`
                    : `${votes} vote${votes === 1 ? "" : "s"}`)}
              </span>
            </div>
            {counting && (
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-zinc-800 dark:bg-zinc-200"
                  style={{ width: `${share}%` }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
