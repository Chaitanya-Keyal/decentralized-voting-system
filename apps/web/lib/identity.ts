"use client";

// A tier 3 voter's identity: a Semaphore secret created on this device, never sent anywhere. Only
// its public commitment goes to the registrar. It is kept in this browser per election, and the
// voter downloads a backup, because without it they cannot vote and nobody can recover it.
import {
  Identity,
  identityReceiptSchema,
  type IdentityReceipt,
  type RelayReceipt,
} from "@dvote/shared";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Address } from "viem";

const CHANGE_EVENT = "dvote-identities";

function storageKey(chainId: number, election: Address): string {
  return `dvote.identity.${chainId}.${election}`.toLowerCase();
}

/** The backup file's contents: the secret, and which election it is for. */
export interface IdentityBackup {
  format: "dvote-identity-v1";
  chainId: number;
  election: Address;
  /** Semaphore's export of the identity's private key, base64. */
  privateKey: string;
}

export function createIdentity(): Identity {
  return new Identity();
}

export function saveIdentity(chainId: number, election: Address, identity: Identity): boolean {
  try {
    localStorage.setItem(storageKey(chainId, election), identity.export());
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    // Storage can be unavailable, as in private browsing; the backup file still works.
    return false;
  }
}

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

/** The identity this browser holds for an election, if any. */
export function useStoredIdentity(chainId: number, election: Address | undefined) {
  const key = election ? storageKey(chainId, election) : undefined;
  const exported = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) : null),
    () => null,
  );
  return useMemo(() => (exported ? Identity.import(exported) : undefined), [exported]);
}

export function downloadIdentityBackup(chainId: number, election: Address, identity: Identity) {
  const backup: IdentityBackup = {
    format: "dvote-identity-v1",
    chainId,
    election,
    privateKey: identity.export(),
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `dvote-voting-key-${election.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Reads a backup file, checking that it is one and that it belongs to this election. */
export function parseIdentityBackup(text: string, chainId: number, election: Address): Identity {
  let backup: Partial<IdentityBackup>;
  try {
    backup = JSON.parse(text) as Partial<IdentityBackup>;
  } catch {
    throw new Error("That file is not a DVote voting key.");
  }
  if (backup.format !== "dvote-identity-v1" || typeof backup.privateKey !== "string") {
    throw new Error("That file is not a DVote voting key.");
  }
  if (backup.chainId !== chainId || backup.election?.toLowerCase() !== election.toLowerCase()) {
    throw new Error("That voting key is for a different election.");
  }
  return Identity.import(backup.privateKey);
}

const receiptKey = (chainId: number, election: Address) =>
  `dvote.identity-receipt.${chainId}.${election}`.toLowerCase();

/** Keeps the registrar's receipt for this browser's identity. */
export function saveIdentityReceipt(receipt: IdentityReceipt): void {
  try {
    localStorage.setItem(receiptKey(receipt.chainId, receipt.election), JSON.stringify(receipt));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // The page that registered still shows it.
  }
}

export function useStoredIdentityReceipt(chainId: number, election: Address | undefined) {
  const key = election ? receiptKey(chainId, election) : undefined;
  const raw = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) : null),
    () => null,
  );
  return useMemo(() => {
    if (!raw) return undefined;
    try {
      const parsed = identityReceiptSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }, [raw]);
}

const ballotKey = (chainId: number, election: Address) =>
  `dvote.anonymous-ballot.${chainId}.${election}`.toLowerCase();

/** What this browser remembers of the ballot it cast, so the voter can find it again. */
export interface CastBallot {
  nullifier: string;
  choice: string;
  txHash?: string;
  relayId?: string;
  relayReceipt?: RelayReceipt;
  /** Whether the chain has counted it. */
  counted?: boolean;
}

export function saveCastBallot(chainId: number, election: Address, ballot: CastBallot): void {
  try {
    localStorage.setItem(ballotKey(chainId, election), JSON.stringify(ballot));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Not essential: the chain records the ballot either way.
  }
}

export function useCastBallot(chainId: number, election: Address | undefined) {
  const key = election ? ballotKey(chainId, election) : undefined;
  const raw = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) : null),
    () => null,
  );
  return useMemo(() => {
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as CastBallot;
    } catch {
      return undefined;
    }
  }, [raw]);
}

const LINK_PREFIX = "#key=";

/**
 * A private link that opens the booth on another device with this voting key. The key travels in
 * the fragment, after `#`, which browsers never send to the server.
 */
export function transferLink(election: Address, identity: Identity): string {
  return `${window.location.origin}/elections/${election}/vote${LINK_PREFIX}${encodeURIComponent(identity.export())}`;
}

/** The key in this page's transfer link, if it has one. Read once, when the page opens. */
function readLinkKey(): string | undefined {
  if (typeof window === "undefined" || !window.location.hash.startsWith(LINK_PREFIX)) {
    return undefined;
  }
  try {
    return decodeURIComponent(window.location.hash.slice(LINK_PREFIX.length));
  } catch {
    // A damaged link carries no usable key.
    return undefined;
  }
}

/**
 * A voting key that arrived in a transfer link, waiting for the voter to accept it. It is taken
 * out of the address bar at once, so it is not left in the history or shared by accident. It
 * never replaces a key this browser already holds, and it is used only once the voter confirms:
 * a link from someone else would otherwise slip that person's key into this browser.
 */
export function useKeyFromLink(chainId: number, election: Address | undefined) {
  const [linked] = useState(readLinkKey);
  const [decided, setDecided] = useState(false);
  const held = useStoredIdentity(chainId, election);
  useEffect(() => {
    if (linked !== undefined) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [linked]);
  const fromLink = useMemo(() => {
    if (linked === undefined) return undefined;
    try {
      return Identity.import(linked);
    } catch {
      return undefined;
    }
  }, [linked]);
  return {
    /** A key from the link, not yet accepted, for a browser that holds none. */
    offered: fromLink && !held && !decided ? fromLink : undefined,
    /** The link carried a different key from the one this browser holds, which was kept. */
    refused: Boolean(fromLink && held && held.commitment !== fromLink.commitment),
    accept: () => {
      if (election && fromLink) saveIdentity(chainId, election, fromLink);
      setDecided(true);
    },
    dismiss: () => setDecided(true),
  };
}
