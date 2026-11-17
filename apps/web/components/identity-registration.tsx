"use client";

import {
  identityReceiptTypedData,
  merkleElectionAbi,
  REGISTRAR_ROLE,
  type IdentityReceipt,
} from "@dvote/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAddressEqual, recoverTypedDataAddress } from "viem";
import { usePublicClient } from "wagmi";

import { api } from "@/lib/api";
import type { OnchainElection } from "@/lib/election";
import { chain } from "@/lib/env";
import { describeError } from "@/lib/errors";
import {
  createIdentity,
  downloadIdentityBackup,
  parseIdentityBackup,
  saveIdentity,
  saveIdentityReceipt,
  useStoredIdentity,
} from "@/lib/identity";
import { formatTime } from "@/lib/time";

import { EmailProof, type EmailProofValue } from "./email-proof";
import { Button, Card, Mono, Notice } from "./ui";

/**
 * Tier 3's voting key: a secret this browser creates and keeps. It is what proves, later, that the
 * ballot comes from someone on the list without saying who.
 */
export function VotingKeyCard({
  election,
  restoreOnly = false,
  compact = false,
}: {
  election: OnchainElection;
  /** In the booth a new key would not be on the published list, so only restoring makes sense. */
  restoreOnly?: boolean;
  /** Once registered, one line is enough: the key is here, and its backup is a click away. */
  compact?: boolean;
}) {
  const identity = useStoredIdentity(chain.id, election.address);
  const [problem, setProblem] = useState<string>();

  if (compact && identity) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Your voting key is in this browser.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => downloadIdentityBackup(chain.id, election.address, identity)}
        >
          Download a backup
        </button>{" "}
        to vote from another device; keep it private.
      </p>
    );
  }

  const create = () => {
    const fresh = createIdentity();
    saveIdentity(chain.id, election.address, fresh);
    // Downloaded straight away: without it, a cleared browser means the voter cannot vote.
    downloadIdentityBackup(chain.id, election.address, fresh);
  };

  const restore = async (file: File | undefined) => {
    setProblem(undefined);
    if (!file) return;
    try {
      const restored = parseIdentityBackup(await file.text(), chain.id, election.address);
      saveIdentity(chain.id, election.address, restored);
    } catch (error) {
      setProblem(describeError(error));
    }
  };

  return (
    <Card
      title="Your voting key"
      description={
        restoreOnly
          ? undefined
          : "Votes here are anonymous. Your browser makes a voting key that only you hold. The registrar sees your email and a public code made from the key; when you vote, your browser proves the ballot comes from one of the registered codes without saying which. So nobody, the registrar included, can tell which ballot is yours."
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {identity ? (
          <>
            <Notice tone="success">
              This browser holds your voting key. Its public fingerprint is{" "}
              <Mono value={identity.commitment.toString()} />.
            </Notice>
            <div>
              <Button
                variant="secondary"
                onClick={() => downloadIdentityBackup(chain.id, election.address, identity)}
              >
                Download a backup of the key
              </Button>
            </div>
            <p className="text-zinc-500">
              Keep the backup private: anyone holding it can cast your ballot. To vote from another
              device, restore it there.
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              {!restoreOnly && <Button onClick={create}>Create my voting key</Button>}
              <label
                className={
                  restoreOnly
                    ? "inline-flex cursor-pointer items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white focus-within:ring-2 focus-within:ring-zinc-400 hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                    : "inline-flex cursor-pointer items-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-zinc-400 dark:border-zinc-700"
                }
              >
                Restore from a backup
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(event) => void restore(event.target.files?.[0])}
                />
              </label>
            </div>
            <p className="text-zinc-500">
              {restoreOnly
                ? "Use the backup file you downloaded when you registered."
                : "Creating the key also downloads a backup. Without the key you cannot vote, and nobody can recover it for you."}
            </p>
          </>
        )}
        {problem && <Notice tone="error">{problem}</Notice>}
      </div>
    </Card>
  );
}

/** Registers this browser's voting key once the voter proves their institute email address. */
export function IdentityRegistrationForm({ election }: { election: OnchainElection }) {
  const identity = useStoredIdentity(chain.id, election.address);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  if (!identity) return null;

  const register = async (proof: EmailProofValue) => {
    setProblem(undefined);
    setBusy(true);
    try {
      const commitment = identity.commitment.toString();
      const receipt = await api.registerIdentity(election.address, { ...proof, commitment });
      const matches =
        receipt.chainId === chain.id &&
        isAddressEqual(receipt.election, election.address) &&
        receipt.commitment === commitment;
      if (!matches) {
        throw new Error("The registrar's receipt is for a different key or election.");
      }
      saveIdentityReceipt(receipt);
    } catch (error) {
      setProblem(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Register your voting key"
      description={`Registration closes ${formatTime(election.schedule.registrationEnd)}. Your email address stays with the registrar and is never put on-chain. No wallet is needed.`}
    >
      <div className="flex flex-col gap-4">
        <EmailProof
          election={election}
          subject={identity.commitment.toString()}
          submitLabel="Register my voting key"
          busy={busy}
          onSubmit={(proof) => void register(proof)}
        />
        {problem && <Notice tone="error">{problem}</Notice>}
      </div>
    </Card>
  );
}

/** The registrar's receipt for a voting key, checked against the election's registrar. */
export function IdentityReceiptCard({ receipt }: { receipt: IdentityReceipt }) {
  const client = usePublicClient();
  const check = useQuery({
    queryKey: ["identity-receipt-check", receipt],
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) throw new Error("Not ready");
      const signer = await recoverTypedDataAddress({
        ...identityReceiptTypedData(receipt),
        signature: receipt.signature,
      });
      const isRegistrar = await client.readContract({
        address: receipt.election,
        abi: merkleElectionAbi,
        functionName: "hasRole",
        args: [REGISTRAR_ROLE, signer],
      });
      return isRegistrar && isAddressEqual(signer, receipt.registrar);
    },
  });
  const download = () => {
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `dvote-receipt-${receipt.election.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const valid = check.data;
  return (
    <details className="rounded-xl border border-zinc-200 px-5 py-4 text-sm dark:border-zinc-800">
      <summary className="cursor-pointer font-medium">Proof of registration</summary>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Optional. If your voting key were missing from the published list, this receipt would show
        that the registrar accepted it. It names your key&apos;s public code, not your ballot.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <p>
          Voting key <Mono value={receipt.commitment} /> was registered on{" "}
          {formatTime(receipt.issuedAt)}.
        </p>
        {valid === true && (
          <p className="text-zinc-600 dark:text-zinc-400">
            ✓ The receipt is signed by this election&apos;s registrar, as recorded in the contract.
          </p>
        )}
        {valid === false && (
          <Notice tone="error">This receipt is not signed by the election&apos;s registrar.</Notice>
        )}
        <div>
          <Button variant="secondary" onClick={download}>
            Download the receipt
          </Button>
        </div>
      </div>
    </details>
  );
}
