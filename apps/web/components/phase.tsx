import { Phase, phaseName } from "@dvote/shared";

import { Badge } from "./ui";

export function PhaseBadge({ phase }: { phase: number }) {
  const tone =
    phase === Phase.Registration || phase === Phase.Voting
      ? "live"
      : phase === Phase.Finalized
        ? "done"
        : phase === Phase.Cancelled
          ? "muted"
          : "neutral";
  return <Badge tone={tone}>{phaseName(phase)}</Badge>;
}
