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

let organisersOnly = 0;

export function useWalletForOrganisers(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => organisersOnly > 0,
    () => false,
  );
}

/**
 * Labels the header's wallet button as the organisers' while the calling component is on screen,
 * on pages voters also read, where a plain "Connect wallet" suggests voters need one.
 */
export function useMarkWalletForOrganisers(active: boolean) {
  useEffect(() => {
    if (!active) return;
    organisersOnly++;
    listeners.forEach((listener) => listener());
    return () => {
      organisersOnly--;
      listeners.forEach((listener) => listener());
    };
  }, [active]);
}
