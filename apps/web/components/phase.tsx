import { Phase, phaseName, CountingRule } from "@dvote/shared";

import { Badge } from "./ui";

/**
 * The phase to show. Registration is open once its time has come, whether or not anyone has yet
 * recorded that on-chain, so a created election inside its registration window shows as open.
 */
export function shownPhase(
  phase: number,
  window?: { registrationStart: number; registrationEnd: number },
  now?: number,
): number {
  if (phase === Phase.Created && window && now !== undefined) {
    if (now >= window.registrationStart && now < window.registrationEnd) return Phase.Registration;
  }
  return phase;
}

export function PhaseBadge({
  phase: recorded,
  window,
  now,
}: {
  phase: number;
  window?: { registrationStart: number; registrationEnd: number };
  now?: number;
}) {
  const phase = shownPhase(recorded, window, now);
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

/** How an election's ballots work: anonymous or by wallet, and how they are counted. */
export function BallotBadges({ tier, countingRule }: { tier: number; countingRule: number }) {
  return (
    <>
      <Badge>{tier === 3 ? "Anonymous ballots" : "Wallet ballots"}</Badge>
      {countingRule === CountingRule.Approval && <Badge>Approval voting</Badge>}
    </>
  );
}
