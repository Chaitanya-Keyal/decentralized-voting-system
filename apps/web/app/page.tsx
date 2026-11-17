import Link from "next/link";
import { Suspense } from "react";

import { ElectionList } from "@/components/election/election-list";
import { LinkButton, Loading } from "@/components/ui";

export default function Home() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Elections</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Every election here runs on a smart contract, so anyone can check the count.{" "}
            <Link href="/about" className="underline underline-offset-2 hover:decoration-2">
              How it works
            </Link>
          </p>
        </div>
        <LinkButton href="/elections/new">New election</LinkButton>
      </div>
      {/* Phases follow the clock, so the list renders per visit. */}
      <Suspense fallback={<Loading>Loading elections…</Loading>}>
        <ElectionList />
      </Suspense>
    </>
  );
}
