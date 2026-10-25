"use client";

// Registration receipts, kept in this browser so a voter can find theirs again. The receipt is
// also offered as a download, since browser storage can be cleared.
import {
  REGISTRAR_ROLE,
  receiptSchema,
  receiptTypedData,
  merkleElectionAbi,
  type Receipt,
} from "@dvote/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import { recoverTypedDataAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";

function storageKey(chainId: number, election: Address, voter: Address): string {
  return `dvote.receipt.${chainId}.${election}.${voter}`.toLowerCase();
}

export function saveReceipt(receipt: Receipt): void {
  try {
    localStorage.setItem(
      storageKey(receipt.chainId, receipt.election, receipt.voter),
      JSON.stringify(receipt),
    );
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage can be unavailable, as in private browsing. The page that registered still shows
    // the receipt and offers it as a download.
  }
}

const CHANGE_EVENT = "dvote-receipts";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** The receipt this browser holds for `voter` in `election`, if any. */
export function useStoredReceipt(
  chainId: number,
  election: Address | undefined,
  voter: Address | undefined,
): Receipt | undefined {
  const key = election && voter ? storageKey(chainId, election, voter) : undefined;
  const raw = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) : null),
    () => null,
  );
  return useMemo(() => {
    if (!raw) return undefined;
    try {
      const parsed = receiptSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }, [raw]);
}

export function downloadReceipt(receipt: Receipt): void {
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `dvote-receipt-${receipt.election.slice(0, 10)}-${receipt.voter.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Checks a receipt in the browser: who signed it, and whether that address is the registrar the
 * election contract names. Nothing here trusts the API.
 */
export function useReceiptCheck(receipt: Receipt | undefined) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["receipt-check", receipt],
    enabled: Boolean(receipt && client),
    queryFn: async () => {
      if (!receipt || !client) throw new Error("Not ready");
      const signer = await recoverTypedDataAddress({
        ...receiptTypedData(receipt),
        signature: receipt.signature,
      });
      const isRegistrar = await client.readContract({
        address: receipt.election,
        abi: merkleElectionAbi,
        functionName: "hasRole",
        args: [REGISTRAR_ROLE, signer],
      });
      return { signer, valid: isRegistrar && signer === receipt.registrar };
    },
  });
}
