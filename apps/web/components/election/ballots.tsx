"use client";

import { useQuery } from "@tanstack/react-query";
import { slice, type Address, type Hex } from "viem";

import { api } from "@/lib/api";
import { chain, explorerTx } from "@/lib/env";
import { useCastBallot } from "@/lib/identity";
import { describeError } from "@/lib/errors";
import { formatTime } from "@/lib/time";

import { Mono, Notice } from "../ui";

/**
 * In tier 2 a ballot's key is the voter's address, left-padded to 32 bytes. In tier 3 it is the
 * nullifier, which says nothing about the voter.
 */
function voterOf(key: Hex, tier: number): Hex {
  return tier === 3 ? key : slice(key, 12);
}

/** Every accepted ballot, from the indexer. Each one links to its transaction on-chain. */
/** The ballot ID of the anonymous ballot this browser cast here, if any. */
function useOwnBallot(election: Address): bigint | undefined {
  const cast = useCastBallot(chain.id, election);
  return cast?.counted ? BigInt(cast.nullifier) : undefined;
}

export function Ballots({
  election,
  candidates,
  tier,
}: {
  election: Address;
  candidates: string[];
  tier: number;
}) {
  const own = useOwnBallot(election);
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
            <th className="py-2 pr-4 font-medium">{tier === 3 ? "Ballot ID" : "Voter"}</th>
            <th className="py-2 pr-4 font-medium">Choice</th>
            <th className="hidden py-2 pr-4 font-medium sm:table-cell">Time</th>
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
                  <Mono value={voterOf(ballot.key, tier)} />
                  {own !== undefined && BigInt(ballot.key) === own && (
                    <span className="ml-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      yours
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {ballot.candidates.map((index) => candidates[index] ?? `#${index}`).join(", ") ||
                    `choice ${ballot.choice}`}
                </td>
                <td className="hidden py-2 pr-4 text-zinc-500 sm:table-cell">
                  {formatTime(ballot.timestamp)}
                </td>
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
