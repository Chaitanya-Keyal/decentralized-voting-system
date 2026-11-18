"use client";

import { merkleElectionAbi, Phase } from "@dvote/shared";
import { useEffect, useState } from "react";
import { getAddress, isAddress, pad, type Address, type Hex } from "viem";
import { useAccount, useBlockNumber, useConfig, useReadContract } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";

import { useDocumentTitle } from "@/lib/document-title";
import { useElection, type OnchainElection } from "@/lib/election";
import { chain, simulateAt } from "@/lib/env";
import { describeError } from "@/lib/errors";
import { formatRelative, formatTime, useChainNow } from "@/lib/time";
import { useTransaction } from "@/lib/transaction";
import { proofFor, useVoterList } from "@/lib/voter-list";
import { useWallet } from "@/lib/wallet";

import { ElectionHeader } from "../election/election-header";
import { ElectionPending } from "../election/election-pending";
import { TransactionStatus } from "../transaction-status";
import { Button, Card, LinkButton, Notice } from "../ui";
import { ConnectWallet } from "../wallet-connect";
import { AnonymousBooth } from "./anonymous-booth";
import { CandidateChoice, choiceFor, type Marks } from "./candidate-choice";

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
        <Notice>
          Your vote will be public: anyone can see which wallet chose whom. Sending it costs a small
          network fee (gas) from your wallet.
        </Notice>
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
        {blocker && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{blocker} to cast your ballot.</p>
        )}
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
    return <Notice busy>Checking that you&apos;re on the voter list…</Notice>;
  }
  if (list.error) {
    return (
      <Notice tone="error">
        Couldn&apos;t check the voter list, so you can&apos;t vote yet. Reload the page to try
        again. Details: {describeError(list.error)}
      </Notice>
    );
  }

  const proof = proofFor(list.data, account);
  if (!proof) {
    return (
      <Notice tone="error">
        This wallet is not on the voter list. If you registered it, download your receipt from the
        registration page and send it to the organiser. It proves the registrar left you out.
      </Notice>
    );
  }

  const checked = (
    <Notice tone="success">
      You&apos;re on the voter list, checked in this browser against the list&apos;s fingerprint.
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
        <Notice busy>Checking whether this wallet has voted…</Notice>
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
              Voting should be open by now, but someone still has to switch it on. Anyone with a
              wallet can do it from the election page.
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
  const now = useChainNow();
  useDocumentTitle(election ? `Vote: ${election.title}` : undefined);

  if (!valid || error || !election) {
    return <ElectionPending valid={valid} error={error} election={election} />;
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
          <ConnectWallet />
        </Card>
      ) : (
        <Booth election={election} account={account} />
      )}
    </>
  );
}
