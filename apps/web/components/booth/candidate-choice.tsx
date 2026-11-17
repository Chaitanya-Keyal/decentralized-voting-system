"use client";

import { approvalChoice, CountingRule } from "@dvote/shared";

import type { OnchainElection } from "@/lib/election";

import { choiceCard } from "../ui";

/** The candidates marked on a ballot. Plurality: one index. Approval: any non-empty set. */
export type Marks = ReadonlySet<number>;

/** The `choice` the contract takes for these marks, or undefined if the ballot is not complete. */
export function choiceFor(election: OnchainElection, marks: Marks): bigint | undefined {
  if (marks.size === 0) return undefined;
  if (election.countingRule === CountingRule.Approval) return approvalChoice(marks);
  return marks.size === 1 ? BigInt([...marks][0]!) : undefined;
}

/** Radio buttons under plurality, checkboxes under approval. */
export function CandidateChoice({
  election,
  marks,
  onChange,
}: {
  election: OnchainElection;
  marks: Marks;
  onChange: (marks: Marks) => void;
}) {
  const approval = election.countingRule === CountingRule.Approval;
  const toggle = (index: number) => {
    if (!approval) return onChange(new Set([index]));
    const next = new Set(marks);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm text-zinc-600 dark:text-zinc-400">
        {approval
          ? "Approval voting: tick every candidate you approve of. Each one you tick gets a vote."
          : "Choose one candidate."}
      </legend>
      {election.candidates.map((candidate, index) => (
        <label key={index} className={`${choiceCard} items-center has-[:checked]:font-medium`}>
          <input
            type={approval ? "checkbox" : "radio"}
            className="size-5"
            name="candidate"
            value={index}
            checked={marks.has(index)}
            onChange={() => toggle(index)}
          />
          {candidate.name}
        </label>
      ))}
    </fieldset>
  );
}
