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
import { chain, isLocalChain } from "@/lib/env";
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

import { Button, Card, Field, Input, Mono, Notice, Spinner } from "./ui";

/**
 * Tier 3's voting key: a secret this browser creates and keeps. It is what proves, later, that the
 * ballot comes from someone on the list without saying who.
 */
export function VotingKeyCard({ election }: { election: OnchainElection }) {
  const identity = useStoredIdentity(chain.id, election.address);
  const [problem, setProblem] = useState<string>();

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
      description="This election's ballots are anonymous. Your browser makes a secret voting key; only a fingerprint of it goes to the registrar, so nobody, the registrar included, can tell which ballot is yours."
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
              <Button onClick={create}>Create my voting key</Button>
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium dark:border-zinc-700">
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
              Creating the key also downloads a backup. Without the key you cannot vote, and nobody
              can recover it for you.
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
  const apiConfig = useQuery({ queryKey: ["api-config"], queryFn: api.config });
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  if (!identity) return null;

  async function run(task: () => Promise<void>) {
    setProblem(undefined);
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setProblem(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    run(async () => {
      const address = email.trim().toLowerCase();
      await api.requestCode(election.address, address);
      setSentTo(address);
      setCode("");
    });

  const register = () =>
    run(async () => {
      if (!sentTo) return;
      const commitment = identity.commitment.toString();
      const receipt = await api.registerIdentity(election.address, {
        email: sentTo,
        code: code.trim(),
        commitment,
      });
      const matches =
        receipt.chainId === chain.id &&
        isAddressEqual(receipt.election, election.address) &&
        receipt.commitment === commitment;
      if (!matches) {
        throw new Error("The registrar's receipt is for a different key or election.");
      }
      saveIdentityReceipt(receipt);
    });

  return (
    <Card
      title="Register your voting key"
      description={`Registration closes ${formatTime(election.schedule.registrationEnd)}. Your email address stays with the registrar and is never put on-chain. No wallet is needed.`}
    >
      <div className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendCode();
          }}
        >
          <Field
            label="Institute email address"
            hint={
              apiConfig.data
                ? `Only @${apiConfig.data.emailDomain} addresses can register.`
                : undefined
            }
          >
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={`f20230001@${apiConfig.data?.emailDomain ?? "hyderabad.bits-pilani.ac.in"}`}
              autoComplete="email"
              required
            />
          </Field>
          <div>
            <Button type="submit" variant={sentTo ? "secondary" : "primary"} disabled={busy}>
              {sentTo ? "Send a new code" : "Send me a code"}
            </Button>
          </div>
        </form>

        {sentTo && (
          <form
            className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800"
            onSubmit={(event) => {
              event.preventDefault();
              void register();
            }}
          >
            <p className="text-sm">
              We sent a six-digit code to <strong>{sentTo}</strong>. It works for ten minutes.
              {isLocalChain && (
                <>
                  {" "}
                  Locally, the email lands in{" "}
                  <a
                    href="http://127.0.0.1:8025"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Mailpit
                  </a>
                  .
                </>
              )}
            </p>
            <Field label="Code">
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                autoComplete="one-time-code"
                required
              />
            </Field>
            <div>
              <Button type="submit" disabled={busy}>
                {busy && <Spinner />} Register my voting key
              </Button>
            </div>
          </form>
        )}

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
    <Card
      title="Your registration receipt"
      description="Keep a copy. If your key's fingerprint is missing from the published list, the receipt shows that the registrar accepted it."
    >
      <div className="flex flex-col gap-3 text-sm">
        <p>
          Voting key <Mono value={receipt.commitment} /> was registered on{" "}
          {formatTime(receipt.issuedAt)}.
        </p>
        {valid === true && (
          <Notice tone="success">
            The receipt is signed by this election&apos;s registrar, as recorded in the contract.
          </Notice>
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
    </Card>
  );
}
