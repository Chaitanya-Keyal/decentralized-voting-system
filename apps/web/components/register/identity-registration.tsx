"use client";

import type { IdentityReceipt } from "@dvote/shared";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { isAddressEqual } from "viem";

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
import { downloadReceipt, useReceiptCheck } from "@/lib/receipts";
import { formatTime } from "@/lib/time";

import { Button, buttonClass, Card, Disclosure, Mono, muted, Notice, TextButton } from "../ui";
import { EmailProof, type EmailProofValue } from "./email-proof";

/** What each party can see, for voters who want to know why their ballot stays secret. */
function SecrecyNote() {
  return (
    <Disclosure summary="How is my vote kept secret?">
      <p>
        The registrar sees your email and a public code made from your voting key. That is how it
        knows who may vote.
      </p>
      <p>
        When you vote, your browser proves that the ballot comes from one of the registered codes,
        without saying which one. So the registrar, the people running this site and anyone reading
        the blockchain can see the ballot, but none of them can tell it is yours.
      </p>
      <p>
        Your ballot is hidden among everyone on the voter list, so the more people register, the
        better hidden it is.
      </p>
    </Disclosure>
  );
}

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
        <TextButton onClick={() => downloadIdentityBackup(chain.id, election.address, identity)}>
          Download a backup
        </TextButton>{" "}
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
    <Card title="Your voting key">
      <div className="flex flex-col gap-3 text-sm">
        {!restoreOnly && !identity && (
          <>
            <ol className="flex list-decimal flex-col gap-1 pl-5">
              <li>Create your voting key. It stays in this browser.</li>
              <li>Confirm your institute email address.</li>
              <li>Come back when voting opens, and vote.</li>
            </ol>
            <p className="text-zinc-600 dark:text-zinc-400">
              It is free: no wallet, no cryptocurrency and no fees.
            </p>
            <SecrecyNote />
          </>
        )}
        {identity ? (
          <>
            <Notice tone="success">This browser holds your voting key.</Notice>
            <p className="text-zinc-600 dark:text-zinc-400">
              A spare copy was saved to your downloads. You need it only if you vote from another
              device or clear this browser&apos;s data. Keep it private: anyone holding it can cast
              your ballot.{" "}
              <TextButton
                onClick={() => downloadIdentityBackup(chain.id, election.address, identity)}
              >
                Save it again
              </TextButton>
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-3">
              {!restoreOnly && <Button onClick={create}>Create my voting key</Button>}
              <label
                className={`${buttonClass({ variant: restoreOnly ? "primary" : "secondary" })} cursor-pointer focus-within:ring-2 focus-within:ring-zinc-400`}
              >
                {restoreOnly ? "Choose my key file" : "I already have a key file"}
                <input
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(event) => void restore(event.target.files?.[0])}
                />
              </label>
            </div>
            <p className={muted}>
              {restoreOnly
                ? "Use the backup file you downloaded when you registered."
                : "Creating the key also saves a spare copy to your downloads."}
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
  const check = useReceiptCheck(receipt);
  const valid = check.data?.valid;
  return (
    <Disclosure card summary="Proof of registration">
      <p>
        Optional. If your voting key were missing from the published list, this receipt would show
        that the registrar accepted it. It names your key&apos;s public code, not your ballot.
      </p>
      <p className="text-zinc-900 dark:text-zinc-100">
        Voting key <Mono value={receipt.commitment} /> was registered on{" "}
        {formatTime(receipt.issuedAt)}.
      </p>
      {valid === true && (
        <p className="flex items-start gap-2">
          <ShieldCheck
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          The receipt is signed by this election&apos;s registrar, as recorded in the contract.
        </p>
      )}
      {valid === false && (
        <Notice tone="error">This receipt is not signed by the election&apos;s registrar.</Notice>
      )}
      <div>
        <Button variant="secondary" onClick={() => downloadReceipt(receipt)}>
          Download the receipt
        </Button>
      </div>
    </Disclosure>
  );
}
