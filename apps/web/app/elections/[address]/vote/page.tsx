import type { Metadata } from "next";
import { Suspense } from "react";

import { BoothView } from "@/components/booth-view";

export const metadata: Metadata = { title: "Ballot booth" };

export default function VotePage({ params }: PageProps<"/elections/[address]/vote">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      {params.then(({ address }) => (
        <BoothView address={address} />
      ))}
    </Suspense>
  );
}
