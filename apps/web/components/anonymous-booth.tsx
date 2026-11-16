"use client";

import { Phase, semaphoreElectionAbi, type AnonymousBallot } from "@dvote/shared";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { pad, toHex } from "viem";
import { useConfig, usePublicClient } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";

import type { OnchainElection } from "@/lib/election";
import { chain, explorerTx, simulateAt } from "@/lib/env";
import { describeError } from "@/lib/errors";
import { saveCastBallot, useCastBallot, useStoredIdentity, type CastBallot } from "@/lib/identity";
import { proveInBrowser, type ProvingStage } from "@/lib/prover";
import { relayBallot, relayerApi } from "@/lib/relayer";
import { formatRelative, formatTime, useChainNow } from "@/lib/time";
import { useTransaction } from "@/lib/transaction";
import { useIdentityList } from "@/lib/voter-list";
import { useWallet } from "@/lib/wallet";

import { CandidateChoice, choiceFor, type Marks } from "./candidate-choice";
import { VotingKeyCard } from "./identity-registration";
import { TransactionStatus } from "./transaction-status";
import { Button, Card, LinkButton, Mono, Notice, Spinner } from "./ui";

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
    if (status?.status === "mined") return status.txHash;
    if (await args.isCounted().catch(() => false)) return undefined;
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

  const castFromWallet = () =>
    void transaction.send(async () => {
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
      record(ballot, { txHash: hash, counted: true });
      return hash;
    });

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
          <Notice tone="error">
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
          <Notice>
            <span className="flex items-center gap-2">
              <Spinner />
              {step.stage === "downloading"
                ? "Downloading the proving files and checking their hashes…"
                : "Making the zero-knowledge proof on this device. This takes a few seconds…"}
            </span>
          </Notice>
        )}
        {step.kind === "relaying" && (
          <Notice>
            <span className="flex items-center gap-2">
              <Spinner /> Handing the ballot to the relayer, which checks it and pays the gas…
            </span>
          </Notice>
        )}
        {step.kind === "queued" && (
          <Notice>
            <span className="flex items-center gap-2">
              <Spinner /> The relayer accepted the ballot and signed a receipt. Waiting for it to be
              mined…
            </span>
          </Notice>
        )}
        {step.kind === "error" && <Notice tone="error">{step.message}</Notice>}
        {proved && (
          <p className="text-xs text-zinc-500">
            Proved in {(proved.provingMs / 1000).toFixed(1)} s on this device.
          </p>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
            Submit from a wallet instead
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            <p className="text-zinc-500">
              If the relayer is down{relayer.isError ? " (it is not answering now)" : ""}, any
              wallet can submit your ballot and pay its gas. The proof still hides who you are, but
              the wallet is shown as having submitted a ballot, so use one that is not linked to
              you.
            </p>
            {wallet.account ? (
              <div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={castFromWallet}
                  disabled={choice === undefined || busy || transaction.busy || !wallet.ready}
                  title={wallet.blocker}
                >
                  Submit from my wallet
                </Button>
              </div>
            ) : (
              <ConnectButton />
            )}
            <TransactionStatus state={transaction.state} />
          </div>
        </details>
      </form>
    </Card>
  );
}

function CastBallotCard({ election, ballot }: { election: OnchainElection; ballot: CastBallot }) {
  return (
    <Card
      title="You have voted"
      description="Your ballot is on-chain under a nullifier: a number that stops your key voting twice, but says nothing about who you are."
    >
      <div className="flex flex-col gap-3 text-sm">
        <p>
          Nullifier <Mono value={toHex(BigInt(ballot.nullifier))} />
        </p>
        {ballot.txHash && (
          <p>
            Transaction{" "}
            {explorerTx(ballot.txHash) ? (
              <a
                href={explorerTx(ballot.txHash)}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                <Mono value={ballot.txHash} />
              </a>
            ) : (
              <Mono value={ballot.txHash} />
            )}
          </p>
        )}
        {ballot.relayReceipt && (
          <p className="text-zinc-500">
            The relayer signed a receipt for it at {formatTime(ballot.relayReceipt.acceptedAt)}.
          </p>
        )}
        <div>
          <LinkButton href={`/elections/${election.address}`} variant="secondary">
            See the count
          </LinkButton>
        </div>
      </div>
    </Card>
  );
}

/** Tier 3's booth: proves membership of the published list without saying which member. */
export function AnonymousBooth({ election }: { election: OnchainElection }) {
  const now = useChainNow();
  const identity = useStoredIdentity(chain.id, election.address);
  const cast = useCastBallot(chain.id, election.address);
  const list = useIdentityList(election);

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
  if (cast?.counted) return <CastBallotCard election={election} ballot={cast} />;
  if (!identity) {
    return (
      <>
        <Notice>
          This browser does not hold a voting key for this election. Restore yours from the backup
          you downloaded when you registered.
        </Notice>
        <VotingKeyCard election={election} />
      </>
    );
  }
  if (list.isPending) {
    return (
      <Notice>
        <span className="flex items-center gap-2">
          <Spinner /> Downloading the voter list from IPFS and checking it against the contract…
        </span>
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
      Your browser downloaded the voter list, checked that it produces the root recorded in the
      contract, and found your voting key on it. Your ballot will prove that it comes from someone
      on this list, without saying who.
    </Notice>
  );

  const { votingStart, votingEnd } = election.schedule;
  if (election.phase === Phase.Registration || election.phase === Phase.Created) {
    return (
      <>
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
