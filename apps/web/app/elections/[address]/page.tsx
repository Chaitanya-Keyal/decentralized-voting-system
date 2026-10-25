import type { Metadata } from "next";
import { Suspense } from "react";

import { ElectionView } from "@/components/election-view";

export const metadata: Metadata = { title: "Election" };

export default function ElectionPage({ params }: PageProps<"/elections/[address]">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      {params.then(({ address }) => (
        <ElectionView address={address} />
      ))}
    </Suspense>
  );
}
