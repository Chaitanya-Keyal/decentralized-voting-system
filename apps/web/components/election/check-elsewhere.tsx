import { useQuery } from "@tanstack/react-query";
import { getAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";

import type { OnchainElection } from "@/lib/election";
import { explorer, explorerAddress } from "@/lib/env";
import { publicIpfsUrl } from "@/lib/ipfs";

import { ExternalLink } from "../ui";

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

/** Where to check the election without this site: a block explorer and a gateway run by others. */
export function CheckElsewhere({ election }: { election: OnchainElection }) {
  const { data: implementation } = useImplementation(election.address);
  const contract = explorerAddress(election.address);
  if (!explorer || !contract) return null;
  const list = election.voterListCid ? publicIpfsUrl(election.voterListCid) : undefined;
  return (
    <div className="mt-4 flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <p>To check without this site at all, use services run by others:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>
          <ExternalLink href={`${contract}?tab=logs`}>
            The election&apos;s events on {explorer.name}
          </ExternalLink>
          : the voter list&apos;s fingerprint, each ballot by its ballot ID, and the final tally and
          winners.
        </li>
        {implementation && (
          <li>
            <ExternalLink href={`${explorerAddress(implementation)}?tab=contract`}>
              The contract&apos;s source code
            </ExternalLink>
            : the election is a copy of this contract, whose source is verified on Sourcify.
          </li>
        )}
        {list && (
          <li>
            <ExternalLink href={list}>The voter list on Pinata&apos;s IPFS gateway</ExternalLink>.
            Its IPFS address is a hash of its contents, recorded in the contract, so a changed list
            would not match.
          </li>
        )}
      </ul>
    </div>
  );
}
