"use client";

import { Phase, registrationTypedData, type Receipt } from "@dvote/shared";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState } from "react";
import { getAddress, isAddress, isAddressEqual } from "viem";
import { useAccount, useConfig } from "wagmi";
import { signTypedData } from "wagmi/actions";

import { api } from "@/lib/api";
import { useElection, type OnchainElection } from "@/lib/election";
import { chain } from "@/lib/env";
import { describeError } from "@/lib/errors";
import { useHideWallet } from "@/lib/chrome";
import { useStoredIdentity, useStoredIdentityReceipt } from "@/lib/identity";
import { saveReceipt, useStoredReceipt } from "@/lib/receipts";
import { formatRelative, formatTime, useChainNow } from "@/lib/time";
import { useWallet } from "@/lib/wallet";

import { EmailProof, type EmailProofValue } from "./email-proof";
import { KeyTransfer } from "./key-transfer";
import { ElectionHeader } from "./election-header";
import {
  IdentityReceiptCard,
  IdentityRegistrationForm,
  VotingKeyCard,
} from "./identity-registration";
import { IdentityListCheck, ListCheck } from "./list-check";
import { ReceiptCard } from "./receipt-card";
import { Card, Notice, Spinner } from "./ui";

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
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string>();

  const register = async (proof: EmailProofValue) => {
    if (!account) return;
    setProblem(undefined);
    setBusy(true);
    try {
      // The wallet signs the email address it is being registered with; this costs nothing.
      const signature = await signTypedData(config, {
        account,
        ...registrationTypedData({
          chainId: chain.id,
          election: election.address,
          voter: account,
          email: proof.email,
        }),
      });
      const receipt = await api.register(election.address, {
        ...proof,
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
    } catch (error) {
      setProblem(describeError(error));
    } finally {
      setBusy(false);
    }
  };

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
        <EmailProof
          election={election}
          subject={account}
          submitLabel="Sign with my wallet and register"
          busy={busy}
          disabled={ready ? undefined : `${blocker ?? "Connect your wallet"} to register`}
          onSubmit={(proof) => void register(proof)}
        />
        {problem && <Notice tone="error">{problem}</Notice>}
      </div>
    </Card>
  );
}

function registrationStatus(election: OnchainElection, now: number): string | undefined {
  if (election.phase === Phase.Cancelled) return "This election was cancelled.";
  if (registrationOpen(election, now)) return undefined;
  if (now < election.schedule.registrationStart) {
    return `Registration opens ${formatRelative(election.schedule.registrationStart, now)}, on ${formatTime(election.schedule.registrationStart)}.`;
  }
  return "Registration for this election has closed.";
}

/** Tier 3: a voting key made on this device, registered by its public fingerprint. */
function AnonymousRegistration({ election, now }: { election: OnchainElection; now: number }) {
  useHideWallet();
  const receipt = useStoredIdentityReceipt(chain.id, election.address);
  const identity = useStoredIdentity(chain.id, election.address);
  const open = registrationOpen(election, now);
  const status = registrationStatus(election, now);
  return (
    <>
      <ElectionHeader election={election} action="Register to vote" />
      {status && <Notice>{status}</Notice>}
      {receipt && election.voterListCid === "" && (
        <Notice tone="success">
          You&apos;re registered. Voting opens {formatTime(election.schedule.votingStart)}; come
          back then, from this browser or with your backup.
        </Notice>
      )}
      {identity && election.voterListCid !== "" && (
        <IdentityListCheck election={election} commitment={identity.commitment.toString()} />
      )}
      {receipt && now < election.schedule.votingEnd && <KeyTransfer election={election} />}
      {(open || identity) && <VotingKeyCard election={election} compact={Boolean(receipt)} />}
      {open && !receipt && <IdentityRegistrationForm election={election} />}
      {receipt && <IdentityReceiptCard receipt={receipt} />}
    </>
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
  if (election.tier === 3) return <AnonymousRegistration election={election} now={now} />;

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
