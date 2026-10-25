import { Phase } from "@dvote/shared";

import type { OnchainElection } from "@/lib/election";
import { ipfsUrl } from "@/lib/ipfs";

import { Badge } from "../ui";

/** The candidates and the tally as the contract holds it: it changes only when a ballot is accepted. */
export function Results({ election }: { election: OnchainElection }) {
  const total = election.tally.reduce((sum, votes) => sum + votes, 0);
  const finalized = election.phase === Phase.Finalized;
  const counting = election.tally.length > 0;

  return (
    <ul className="flex flex-col gap-4">
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
                  <a
                    href={ipfsUrl(candidate.manifestoCid)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline"
                  >
                    Manifesto
                  </a>
                )}
                {counting && `${votes} vote${votes === 1 ? "" : "s"}`}
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
