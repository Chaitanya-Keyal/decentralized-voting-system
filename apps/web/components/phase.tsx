import { Phase, phaseName, CountingRule } from "@dvote/shared";

import { Badge } from "./ui";

/** What to call the phase now: the clock moves an election on before anyone records it. */
export function phaseLabel(
  phase: number,
  window?: { registrationStart: number; registrationEnd: number; votingEnd: number },
  now?: number,
): { label: string; tone: "neutral" | "live" | "done" | "muted" } {
  if (window && now !== undefined) {
    const beforeVoting = phase === Phase.Created || phase === Phase.Registration;
    if (phase === Phase.Created && now < window.registrationStart) {
      return { label: "Upcoming", tone: "neutral" };
    }
    if (beforeVoting && now < window.registrationEnd) {
      return { label: "Registration open", tone: "live" };
    }
    if (beforeVoting) return { label: "Registration closed", tone: "neutral" };
    if (phase === Phase.Voting && now >= window.votingEnd) {
      return { label: "Voting ended", tone: "neutral" };
    }
  }
  const tone =
    phase === Phase.Voting
      ? "live"
      : phase === Phase.Finalized
        ? "done"
        : phase === Phase.Cancelled
          ? "muted"
          : "neutral";
  return { label: phase === Phase.Voting ? "Voting open" : phaseName(phase), tone };
}

export function PhaseBadge({
  phase,
  window,
  now,
}: {
  phase: number;
  window?: { registrationStart: number; registrationEnd: number; votingEnd: number };
  now?: number;
}) {
  const { label, tone } = phaseLabel(phase, window, now);
  return <Badge tone={tone}>{label}</Badge>;
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
