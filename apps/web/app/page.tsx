import Link from "next/link";

import { ElectionList } from "@/components/election-list";

export default function Home() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Elections</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Every election here runs on a smart contract, so anyone can check the count.
          </p>
        </div>
        <Link
          href="/elections/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          New election
        </Link>
      </div>
      <ElectionList />
    </>
  );
}
