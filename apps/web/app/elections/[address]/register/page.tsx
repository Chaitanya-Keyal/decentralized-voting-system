import type { Metadata } from "next";
import { Suspense } from "react";

import { RegisterView } from "@/components/register/register-view";
import { Loading } from "@/components/ui";

export const metadata: Metadata = { title: "Register to vote" };

export default function RegisterPage({ params }: PageProps<"/elections/[address]/register">) {
  return (
    <Suspense fallback={<Loading>Loading…</Loading>}>
      {params.then(({ address }) => (
        <RegisterView address={address} />
      ))}
    </Suspense>
  );
}
