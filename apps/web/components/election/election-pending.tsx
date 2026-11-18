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
  const notFound = (
    <Notice tone="error">
      This link doesn&apos;t point to a DVote election. Check that you copied the whole link.
    </Notice>
  );
  if (!valid) return notFound;
  if (error) return <Notice tone="error">{describeError(error)}</Notice>;
  if (election === undefined) return <Loading>Loading the election from the blockchain…</Loading>;
  return notFound;
}
