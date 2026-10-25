"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useAccount, useSwitchChain } from "wagmi";

import { chain } from "@/lib/env";
import { describeError } from "@/lib/errors";

import { Button } from "./ui";

/** Shown while the connected wallet is on another network, where nothing DVote sends can go. */
function WrongNetwork() {
  const { address, chainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();
  if (!address || chainId === chain.id) return null;
  return (
    <div
      role="alert"
      className="border-t border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-sm">
        <span>
          Your wallet is on another network. DVote runs on {chain.name}, so switch to it before
          sending anything.{error && ` ${describeError(error)}`}
        </span>
        <Button
          variant="secondary"
          disabled={isPending}
          onClick={() => switchChain({ chainId: chain.id })}
        >
          Switch to {chain.name}
        </Button>
      </div>
    </div>
  );
}

export function Header() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="text-base font-semibold tracking-tight">
            DVote
          </Link>
          <Link
            href="/"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Elections
          </Link>
          <Link
            href="/elections/new"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            New election
          </Link>
        </nav>
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      </div>
      <WrongNetwork />
    </header>
  );
}
