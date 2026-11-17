"use client";

// Form parts shared by creating an election and by the authority's edits.
import { manifestoSchema } from "@dvote/shared";

import { api } from "@/lib/api";
import type { Schedule } from "@/lib/election";
import { fetchFromIpfs } from "@/lib/ipfs";
import { fromLocalInput, toLocalInput } from "@/lib/time";

import { Button, Field, Input, Notice, Textarea } from "../ui";

export interface CandidateDraft {
  name: string;
  manifesto: string;
  /**
   * The manifesto's address when it could not be downloaded. Saving keeps it, rather than erasing
   * the manifesto, until a new one is typed.
   */
  unloadedCid?: string;
}

export type ScheduleDraft = Record<keyof Schedule, string>;

const SCHEDULE_FIELDS = [
  ["registrationStart", "Registration opens"],
  ["registrationEnd", "Registration closes"],
  ["votingStart", "Voting opens"],
  ["votingEnd", "Voting closes"],
] as const;

export function scheduleDraft(schedule: Schedule): ScheduleDraft {
  return {
    registrationStart: toLocalInput(schedule.registrationStart),
    registrationEnd: toLocalInput(schedule.registrationEnd),
    votingStart: toLocalInput(schedule.votingStart),
    votingEnd: toLocalInput(schedule.votingEnd),
  };
}

/** The schedule as the contract takes it, or a reason it is not valid. */
export function parseSchedule(
  draft: ScheduleDraft,
): { schedule: Record<keyof Schedule, bigint> } | { problem: string } {
  const times = SCHEDULE_FIELDS.map(([key]) => fromLocalInput(draft[key]));
  if (times.some(Number.isNaN)) return { problem: "Fill in all four times." };
  if (times.some((time, i) => i > 0 && time <= (times[i - 1] ?? 0))) {
    return {
      problem: "The times must run in order: registration opens, closes, voting opens, closes.",
    };
  }
  const [registrationStart, registrationEnd, votingStart, votingEnd] = times.map(BigInt);
  return {
    schedule: {
      registrationStart: registrationStart ?? 0n,
      registrationEnd: registrationEnd ?? 0n,
      votingStart: votingStart ?? 0n,
      votingEnd: votingEnd ?? 0n,
    },
  };
}

export function ScheduleEditor({
  value,
  onChange,
}: {
  value: ScheduleDraft;
  onChange: (value: ScheduleDraft) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SCHEDULE_FIELDS.map(([key, label]) => (
        <Field key={key} label={label}>
          <Input
            type="datetime-local"
            value={value[key]}
            onChange={(event) => onChange({ ...value, [key]: event.target.value })}
          />
        </Field>
      ))}
    </div>
  );
}

export function CandidatesEditor({
  value,
  onChange,
}: {
  value: CandidateDraft[];
  onChange: (value: CandidateDraft[]) => void;
}) {
  const update = (index: number, change: Partial<CandidateDraft>) =>
    onChange(value.map((candidate, i) => (i === index ? { ...candidate, ...change } : candidate)));

  return (
    <div className="flex flex-col gap-4">
      <ol role="list" className="flex flex-col gap-4">
        {value.map((candidate, index) => (
          <li
            key={index}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div className="flex items-center gap-2">
              <Input
                value={candidate.name}
                onChange={(event) => update(index, { name: event.target.value })}
                placeholder={`Candidate ${index + 1}`}
                maxLength={200}
                aria-label={`Name of candidate ${index + 1}`}
              />
              <Button
                variant="secondary"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                disabled={value.length <= 1}
                aria-label={`Remove candidate ${index + 1}`}
              >
                Remove
              </Button>
            </div>
            <Textarea
              value={candidate.manifesto}
              onChange={(event) =>
                update(index, { manifesto: event.target.value, unloadedCid: undefined })
              }
              placeholder="Manifesto (optional, saved to IPFS)"
              rows={2}
              className="min-h-14"
              maxLength={20_000}
              aria-label={`Manifesto of candidate ${index + 1}`}
            />
            {candidate.unloadedCid && (
              <Notice tone="warning">
                This manifesto could not be downloaded from IPFS. Saving keeps it as it is, unless
                you type a new one.
              </Notice>
            )}
          </li>
        ))}
      </ol>
      <div>
        <Button
          variant="secondary"
          onClick={() => onChange([...value, { name: "", manifesto: "" }])}
          disabled={value.length >= 64}
        >
          Add a candidate
        </Button>
      </div>
    </div>
  );
}

export function candidatesProblem(candidates: CandidateDraft[]): string | undefined {
  if (candidates.length === 0 || candidates.some((candidate) => !candidate.name.trim())) {
    return "Every candidate needs a name.";
  }
  return undefined;
}

/**
 * Saves each manifesto to IPFS and returns the candidates as the contract takes them. IPFS
 * addresses come from the content, so saving an unchanged manifesto again gives the same address.
 */
export function pinCandidates(candidates: CandidateDraft[]) {
  return Promise.all(
    candidates.map(async ({ name, manifesto, unloadedCid }) => ({
      name: name.trim(),
      manifestoCid:
        unloadedCid ??
        (manifesto.trim()
          ? (
              await api.pin({
                format: "dvote-manifesto-v1",
                candidate: name.trim(),
                text: manifesto.trim(),
              })
            ).cid
          : ""),
    })),
  );
}

/** Saves the ballot description to IPFS, or returns an empty address if there is none. */
export async function pinDescription(description: string): Promise<string> {
  return description.trim()
    ? (await api.pin({ format: "dvote-election-v1", description: description.trim() })).cid
    : "";
}

/**
 * The candidates as drafts, with their manifestos downloaded from IPFS. A manifesto that cannot
 * be downloaded is marked as such, so that saving does not erase it.
 */
export function candidateDrafts(candidates: { name: string; manifestoCid: string }[]) {
  return Promise.all(
    candidates.map(async ({ name, manifestoCid }): Promise<CandidateDraft> => {
      if (!manifestoCid) return { name, manifesto: "" };
      try {
        return { name, manifesto: (await fetchFromIpfs(manifestoSchema, manifestoCid)).text };
      } catch {
        return { name, manifesto: "", unloadedCid: manifestoCid };
      }
    }),
  );
}
