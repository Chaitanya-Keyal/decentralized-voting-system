import { deployment, type OnchainElection } from "@/lib/election";
import { explorer, explorerAddress } from "@/lib/env";
import { publicIpfsUrl } from "@/lib/ipfs";

import { ExternalLink } from "../ui";

/** Where to check the election without this site: a block explorer and a gateway run by others. */
export function CheckElsewhere({ election }: { election: OnchainElection }) {
  const contract = explorerAddress(election.address);
  if (!explorer || !contract) return null;
  const shared =
    deployment && (election.tier === 3 ? deployment.semaphoreElection : deployment.merkleElection);
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
        {shared && (
          <li>
            <ExternalLink href={`${explorerAddress(shared)}?tab=contract`}>
              The contract&apos;s source code
            </ExternalLink>
            , shared by every election of this kind and verified on Sourcify.
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
