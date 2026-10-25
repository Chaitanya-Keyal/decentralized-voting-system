import type { Metadata } from "next";
import { Suspense } from "react";

import { RegisterView } from "@/components/register-view";

export const metadata: Metadata = { title: "Register to vote" };

export default function RegisterPage({ params }: PageProps<"/elections/[address]/register">) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      {params.then(({ address }) => (
        <RegisterView address={address} />
      ))}
    </Suspense>
  );
}
