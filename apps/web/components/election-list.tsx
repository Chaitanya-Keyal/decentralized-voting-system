"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { api } from "@/lib/api";
import { describeError } from "@/lib/errors";
import { formatTime } from "@/lib/time";

import { PhaseBadge } from "./phase";
import { Card, Notice, Spinner } from "./ui";

export function ElectionList() {
  const { data, error, isPending } = useQuery({
    queryKey: ["elections"],
    queryFn: api.elections,
    refetchInterval: 5_000,
  });

  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner /> Loading elections…
      </p>
    );
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
                <PhaseBadge phase={election.phase} />
              </div>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Voting {formatTime(election.votingStart)} – {formatTime(election.votingEnd)}
                {" · "}
                {election.voterCount === null
                  ? "voter list not published yet"
                  : `${election.ballotsCast} of ${election.voterCount} voted`}
              </p>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
