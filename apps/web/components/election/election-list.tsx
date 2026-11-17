"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { api } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { formatShort, useChainNow } from "@/lib/time";

import { Card, Loading, Notice } from "../ui";
import { BallotBadges, PhaseBadge } from "./phase";

export function ElectionList() {
  const now = useChainNow();
  const { data, error, isPending } = useQuery({
    queryKey: ["elections"],
    queryFn: api.elections,
    refetchInterval: 5_000,
  });

  if (isPending) {
    return <Loading>Loading elections…</Loading>;
  }
  if (error) return <Notice tone="error">{describeError(error)}</Notice>;
  if (data.elections.length === 0) {
    return (
      <Notice>
        No elections yet.{" "}
        <Link href="/elections/new" className="underline">
          Create one
        </Link>
        .
      </Notice>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {data.elections.map((election) => (
        <li key={election.address}>
          <Link href={`/elections/${election.address}`} className="block">
            <Card className="transition-colors hover:border-zinc-400 dark:hover:border-zinc-600">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{election.title || "Untitled election"}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <BallotBadges tier={election.tier} countingRule={election.countingRule} />
                  <PhaseBadge phase={election.phase} window={election} now={now} />
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Voting {formatShort(election.votingStart)} – {formatShort(election.votingEnd)}
                {" · "}
                {election.voterCount === null
                  ? "list not published yet"
                  : `${election.ballotsCast} of ${election.voterCount.toLocaleString()} voted`}
              </p>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
