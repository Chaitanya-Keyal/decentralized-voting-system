"use client";

import { useQuery } from "@tanstack/react-query";
import { slice, type Address, type Hex } from "viem";

import { api } from "@/lib/api";
import { explorerTx } from "@/lib/env";
import { describeError } from "@/lib/errors";
import { formatTime } from "@/lib/time";

import { Mono, Notice } from "../ui";

/** In tier 2 a ballot's key is the voter's address, left-padded to 32 bytes. */
function voterOf(key: Hex): Hex {
  return slice(key, 12);
}

/** Every accepted ballot, from the indexer. Each one links to its transaction on-chain. */
export function Ballots({ election, candidates }: { election: Address; candidates: string[] }) {
  const { data, error } = useQuery({
    queryKey: ["ballots", election],
    queryFn: () => api.ballots(election),
    refetchInterval: 5_000,
  });

  if (error) return <Notice tone="error">{describeError(error)}</Notice>;
  if (!data) return null;
  if (data.ballots.length === 0) return <p className="text-sm text-zinc-500">No ballots yet.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-zinc-500">
          <tr>
            <th className="py-2 pr-4 font-medium">Voter</th>
            <th className="py-2 pr-4 font-medium">Choice</th>
            <th className="py-2 pr-4 font-medium">Time</th>
            <th className="py-2 font-medium">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {data.ballots.map((ballot) => {
            const link = explorerTx(ballot.txHash);
            return (
              <tr
                key={`${ballot.txHash}`}
                className="border-t border-zinc-100 dark:border-zinc-900"
              >
                <td className="py-2 pr-4">
                  <Mono value={voterOf(ballot.key)} />
                </td>
                <td className="py-2 pr-4">
                  {candidates[ballot.candidate] ?? `#${ballot.candidate}`}
                </td>
                <td className="py-2 pr-4 text-zinc-500">{formatTime(ballot.timestamp)}</td>
                <td className="py-2">
                  {link ? (
                    <a href={link} target="_blank" rel="noreferrer" className="underline">
                      <Mono value={ballot.txHash} />
                    </a>
                  ) : (
                    <Mono value={ballot.txHash} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
