import type { Schedule } from "@/lib/election";
import { formatRelative, formatTime } from "@/lib/time";

const STEPS = [
  ["registrationStart", "Registration opens"],
  ["registrationEnd", "Registration closes and the voter list is published"],
  ["votingStart", "Voting opens"],
  ["votingEnd", "Voting closes and the result can be finalized"],
] as const;

export function Timeline({ schedule, now }: { schedule: Schedule; now: number }) {
  // The first step still to come is the one to watch.
  const next = STEPS.findIndex(([key]) => schedule[key] > now);
  return (
    <ol className="flex flex-col gap-3">
      {STEPS.map(([key, label], index) => {
        const passed = schedule[key] <= now;
        const current = index === next;
        return (
          <li key={key} className="flex items-start gap-3 text-sm">
            <span
              aria-hidden
              className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                passed
                  ? "bg-emerald-500 text-white"
                  : current
                    ? "border-2 border-zinc-900 dark:border-zinc-100"
                    : "border border-zinc-300 dark:border-zinc-700"
              }`}
            >
              {passed ? "✓" : ""}
            </span>
            <div>
              <p
                className={
                  current
                    ? "font-medium"
                    : passed
                      ? "text-zinc-500"
                      : "text-zinc-700 dark:text-zinc-300"
                }
              >
                {label}
              </p>
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
