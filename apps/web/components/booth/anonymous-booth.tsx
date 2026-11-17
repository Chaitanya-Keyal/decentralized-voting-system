"use client";

import { ballotNullifier, Phase, semaphoreElectionAbi, type AnonymousBallot } from "@dvote/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { pad, toHex } from "viem";
import { useBlockNumber, useConfig, usePublicClient, useReadContract } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";

import type { OnchainElection } from "@/lib/election";
import { chain, explorer, explorerAddress, explorerTx, simulateAt } from "@/lib/env";
import { describeError } from "@/lib/errors";
import { useHideWallet } from "@/lib/header-wallet";
import {
  saveCastBallot,
  useCastBallot,
  useKeyFromLink,
  useStoredIdentity,
  type CastBallot,
} from "@/lib/identity";
import { proveInBrowser, type ProvingStage } from "@/lib/prover";
import { relayBallot, relayerApi } from "@/lib/relayer";
import { formatRelative, formatTime, useChainNow } from "@/lib/time";
import { useTransaction } from "@/lib/transaction";
import { useIdentityList } from "@/lib/voter-list";
import { useWallet } from "@/lib/wallet";

import { CopyButton } from "../copy-button";
import { VotingKeyCard } from "../register/identity-registration";
import { TransactionStatus } from "../transaction-status";
import {
  Button,
  Card,
  Disclosure,
  ExternalLink,
  LinkButton,
  Mono,
  muted,
  Notice,
  Spinner,
} from "../ui";
import { ConnectWallet } from "../wallet-connect";
import { CandidateChoice, choiceFor, type Marks } from "./candidate-choice";

/** Within this long of the close, a relayed ballot may not be mined in time. */
const DEADLINE_MARGIN = 5 * 60;

type Step =
  | { kind: "idle" }
  | { kind: "proving"; stage: ProvingStage }
  | { kind: "relaying" }
  | { kind: "queued"; id: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** How long to wait for a relayed ballot before suggesting another way. */
const RELAY_PATIENCE_MS = 5 * 60_000;

/**
 * Waits until a relayed ballot is counted. The chain is the authority: the nullifier being spent
 * means the ballot is in, whatever the relayer says. A relayer that stops answering for a while is
 * tolerated; one that reports failure, or takes too long, is not.
 */
async function waitUntilCounted(args: {
  id: string;
  isCounted: () => Promise<boolean>;
}): Promise<`0x${string}` | undefined> {
  const started = Date.now();
  while (Date.now() - started < RELAY_PATIENCE_MS) {
    const status = await relayerApi.status(args.id).catch(() => undefined);
    if (await args.isCounted().catch(() => false)) {
      return status?.status === "mined" ? status.txHash : undefined;
    }
    if (status?.status === "failed") {
      throw new Error(
        `The relayer could not submit the ballot (${status.error ?? "no reason given"}). Try again, or submit it from a wallet.`,
      );
    }
    await sleep(1500);
  }
  throw new Error(
    "The relayer has not submitted the ballot yet. Wait a little and reload, or submit it from a wallet.",
  );
}

function AnonymousBallotForm({
  election,
  commitments,
}: {
  election: OnchainElection;
  commitments: string[];
}) {
  const identity = useStoredIdentity(chain.id, election.address);
  const client = usePublicClient();
  const config = useConfig();
  const now = useChainNow();
  const wallet = useWallet();
  const transaction = useTransaction();
  const [marks, setMarks] = useState<Marks>(new Set());
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [proved, setProved] = useState<{ ballot: AnonymousBallot; provingMs: number }>();
  const choice = choiceFor(election, marks);
  const closingSoon = election.schedule.votingEnd - now < DEADLINE_MARGIN;
  const relayer = useQuery({ queryKey: ["relayer-config"], queryFn: relayerApi.config, retry: 1 });
  const busy = step.kind === "proving" || step.kind === "relaying" || step.kind === "queued";

  /** Proves the ballot once; a retry, or a switch to direct submission, reuses the proof. */
  async function prove(): Promise<AnonymousBallot> {
    if (!identity || choice === undefined) throw new Error("Choose a candidate first.");
    if (proved?.ballot.choice === choice) return proved.ballot;
    const result = await proveInBrowser({
      identity,
      commitments,
      election: election.address,
      choice,
      onStage: (stage) => setStep({ kind: "proving", stage }),
    });
    if (!client) throw new Error("Not connected to the chain.");
    const used = await client.readContract({
      address: election.address,
      abi: semaphoreElectionAbi,
      functionName: "ballotKeyUsed",
      args: [pad(toHex(result.ballot.nullifier))],
    });
    if (used) throw new Error("This voting key has already voted in this election.");
    setProved(result);
    return result.ballot;
  }

  const record = (ballot: AnonymousBallot, extra: Partial<CastBallot>) =>
    saveCastBallot(chain.id, election.address, {
      nullifier: ballot.nullifier.toString(),
      choice: ballot.choice.toString(),
      ...extra,
    });

  async function castThroughRelayer() {
    try {
      if (!client) throw new Error("Not connected to the chain.");
      const ballot = await prove();
      setStep({ kind: "relaying" });
      const { id, receipt } = await relayBallot({ election: election.address, ballot });
      record(ballot, { relayId: id, relayReceipt: receipt });
      setStep({ kind: "queued", id });
      const txHash = await waitUntilCounted({
        id,
        isCounted: () =>
          client.readContract({
            address: election.address,
            abi: semaphoreElectionAbi,
            functionName: "ballotKeyUsed",
            args: [pad(toHex(ballot.nullifier))],
          }),
      });
      record(ballot, { relayId: id, relayReceipt: receipt, txHash, counted: true });
      setStep({ kind: "done" });
    } catch (error) {
      setStep({ kind: "error", message: describeError(error) });
    }
  }

  async function castFromWallet() {
    let sent: AnonymousBallot | undefined;
    const receipt = await transaction.send(async () => {
      setStep({ kind: "idle" });
      const ballot = await prove();
      const { request } = await simulateContract(config, {
        ...simulateAt,
        chainId: chain.id,
        account: wallet.account,
        address: election.address,
        abi: semaphoreElectionAbi,
        functionName: "castVote",
        args: [ballot.choice, ballot.nullifier, ballot.points],
      });
      const hash = await writeContract(config, request);
      sent = ballot;
      record(ballot, { txHash: hash });
      return hash;
    });
    // Counted only once the transaction has succeeded on-chain.
    if (receipt && sent) record(sent, { txHash: receipt.transactionHash, counted: true });
  }

  return (
    <Card
      title="Your anonymous ballot"
      description={`Voting closes ${formatTime(election.schedule.votingEnd)}. You can vote once, and a ballot cannot be changed after it is cast.`}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void castThroughRelayer();
        }}
      >
        <CandidateChoice election={election} marks={marks} onChange={setMarks} />
        {closingSoon && (
          <Notice tone="warning">
            Voting closes {formatRelative(election.schedule.votingEnd, now)}. A relayed ballot may
            not be mined in time; submitting from a wallet is quicker.
          </Notice>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={choice === undefined || busy || transaction.busy}>
            {busy && <Spinner />} Cast my ballot, no wallet needed
          </Button>
        </div>
        {step.kind === "proving" && (
          <Notice busy>
            {step.stage === "downloading"
              ? "Downloading the proving files and checking their hashes…"
              : "Making the zero-knowledge proof on this device. This takes a few seconds…"}
          </Notice>
        )}
        {step.kind === "relaying" && (
          <Notice busy>Handing the ballot to the relayer, which checks it and pays the gas…</Notice>
        )}
        {step.kind === "queued" && (
          <Notice busy>
            The relayer accepted the ballot and signed a receipt. Waiting for it to be mined…
          </Notice>
        )}
        {step.kind === "error" && <Notice tone="error">{step.message}</Notice>}
        {proved && (
          <p className={`text-xs ${muted}`}>
            Proved in {(proved.provingMs / 1000).toFixed(1)} s on this device.
          </p>
        )}

        <Disclosure summary="Advanced: send it from a wallet of your own instead">
          <p>
            If the relayer is down{relayer.isError ? " (it is not answering now)" : ""}, any wallet
            can submit your ballot and pay its gas. The proof still hides who you are, but the
            wallet is shown as having submitted a ballot, so use one that is not linked to you.
          </p>
          {wallet.account ? (
            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void castFromWallet()}
                disabled={choice === undefined || busy || transaction.busy || !wallet.ready}
                title={wallet.blocker}
              >
                Submit from my wallet
              </Button>
              {wallet.blocker && <p className={`mt-2 ${muted}`}>{wallet.blocker}.</p>}
            </div>
          ) : (
            <ConnectWallet />
          )}
          <TransactionStatus state={transaction.state} />
        </Disclosure>
      </form>
    </Card>
  );
}

function CastBallotCard({ election, ballot }: { election: OnchainElection; ballot: CastBallot }) {
  const id = pad(toHex(BigInt(ballot.nullifier)));
  const transaction = ballot.txHash ? explorerTx(ballot.txHash) : undefined;
  const events = explorerAddress(election.address);
  return (
    <>
      <Notice tone="success">
        You have voted. Your ballot is recorded on the blockchain and included in the count. It cost
        you nothing.
      </Notice>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Your ballot ID is <Mono value={id} />. Nobody can connect it to your name. On the
        election&apos;s page this browser marks your ballot &ldquo;yours&rdquo;; note the ID to find
        it from another device. <CopyButton value={id}>Copy the ballot ID</CopyButton>
      </p>
      {(transaction ?? events) && (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          To check it without this site, open{" "}
          {transaction ? (
            <ExternalLink href={transaction}>
              your ballot&apos;s transaction on {explorer?.name}
            </ExternalLink>
          ) : (
            <ExternalLink href={`${events}?tab=logs`}>
              the election&apos;s events on {explorer?.name}
            </ExternalLink>
          )}
          : its <code className="font-mono text-xs">VoteCast</code> event shows this ballot ID and
          your choice.
        </p>
      )}
      <LinkButton href={`/elections/${election.address}`} variant="secondary">
        See your ballot in the count
      </LinkButton>
    </>
  );
}

/** Tier 3's booth: proves membership of the published list without saying which member. */
export function AnonymousBooth({ election }: { election: OnchainElection }) {
  useHideWallet();
  const fromLink = useKeyFromLink(chain.id, election.address);
  const now = useChainNow();
  const identity = useStoredIdentity(chain.id, election.address);
  const cast = useCastBallot(chain.id, election.address);
  const list = useIdentityList(election);
  // Whether this key has voted, from the nullifier its ballot would carry: known before proving,
  // so a voter who has voted, from this browser or another, is told so straight away.
  const nullifier = useMemo(
    () => (identity ? ballotNullifier(identity, election.address) : undefined),
    [identity, election.address],
  );
  const { data: block } = useBlockNumber({ watch: true });
  const voted = useReadContract({
    address: election.address,
    abi: semaphoreElectionAbi,
    functionName: "ballotKeyUsed",
    args: nullifier === undefined ? undefined : [pad(toHex(nullifier))],
    query: { enabled: nullifier !== undefined },
  });
  const { refetch } = voted;
  useEffect(() => {
    void refetch();
  }, [block, refetch]);

  if (fromLink.offered) {
    return (
      <Card
        title="Use the voting key from this link?"
        description="Only if you sent this link to yourself, from the device you registered on. A key from anyone else would cast their ballot, not yours."
      >
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-zinc-600 dark:text-zinc-400">
            Its public code is <Mono value={fromLink.offered.commitment.toString()} />; your
            registration receipt shows the same code.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={fromLink.accept}>Use this key</Button>
            <Button variant="secondary" onClick={fromLink.dismiss}>
              Don&apos;t use it
            </Button>
          </div>
        </div>
      </Card>
    );
  }
  if (election.phase === Phase.Cancelled) return <Notice>This election was cancelled.</Notice>;
  if (election.voterListCid === "") {
    return now >= election.schedule.votingStart ? (
      <Notice>
        The voter list was not published before voting was due to open, so this election cannot go
        ahead.
      </Notice>
    ) : (
      <Notice>
        The voter list has not been published yet. Voting opens only after it is, so that every
        voter can first check that they are on it.
      </Notice>
    );
  }
  const keptNotice = fromLink.refused && (
    <Notice>
      This browser already has a voting key for this election, so the key in the link was not used.
    </Notice>
  );
  if (cast?.counted) return <CastBallotCard election={election} ballot={cast} />;
  if (voted.data === true && nullifier !== undefined) {
    return (
      <CastBallotCard
        election={election}
        ballot={cast ?? { nullifier: nullifier.toString(), choice: "" }}
      />
    );
  }
  if (!identity) {
    return (
      <>
        <Notice>
          This browser doesn&apos;t have your voting key yet. If you have already voted, your ballot
          still counts; bringing the key here only lets this browser show it.
        </Notice>
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium">To bring your key here, do one of these:</p>
          <ol
            role="list"
            className="flex list-decimal flex-col gap-1.5 pl-5 text-zinc-700 dark:text-zinc-300"
          >
            <li>
              Registered on this phone or computer, but this page opened inside WhatsApp or another
              app? Open it in the browser you registered in instead:{" "}
              <CopyButton value={() => window.location.href} copied="Copied. Paste it there.">
                copy this page&apos;s address
              </CopyButton>
            </li>
            <li>
              Or open the link you sent yourself when you registered. It opens this page with your
              key.
            </li>
            <li>
              Or, on the device you registered on, open this election&apos;s registration page and
              scan its QR code with this phone.
            </li>
            <li>
              Or choose the key file saved when you registered (its name starts with
              &ldquo;dvote-voting-key&rdquo;; on a phone, look in Downloads or Files).
            </li>
          </ol>
          <p className="text-zinc-600 dark:text-zinc-400">
            Nobody can recover a lost key, not even us: that is what keeps your ballot secret.
          </p>
          <div>
            <LinkButton href={`/elections/${election.address}`} variant="secondary">
              Only checking the results? See the count
            </LinkButton>
          </div>
        </div>
        <VotingKeyCard election={election} restoreOnly />
      </>
    );
  }
  if (list.isPending) {
    return (
      <Notice busy>
        Downloading the voter list from IPFS and checking it against the contract…
      </Notice>
    );
  }
  if (list.error) {
    return (
      <Notice tone="error">
        The voter list could not be checked, so the booth will not use it:{" "}
        {describeError(list.error)}
      </Notice>
    );
  }
  if (!list.data.commitments.includes(identity.commitment.toString())) {
    return (
      <Notice tone="error">
        Your voting key is not on the voter list. If you registered it, your receipt is evidence
        that the registrar left you out.
      </Notice>
    );
  }

  const checked = (
    <Notice tone="success">
      You&apos;re on the voter list, checked in this browser against the contract. Your ballot
      won&apos;t reveal who you are.
    </Notice>
  );

  const { votingStart, votingEnd } = election.schedule;
  if (election.phase === Phase.Registration || election.phase === Phase.Created) {
    return (
      <>
        {keptNotice}
        {checked}
        {now < votingStart ? (
          <Notice>
            Voting opens {formatRelative(votingStart, now)}, on {formatTime(votingStart)}. Come back
            then.
          </Notice>
        ) : now < votingEnd ? (
          <>
            <Notice>
              Voting is due to open, but nobody has opened it on-chain yet. Anyone can, from the
              election&apos;s page.
            </Notice>
            <LinkButton href={`/elections/${election.address}`} variant="secondary">
              Go to the election
            </LinkButton>
          </>
        ) : (
          <Notice>
            The voting window passed without voting opening, so this election cannot go ahead.
          </Notice>
        )}
      </>
    );
  }
  if (election.phase === Phase.Voting && now < votingEnd) {
    return (
      <>
        {keptNotice}
        {checked}
        <AnonymousBallotForm election={election} commitments={list.data.commitments} />
      </>
    );
  }
  return (
    <>
      <Notice>Voting has closed.</Notice>
      <LinkButton href={`/elections/${election.address}`} variant="secondary">
        See the result
      </LinkButton>
    </>
  );
}
