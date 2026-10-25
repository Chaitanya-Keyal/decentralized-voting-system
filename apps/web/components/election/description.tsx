"use client";

import { electionMetadataSchema } from "@dvote/shared";
import { useQuery } from "@tanstack/react-query";

import { fetchFromIpfs, ipfsUrl } from "@/lib/ipfs";

export function Description({ cid }: { cid: string }) {
  const { data, error } = useQuery({
    queryKey: ["ipfs", cid],
    queryFn: () => fetchFromIpfs(electionMetadataSchema, cid),
    enabled: cid !== "",
    staleTime: Infinity,
  });
  if (!cid) return null;
  if (error) {
    return (
      <p className="text-sm text-zinc-500">
        The description could not be loaded from{" "}
        <a href={ipfsUrl(cid)} className="underline" target="_blank" rel="noreferrer">
          IPFS
        </a>
        .
      </p>
    );
  }
  return <p className="text-sm whitespace-pre-wrap">{data?.description}</p>;
}
