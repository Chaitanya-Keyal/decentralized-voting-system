"use client";

import { electionMetadataSchema } from "@dvote/shared";
import { useQuery } from "@tanstack/react-query";

import { fetchFromIpfs, ipfsUrl } from "@/lib/ipfs";

import { ExternalLink, muted } from "../ui";

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
      <p className={`text-sm ${muted}`}>
        The description could not be loaded from{" "}
        <ExternalLink href={ipfsUrl(cid)}>IPFS</ExternalLink>.
      </p>
    );
  }
  return <p className="text-sm whitespace-pre-wrap">{data?.description}</p>;
}
