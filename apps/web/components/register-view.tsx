"use client";

import { Phase, registrationTypedData, type Receipt } from "@dvote/shared";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getAddress, isAddress, isAddressEqual } from "viem";
import { useAccount, useConfig } from "wagmi";
import { signTypedData } from "wagmi/actions";

import { api } from "@/lib/api";
import { useElection, type OnchainElection } from "@/lib/election";
import { chain, isLocalChain } from "@/lib/env";
import { describeError } from "@/lib/errors";
import { saveReceipt, useStoredReceipt } from "@/lib/receipts";
import { formatRelative, formatTime, useChainNow } from "@/lib/time";
import { useWallet } from "@/lib/wallet";

import { ElectionHeader } from "./election-header";
import { ListCheck } from "./list-check";
import { ReceiptCard } from "./receipt-card";
import { Button, Card, Field, Input, Notice, Spinner } from "./ui";

function registrationOpen(election: OnchainElection, now: number): boolean {
  return (
    (election.phase === Phase.Created || election.phase === Phase.Registration) &&
    election.voterListCid === "" &&
    now >= election.schedule.registrationStart &&
    now < election.schedule.registrationEnd
  );
}

function RegistrationForm({
  election,
  onRegistered,
}: {
  election: OnchainElection;
  onRegistered: (receipt: Receipt) => void;
}) {
  const config = useConfig();
  const { account, ready, blocker } = useWallet();
  const apiConfig = useQuery({ queryKey: ["api-config"], queryFn: api.config });
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

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
      if (!account || !sentTo) return;
      // The wallet signs the email address it is being registered with; this costs nothing.
      const signature = await signTypedData(config, {
        account,
        ...registrationTypedData({
          chainId: chain.id,
          election: election.address,
          voter: account,
          email: sentTo,
        }),
      });
      const receipt = await api.register(election.address, {
        email: sentTo,
        code: code.trim(),
        voter: account,
        signature,
      });
      const matches =
        receipt.chainId === chain.id &&
        isAddressEqual(receipt.election, election.address) &&
        isAddressEqual(receipt.voter, account);
      if (!matches) {
        throw new Error("The registrar's receipt is for a different wallet or election.");
      }
      // Shown from here, so a browser that cannot store it still shows it and offers it as a file.
      onRegistered(receipt);
      saveReceipt(receipt);
    });

  if (!account) {
    return (
      <Card
        title="Connect your wallet"
        description="Connect the wallet you will vote with. Registering costs nothing."
      >
        <ConnectButton />
      </Card>
    );
  }

  return (
    <Card
      title="Register this wallet"
      description={`Registration closes ${formatTime(election.schedule.registrationEnd)}. Your email address stays with the registrar and is never put on-chain.`}
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
              <Button type="submit" disabled={busy || !ready} title={blocker}>
                {busy && <Spinner />} Sign with my wallet and register
              </Button>
            </div>
            {blocker && <p className="text-sm text-zinc-500">{blocker} to register.</p>}
          </form>
        )}

        {problem && <Notice tone="error">{problem}</Notice>}
      </div>
    </Card>
  );
}

export function RegisterView({ address }: { address: string }) {
  const valid = isAddress(address);
  const electionAddress = valid ? getAddress(address) : undefined;
  const { data: election, error } = useElection(electionAddress);
  const { address: account } = useAccount();
  const now = useChainNow();
  const stored = useStoredReceipt(chain.id, electionAddress, account);
  const [fresh, setFresh] = useState<Receipt>();
  const receipt = fresh && account && isAddressEqual(fresh.voter, account) ? fresh : stored;

  if (!valid) return <Notice tone="error">That is not an election address.</Notice>;
  if (error) return <Notice tone="error">{describeError(error)}</Notice>;
  if (election === undefined) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner /> Reading the election from the chain…
      </p>
    );
  }
  if (election === null) {
    return <Notice tone="error">This contract was not created by the election factory.</Notice>;
  }

  const open = registrationOpen(election, now);
  let status: string | undefined;
  if (election.phase === Phase.Cancelled) status = "This election was cancelled.";
  else if (!open && now < election.schedule.registrationStart) {
    status = `Registration opens ${formatRelative(election.schedule.registrationStart, now)}, on ${formatTime(election.schedule.registrationStart)}.`;
  } else if (!open) status = "Registration for this election has closed.";

  return (
    <>
      <ElectionHeader election={election} action="Register to vote" />
      {status && <Notice>{status}</Notice>}
      {receipt && <ReceiptCard receipt={receipt} />}
      {account && election.voterListCid !== "" && <ListCheck election={election} voter={account} />}
      {open && (
        <>
          {receipt && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              You are registered with this wallet. Registering it again with the same email address
              gives you a fresh receipt; a registration cannot move to another wallet.
            </p>
          )}
          <RegistrationForm election={election} onRegistered={setFresh} />
        </>
      )}
    </>
  );
}
