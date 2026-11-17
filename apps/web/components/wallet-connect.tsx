"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { isLocalChain } from "@/lib/env";

import { Button } from "./ui";

/**
 * Whether this browser has a wallet to connect: an extension such as MetaMask, or a wallet app's
 * own browser. Wallets add theirs before the page's scripts run, so one read is enough. A local
 * chain always has its development wallets.
 */
function useHasWallet(): boolean {
  const injected = useSyncExternalStore(
    () => () => undefined,
    () => "ethereum" in window && window.ethereum !== undefined,
    () => true,
  );
  return injected || isLocalChain;
}

function NoWalletNote() {
  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-400">
      This browser has no wallet. Open this page on a computer with a wallet extension such as
      MetaMask, or in the browser inside a wallet app on your phone.
    </p>
  );
}

/** A card's "Connect wallet": opens the wallet dialog, or says where to find a wallet. */
export function ConnectWallet() {
  const hasWallet = useHasWallet();
  const { openConnectModal } = useConnectModal();
  if (!hasWallet) return <NoWalletNote />;
  return (
    <div>
      <Button onClick={openConnectModal}>Connect wallet</Button>
    </div>
  );
}

/**
 * The header's "Connect wallet". Without a wallet in this browser it explains instead of opening
 * a wallet dialog with nothing in it that works.
 */
export function HeaderConnectButton({ label, className }: { label: ReactNode; className: string }) {
  const hasWallet = useHasWallet();
  const { openConnectModal } = useConnectModal();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    element.showModal();
    // Browsers without `closedby` (Safari) close on a tap outside the box here instead.
    if ("closedBy" in HTMLDialogElement.prototype) return;
    const onClick = (event: MouseEvent) => {
      if (event.target !== element) return;
      const box = element.getBoundingClientRect();
      const inside =
        box.top <= event.clientY &&
        event.clientY <= box.bottom &&
        box.left <= event.clientX &&
        event.clientX <= box.right;
      if (!inside) element.close();
    };
    element.addEventListener("click", onClick);
    return () => element.removeEventListener("click", onClick);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => (hasWallet ? openConnectModal?.() : setOpen(true))}
      >
        {label}
      </button>
      {open && (
        <dialog
          ref={dialog}
          {...({ closedby: "any" } as object)}
          aria-labelledby="no-wallet-title"
          onClose={() => setOpen(false)}
          className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-xl border border-zinc-200 bg-white p-5 text-zinc-900 backdrop:bg-black/50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        >
          <div className="flex flex-col gap-3">
            <h2 id="no-wallet-title" className="text-base font-semibold">
              No wallet in this browser
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Only organisers need a wallet, to create and run elections. To vote in an anonymous
              election you need none.
            </p>
            <NoWalletNote />
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => dialog.current?.close()}>
                Close
              </Button>
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
