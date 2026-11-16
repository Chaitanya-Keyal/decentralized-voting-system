"use client";

import {
  deploymentFor,
  electionFactories,
  electionFactoryAbi,
  merkleElectionAbi,
} from "@dvote/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useBlockNumber, usePublicClient, useReadContract } from "wagmi";

import { chain } from "./env";

/** The contracts on the chain the app is configured for, or undefined if none are deployed. */
export const deployment = deploymentFor(chain.id);

/**
 * The factory's ABI together with the election's errors, which `createElection` can revert with
 * while it initializes the new election.
 */
export const factoryAbi = [
  ...electionFactoryAbi,
  ...merkleElectionAbi.filter((item) => item.type === "error"),
];

export interface Schedule {
  registrationStart: number;
  registrationEnd: number;
  votingStart: number;
  votingEnd: number;
}

export interface OnchainElection {
  address: Address;
  phase: number;
  title: string;
  metadataCid: string;
  schedule: Schedule;
  candidates: { name: string; manifestoCid: string }[];
  /** Votes per candidate; empty until voting opens. */
  tally: number[];
  /** Empty until finalized, and if nobody voted. */
  winners: number[];
  ballotsCast: number;
  voterRoot: Hex;
  voterCount: number;
  voterListCid: string;
}

/**
 * Reads an election straight from the chain, and again whenever a block arrives. The data is
 * `null` if the factory did not create this address, which is how a look-alike contract is told
 * apart from a real election.
 */
export function useElection(address: Address | undefined) {
  const client = usePublicClient();
  const { data: block } = useBlockNumber({ watch: true });
  return useQuery({
    queryKey: ["election", address, block?.toString()],
    enabled: Boolean(client && address),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<OnchainElection | null> => {
      if (!deployment) throw new Error(`DVote's contracts are not deployed on ${chain.name} yet.`);
      if (!client || !address) throw new Error("Not ready");
      const created = await Promise.all(
        electionFactories(deployment).map((factory) =>
          client.readContract({
            address: factory,
            abi: electionFactoryAbi,
            functionName: "isElection",
            args: [address],
          }),
        ),
      );
      if (!created.includes(true)) return null;

      const contract = { address, abi: merkleElectionAbi } as const;
      const [
        phase,
        [registrationStart, registrationEnd, votingStart, votingEnd],
        title,
        metadataCid,
        candidates,
        tally,
        winners,
        ballotsCast,
        voterRoot,
        voterCount,
        voterListCid,
      ] = await Promise.all([
        client.readContract({ ...contract, functionName: "phase" }),
        client.readContract({ ...contract, functionName: "schedule" }),
        client.readContract({ ...contract, functionName: "title" }),
        client.readContract({ ...contract, functionName: "metadataCid" }),
        client.readContract({ ...contract, functionName: "candidates" }),
        client.readContract({ ...contract, functionName: "tally" }),
        client.readContract({ ...contract, functionName: "winners" }),
        client.readContract({ ...contract, functionName: "ballotsCast" }),
        client.readContract({ ...contract, functionName: "voterRoot" }),
        client.readContract({ ...contract, functionName: "voterCount" }),
        client.readContract({ ...contract, functionName: "voterListCid" }),
      ]);
      return {
        address,
        phase,
        title,
        metadataCid,
        schedule: {
          registrationStart: Number(registrationStart),
          registrationEnd: Number(registrationEnd),
          votingStart: Number(votingStart),
          votingEnd: Number(votingEnd),
        },
        candidates: [...candidates],
        tally: tally.map(Number),
        winners: winners.map(Number),
        ballotsCast: Number(ballotsCast),
        voterRoot,
        voterCount: Number(voterCount),
        voterListCid,
      };
    },
  });
}

/** Whether `account` holds `role` in the election. */
export function useHasRole(election: Address, role: Hex, account: Address | undefined) {
  const { data } = useReadContract({
    address: election,
    abi: merkleElectionAbi,
    functionName: "hasRole",
    args: account ? [role, account] : undefined,
    query: { enabled: Boolean(account) },
  });
  return data === true;
}
