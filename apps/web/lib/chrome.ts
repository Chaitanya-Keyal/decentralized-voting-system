"use client";

// Page-level choices about the app's frame. Voter pages of anonymous elections hide the header's
// wallet button: those voters need no wallet, and a "Connect wallet" button suggests they do.
import { useEffect, useSyncExternalStore } from "react";

let walletHidden = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWalletHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => walletHidden > 0,
    () => false,
  );
}

/** Hides the header's wallet button while the calling component is on screen. */
export function useHideWallet() {
  useEffect(() => {
    walletHidden++;
    listeners.forEach((listener) => listener());
    return () => {
      walletHidden--;
      listeners.forEach((listener) => listener());
    };
  }, []);
}
