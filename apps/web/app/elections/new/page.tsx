import type { Metadata } from "next";
import { Suspense } from "react";

import { CreateElectionForm } from "@/components/election/create-election-form";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "New election" };

export default function NewElectionPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New election</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          The wallet you create the election from becomes its organiser. Only it can change or
          cancel the election, and only before voting opens.
        </p>
      </div>
      {/* The default schedule starts from the current time, so the form renders per visit. */}
      <Suspense fallback={<Loading>Loading…</Loading>}>
        <CreateElectionForm />
      </Suspense>
    </>
  );
}
