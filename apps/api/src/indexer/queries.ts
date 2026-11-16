// What the API serves from the indexer's tables.
import {
  choiceCandidates,
  Phase,
  type Ballot,
  type ElectionDetail,
  type ElectionSummary,
} from "@dvote/shared";
import type { Address, Hex } from "viem";

import { chain, publicClient } from "../chain";
import { db } from "../db";
import type { Election } from "../generated/prisma/client";
import { HttpError } from "../http";

function summary(election: Election, ballotsCast: number): ElectionSummary {
  return {
    address: election.address as Address,
    tier: election.tier,
    countingRule: election.countingRule,
    title: election.title,
    phase: election.phase,
    registrationStart: Number(election.registrationStart),
    registrationEnd: Number(election.registrationEnd),
    votingStart: Number(election.votingStart),
    votingEnd: Number(election.votingEnd),
    voterCount: election.voterCount,
    ballotsCast,
  };
}

export async function listElections(): Promise<{ elections: ElectionSummary[] }> {
  const elections = await db.election.findMany({
    orderBy: { createdAtBlock: "desc" },
    include: { _count: { select: { ballots: true } } },
  });
  return { elections: elections.map((election) => summary(election, election._count.ballots)) };
}

export async function getElection(address: Address): Promise<ElectionDetail> {
  const election = await db.election.findUnique({
    where: { address },
    include: { candidates: { orderBy: { index: "asc" } } },
  });
  if (!election) throw new HttpError(404, "The indexer has not seen this election.");

  // Under approval voting a ballot can count for several candidates, so the counts come from
  // each ballot's choice rather than from grouping.
  const counts = await db.ballot.groupBy({
    by: ["choice"],
    where: { electionAddress: address },
    _count: { _all: true },
  });
  const votes = new Map<number, number>();
  for (const count of counts) {
    for (const index of choiceCandidates(
      election.countingRule,
      BigInt(count.choice),
      election.candidates.length,
    )) {
      votes.set(index, (votes.get(index) ?? 0) + count._count._all);
    }
  }
  const ballotsCast = counts.reduce((total, count) => total + count._count._all, 0);

  return {
    ...summary(election, ballotsCast),
    authority: election.authority as Address,
    registrar: election.registrar as Address,
    metadataCid: election.metadataCid,
    voterRoot: election.voterRoot as Hex | null,
    voterListCid: election.voterListCid,
    candidates: election.candidates.map((candidate) => ({
      name: candidate.name,
      manifestoCid: candidate.manifestoCid,
      votes: votes.get(candidate.index) ?? 0,
    })),
    winners: election.phase === Phase.Finalized ? election.winners : null,
    createdTxHash: election.createdTxHash as Hex,
  };
}

export async function listBallots(address: Address): Promise<{ ballots: Ballot[] }> {
  const election = await db.election.findUnique({
    where: { address },
    include: { _count: { select: { candidates: true } } },
  });
  const ballots = await db.ballot.findMany({
    where: { electionAddress: address },
    orderBy: [{ blockNumber: "asc" }, { logIndex: "asc" }],
  });
  return {
    ballots: ballots.map((ballot) => ({
      key: ballot.key as Hex,
      choice: ballot.choice,
      candidates: choiceCandidates(
        election?.countingRule ?? 0,
        BigInt(ballot.choice),
        election?._count.candidates ?? 0,
      ),
      blockNumber: Number(ballot.blockNumber),
      timestamp: Number(ballot.timestamp),
      txHash: ballot.txHash as Hex,
    })),
  };
}

export async function indexerStatus() {
  const [cursor, head] = await Promise.all([
    db.indexerCursor.findUnique({ where: { chainId: chain.id } }),
    publicClient.getBlockNumber(),
  ]);
  return { chainId: chain.id, block: cursor ? Number(cursor.block) : null, head: Number(head) };
}
