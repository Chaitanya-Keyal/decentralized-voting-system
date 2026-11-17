"use client";

// Registration receipts, kept in this browser so a voter can find theirs again. The receipt is
// also offered as a download, since browser storage can be cleared.
import {
  identityReceiptTypedData,
  merkleElectionAbi,
  receiptSchema,
  receiptTypedData,
  REGISTRAR_ROLE,
  type IdentityReceipt,
  type Receipt,
} from "@dvote/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import { isAddressEqual, recoverTypedDataAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";

import { downloadFile } from "./download";

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

/** Offers a receipt, for a wallet (tier 2) or a voting key (tier 3), as a download. */
export function downloadReceipt(receipt: Receipt | IdentityReceipt): void {
  const voter = "voter" in receipt ? `-${receipt.voter.slice(0, 10)}` : "";
  downloadFile(
    `dvote-receipt-${receipt.election.slice(0, 10)}${voter}.json`,
    JSON.stringify(receipt, null, 2),
    "application/json",
  );
}

/**
 * Checks a receipt in the browser: who signed it, and whether that address is the registrar the
 * election contract names. Nothing here trusts the API.
 */
export function useReceiptCheck(receipt: Receipt | IdentityReceipt | undefined) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["receipt-check", receipt],
    enabled: Boolean(receipt && client),
    queryFn: async () => {
      if (!receipt || !client) throw new Error("Not ready");
      const { signature } = receipt;
      const signer = await ("voter" in receipt
        ? recoverTypedDataAddress({ ...receiptTypedData(receipt), signature })
        : recoverTypedDataAddress({ ...identityReceiptTypedData(receipt), signature }));
      const isRegistrar = await client.readContract({
        address: receipt.election,
        abi: merkleElectionAbi,
        functionName: "hasRole",
        args: [REGISTRAR_ROLE, signer],
      });
      return { signer, valid: isRegistrar && isAddressEqual(signer, receipt.registrar) };
    },
  });
}
