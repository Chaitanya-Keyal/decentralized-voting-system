import type { OnchainElection } from "@/lib/election";
import { describeError } from "@/lib/errors";

import { Loading, Notice } from "../ui";

/** What an election's pages show until the election has loaded, or why it cannot be shown. */
export function ElectionPending({
  valid,
  error,
  election,
}: {
  /** Whether the page's address is an address at all. */
  valid: boolean;
  error: Error | null;
  election: OnchainElection | null | undefined;
}) {
  if (!valid) return <Notice tone="error">That is not an election address.</Notice>;
  if (error) return <Notice tone="error">{describeError(error)}</Notice>;
  if (election === undefined) return <Loading>Reading the election from the chain…</Loading>;
  return (
    <Notice tone="error">
      This contract was not created by the election factory, so it is not a DVote election.
    </Notice>
  );
}
