"use client";

import { electionMetadataSchema } from "@dvote/shared";
import { useQuery } from "@tanstack/react-query";

import { fetchFromIpfs } from "@/lib/ipfs";
import { documentSources } from "@/lib/sources";

import { SourcesLink } from "../sources-link";
import { muted } from "../ui";

/** The election's description, from IPFS. `copied` once its documents are on Pinata too. */
export function Description({ cid, copied }: { cid: string; copied: boolean }) {
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
        <SourcesLink sources={documentSources(cid, copied)}>IPFS</SourcesLink>.
      </p>
    );
  }
  return <p className="text-sm whitespace-pre-wrap">{data?.description}</p>;
}
