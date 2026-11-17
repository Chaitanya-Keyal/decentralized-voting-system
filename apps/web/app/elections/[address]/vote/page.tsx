import type { Metadata } from "next";
import { Suspense } from "react";

import { BoothView } from "@/components/booth/booth-view";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Ballot booth" };

export default function VotePage({ params }: PageProps<"/elections/[address]/vote">) {
  return (
    <Suspense fallback={<Loading>Loading…</Loading>}>
      {params.then(({ address }) => (
        <BoothView address={address} />
      ))}
    </Suspense>
  );
}
