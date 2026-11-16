"use client";

import { merkleElectionAbi, Phase } from "@dvote/shared";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useState } from "react";
import { getAddress, isAddress, pad, type Address, type Hex } from "viem";
import { useAccount, useBlockNumber, useConfig, useReadContract } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";

import { useElection, type OnchainElection } from "@/lib/election";
import { chain, simulateAt } from "@/lib/env";
import { describeError } from "@/lib/errors";
import { useStoredReceipt } from "@/lib/receipts";
import { formatRelative, formatTime, useChainNow } from "@/lib/time";
import { useTransaction } from "@/lib/transaction";
import { proofFor, useVoterList } from "@/lib/voter-list";
import { useWallet } from "@/lib/wallet";

import { AnonymousBooth } from "./anonymous-booth";
import { CandidateChoice, choiceFor, type Marks } from "./candidate-choice";
import { ElectionHeader } from "./election-header";
import { ReceiptCard } from "./receipt-card";
import { TransactionStatus } from "./transaction-status";
import { Button, Card, LinkButton, Notice, Spinner } from "./ui";

function Ballot({ election, proof }: { election: OnchainElection; proof: Hex[] }) {
  const config = useConfig();
  const { account, ready, blocker } = useWallet();
  const transaction = useTransaction();
  const [marks, setMarks] = useState<Marks>(new Set());
  const choice = choiceFor(election, marks);

  const cast = () =>
    void transaction.send(async () => {
      if (choice === undefined) throw new Error("Choose a candidate first.");
      const { request } = await simulateContract(config, {
        ...simulateAt,
        chainId: chain.id,
        account,
        address: election.address,
        abi: merkleElectionAbi,
        functionName: "castVote",
        args: [choice, proof],
      });
      return writeContract(config, request);
    });

  return (
    <Card
      title="Your ballot"
      description={`Voting closes ${formatTime(election.schedule.votingEnd)}. You can vote once, and a ballot cannot be changed after it is cast.`}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          cast();
        }}
      >
        <CandidateChoice election={election} marks={marks} onChange={setMarks} />
        <div>
          <Button
            type="submit"
            disabled={choice === undefined || !ready || transaction.busy}
            title={blocker}
          >
            Cast my ballot
          </Button>
        </div>
        {blocker && <p className="text-sm text-zinc-500">{blocker} to cast your ballot.</p>}
        <p className="text-xs text-zinc-500">
          In this election a ballot is sent from your wallet, so it is public which wallet voted for
          whom, and the wallet pays a little gas. Elections with anonymous ballots need no wallet.
        </p>
        <TransactionStatus state={transaction.state} />
      </form>
    </Card>
  );
}

function Booth({ election, account }: { election: OnchainElection; account: Address }) {
  const now = useChainNow();
  const list = useVoterList(election);
  // Asked again on every block. A refetch keeps the last answer until the new one arrives, so a
  // voter who has voted never sees the ballot again in between; another wallet starts afresh.
  const { data: block } = useBlockNumber({ watch: true });
  const voted = useReadContract({
    address: election.address,
    abi: merkleElectionAbi,
    functionName: "ballotKeyUsed",
    args: [pad(account)],
  });
  const { refetch } = voted;
  useEffect(() => {
    void refetch();
  }, [block, refetch]);

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

  const proof = proofFor(list.data, account);
  if (!proof) {
    return (
      <Notice tone="error">
        This wallet is not on the voter list. If you registered it, its receipt is evidence that the
        registrar left you out.
      </Notice>
    );
  }

  const checked = (
    <Notice tone="success">
      Your browser downloaded the voter list, checked that it produces the root recorded in the
      contract, and found your wallet on it. It built your proof itself, without asking anyone.
    </Notice>
  );

  if (voted.error) {
    return (
      <Notice tone="error">
        Could not check whether this wallet has voted: {describeError(voted.error)}
      </Notice>
    );
  }
  if (voted.data === undefined) {
    return (
      <>
        {checked}
        <Notice>
          <span className="flex items-center gap-2">
            <Spinner /> Checking whether this wallet has voted…
          </span>
        </Notice>
      </>
    );
  }
  if (voted.data) {
    return (
      <>
        {checked}
        <Notice tone="success">You have voted in this election. Your ballot is counted.</Notice>
        <LinkButton href={`/elections/${election.address}`} variant="secondary">
          See the count
        </LinkButton>
      </>
    );
  }

  if (election.phase === Phase.Registration) {
    const { votingStart, votingEnd } = election.schedule;
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
  if (election.phase === Phase.Voting && now < election.schedule.votingEnd) {
    return (
      <>
        {checked}
        <Ballot election={election} proof={proof} />
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

export function BoothView({ address }: { address: string }) {
  const valid = isAddress(address);
  const electionAddress = valid ? getAddress(address) : undefined;
  const { data: election, error } = useElection(electionAddress);
  const { address: account } = useAccount();
  const receipt = useStoredReceipt(chain.id, electionAddress, account);
  const now = useChainNow();

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

  if (election.tier === 3) {
    return (
      <>
        <ElectionHeader election={election} action="Ballot booth" />
        <AnonymousBooth election={election} />
      </>
    );
  }

  return (
    <>
      <ElectionHeader election={election} action="Ballot booth" />
      {election.phase === Phase.Cancelled ? (
        <Notice>This election was cancelled.</Notice>
      ) : election.voterListCid === "" && now >= election.schedule.votingStart ? (
        <Notice>
          The voter list was not published before voting was due to open, so this election cannot go
          ahead.
        </Notice>
      ) : election.voterListCid === "" ? (
        <Notice>
          The voter list has not been published yet. Voting opens only after it is, so that every
          voter can first check that they are on it.
        </Notice>
      ) : !account ? (
        <Card title="Connect your wallet" description="Connect the wallet you registered with.">
          <ConnectButton />
        </Card>
      ) : (
        <Booth election={election} account={account} />
      )}
      {receipt && <ReceiptCard receipt={receipt} />}
    </>
  );
}
