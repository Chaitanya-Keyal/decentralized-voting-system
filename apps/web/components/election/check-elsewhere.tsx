import { useQuery } from "@tanstack/react-query";
import { getAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";

import type { OnchainElection } from "@/lib/election";
import { codeSources, documentSources, eventSources } from "@/lib/sources";

import { SourcesLink } from "../sources-link";

/** An EIP-1167 clone's code: these ten bytes, the implementation's address, then fifteen more. */
const CLONE_PREFIX = "0x363d3d373d3d3d363d73";

/** The contract an election is a clone of, read from its own code on the chain. */
function useImplementation(election: Address) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["implementation", election],
    enabled: Boolean(client),
    staleTime: Infinity,
    queryFn: async () => {
      const code = await client!.getCode({ address: election });
      if (!code?.startsWith(CLONE_PREFIX)) return null;
      return getAddress(`0x${code.slice(CLONE_PREFIX.length, CLONE_PREFIX.length + 40)}`);
    },
  });
}

/** Where to check the election without trusting this site: block explorers and IPFS. */
export function CheckElsewhere({ election }: { election: OnchainElection }) {
  const { data: implementation } = useImplementation(election.address);
  const events = eventSources(election.address);
  if (events.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <p>To check it without trusting this site:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>
          <SourcesLink sources={events}>The election&apos;s events</SourcesLink> on a public block
          explorer: the voter list&apos;s fingerprint, each ballot by its ballot ID, and the final
          tally and winners.
        </li>
        {implementation && (
          <li>
            <SourcesLink sources={codeSources(implementation)}>
              The contract&apos;s source code
            </SourcesLink>
            : the election is a copy of this contract, whose source is verified on Sourcify.
          </li>
        )}
        {election.voterListCid && (
          <li>
            <SourcesLink sources={documentSources(election.voterListCid, true)}>
              The voter list on IPFS
            </SourcesLink>
            . Its IPFS address is a hash of its contents, recorded in the contract, so a copy from
            any gateway can be checked against it.
          </li>
        )}
      </ul>
    </div>
  );
}
