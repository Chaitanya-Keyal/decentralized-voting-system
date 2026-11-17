"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { useAccount, useSwitchChain } from "wagmi";

import { chain } from "@/lib/env";
import { describeError } from "@/lib/errors";
import { useWalletForOrganisers, useWalletHidden } from "@/lib/header-wallet";

import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui";
import { HeaderConnectButton } from "./wallet-connect";

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

/**
 * The wallet button, in the app's own style: small, and quiet, since anonymous elections need no
 * wallet at all. RainbowKit still provides the dialogs behind it.
 */
function WalletButton() {
  const hidden = useWalletHidden();
  const forOrganisers = useWalletForOrganisers();
  return (
    <ConnectButton.Custom>
      {({ account, chain: connected, mounted, openAccountModal }) => {
        const ready = mounted;
        const shown = ready && account && connected;
        // Voters in anonymous elections need no wallet; an organiser who is connected still sees it.
        if (hidden && !shown) return null;
        return (
          <div aria-hidden={!ready} className={ready ? undefined : "pointer-events-none opacity-0"}>
            {shown ? (
              <button
                type="button"
                onClick={openAccountModal}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 font-mono text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
                {account.displayName}
              </button>
            ) : (
              <HeaderConnectButton
                label={
                  <>
                    Connect wallet
                    {/* On a phone the dialog says who needs one; the hint would wrap the button. */}
                    {forOrganisers && <span className="hidden sm:inline"> (organisers)</span>}
                  </>
                }
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium whitespace-nowrap text-zinc-800 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              />
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

export function Header() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <nav aria-label="Main" className="flex items-center gap-4 text-sm sm:gap-5">
          {/* The home page is the list of elections, where an organiser also starts a new one. */}
          <Link href="/" className="text-base font-semibold tracking-tight">
            DVote
          </Link>
          <Link
            href="/about"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            How it works
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <WalletButton />
        </div>
      </div>
      <WrongNetwork />
    </header>
  );
}
