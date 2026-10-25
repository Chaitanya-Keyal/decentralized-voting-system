import type { Schedule } from "@/lib/election";
import { formatRelative, formatTime } from "@/lib/time";

const STEPS = [
  ["registrationStart", "Registration opens"],
  ["registrationEnd", "Registration closes and the voter list is published"],
  ["votingStart", "Voting opens"],
  ["votingEnd", "Voting closes and the result can be finalized"],
] as const;

export function Timeline({ schedule, now }: { schedule: Schedule; now: number }) {
  return (
    <ol className="flex flex-col gap-3">
      {STEPS.map(([key, label]) => {
        const passed = schedule[key] <= now;
        return (
          <li key={key} className="flex items-start gap-3 text-sm">
            <span
              aria-hidden
              className={`mt-1 size-2.5 shrink-0 rounded-full ${passed ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
            />
            <div>
              <p className={passed ? "text-zinc-500" : undefined}>{label}</p>
              <p className="text-xs text-zinc-500">
                {formatTime(schedule[key])} · {formatRelative(schedule[key], now)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
