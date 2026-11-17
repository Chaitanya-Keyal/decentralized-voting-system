import type { Metadata } from "next";
import { Suspense } from "react";

import { ElectionView } from "@/components/election/election-view";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Election" };

export default function ElectionPage({ params }: PageProps<"/elections/[address]">) {
  return (
    <Suspense fallback={<Loading>Loading…</Loading>}>
      {params.then(({ address }) => (
        <ElectionView address={address} />
      ))}
    </Suspense>
  );
}
