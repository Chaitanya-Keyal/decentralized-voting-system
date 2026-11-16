import type { Metadata } from "next";

import { BenchView } from "@/components/bench-view";

export const metadata: Metadata = { title: "Device benchmark" };

export default function BenchPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Device benchmark</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Times what the booth does on this device for an anonymous ballot: rebuilding the voter
          list&apos;s tree, and making the zero-knowledge proof. Nothing is sent anywhere; the
          results stay on this page until you download them.
        </p>
      </div>
      <BenchView />
    </>
  );
}
