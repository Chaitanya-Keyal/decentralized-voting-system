import type { Metadata } from "next";
import { Suspense } from "react";

import { CreateElectionForm } from "@/components/create-election-form";

export const metadata: Metadata = { title: "New election" };

export default function NewElectionPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New election</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          The wallet that creates the election becomes its authority. It can change the details and
          schedule until registration is due to open, and the candidates until voting is due to
          open. It can cancel the election until voting opens.
        </p>
      </div>
      {/* The default schedule starts from the current time, so the form renders per visit. */}
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <CreateElectionForm />
      </Suspense>
    </>
  );
}
