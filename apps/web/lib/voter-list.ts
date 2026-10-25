"use client";

import { verifyVoterList, voterListSchema, voterProof } from "@dvote/shared";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";

import type { OnchainElection } from "./election";
import { chain } from "./env";
import { fetchFromIpfs } from "./ipfs";

/**
 * Downloads the published voter list from IPFS and rebuilds its Merkle tree in the browser,
 * checking it against the root and the count the contract recorded. Nothing here asks the
 * registrar or the API (FR6).
 */
export function useVoterList(election: OnchainElection | undefined) {
  return useQuery({
    queryKey: ["voter-list", election?.address, election?.voterListCid],
    enabled: Boolean(election && election.voterListCid !== ""),
    staleTime: Infinity,
    queryFn: async () => {
      if (!election) throw new Error("Not ready");
      const list = await fetchFromIpfs(voterListSchema, election.voterListCid);
      const tree = verifyVoterList(list, {
        chainId: chain.id,
        election: election.address,
        root: election.voterRoot,
        count: BigInt(election.voterCount),
      });
      return { voters: list.voters, tree };
    },
  });
}

/** The voter's own Merkle proof, or undefined if they are not on the list. */
export function proofFor(list: ReturnType<typeof useVoterList>["data"], voter: Address) {
  return list ? voterProof(list.tree, voter) : undefined;
}
