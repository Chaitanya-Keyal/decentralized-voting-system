import Link from "next/link";

import type { OnchainElection } from "@/lib/election";
import { useChainNow } from "@/lib/time";

import { BallotBadges, PhaseBadge } from "./phase";

/** The title line of the voter pages, linking back to the election. */
export function ElectionHeader({
  election,
  action,
}: {
  election: OnchainElection;
  action: string;
}) {
  const now = useChainNow();
  return (
    <div className="flex flex-col gap-1">
      <Link
        href={`/elections/${election.address}`}
        className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← {election.title}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{action}</h1>
        <PhaseBadge phase={election.phase} window={election.schedule} now={now} />
        <BallotBadges tier={election.tier} countingRule={election.countingRule} />
      </div>
    </div>
  );
}
