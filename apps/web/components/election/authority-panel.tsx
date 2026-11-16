"use client";

import { AUTHORITY_ROLE, electionMetadataSchema, merkleElectionAbi, Phase } from "@dvote/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useConfig } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";

import { useHasRole, type OnchainElection } from "@/lib/election";
import { chain, simulateAt } from "@/lib/env";
import { describeError } from "@/lib/errors";
import { fetchFromIpfs } from "@/lib/ipfs";
import { useTransaction } from "@/lib/transaction";
import { useWallet } from "@/lib/wallet";

import {
  candidateDrafts,
  CandidatesEditor,
  candidatesProblem,
  parseSchedule,
  pinCandidates,
  pinDescription,
  scheduleDraft,
  ScheduleEditor,
  type CandidateDraft,
  type ScheduleDraft,
} from "../election-fields";
import { TransactionStatus } from "../transaction-status";
import { Button, Card, Field, Input, Notice, Textarea } from "../ui";
import { ActionButton } from "./action-button";

function EditDetails({ election, onDone }: { election: OnchainElection; onDone: () => void }) {
  const config = useConfig();
  const { account, ready, blocker } = useWallet();
  const transaction = useTransaction();
  const [title, setTitle] = useState(election.title);
  const [schedule, setSchedule] = useState<ScheduleDraft>(() => scheduleDraft(election.schedule));
  const [problem, setProblem] = useState<string>();
  // The current description, so it can be edited rather than retyped.
  const current = useQuery({
    queryKey: ["ipfs", election.metadataCid],
    queryFn: () => fetchFromIpfs(electionMetadataSchema, election.metadataCid),
    enabled: election.metadataCid !== "",
    staleTime: Infinity,
  });
  const [edited, setEdited] = useState<string>();
  const description = edited ?? current.data?.description ?? "";
  const hasDescription = election.metadataCid !== "";
  const loading = hasDescription && current.isPending;
  const unloaded = hasDescription && current.isError && edited === undefined;

  async function save() {
    setProblem(undefined);
    const parsed = parseSchedule(schedule);
    if ("problem" in parsed) return setProblem(parsed.problem);
    if (!title.trim()) return setProblem("Give the election a title.");
    try {
      // An untouched description keeps its address, even if it could not be downloaded, rather
      // than being replaced by an empty one.
      const metadataCid =
        edited === undefined ? election.metadataCid : await pinDescription(edited);
      const receipt = await transaction.send(async () => {
        const { request } = await simulateContract(config, {
          ...simulateAt,
          chainId: chain.id,
          account,
          address: election.address,
          abi: merkleElectionAbi,
          functionName: "configure",
          args: [title.trim(), metadataCid, parsed.schedule],
        });
        return writeContract(config, request);
      });
      if (receipt) onDone();
    } catch (error) {
      setProblem(describeError(error));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Title">
        <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
      </Field>
      <Field label="Description">
        <Textarea
          value={description}
          onChange={(event) => setEdited(event.target.value)}
          disabled={loading}
          placeholder={loading ? "Loading the current description…" : undefined}
          maxLength={10_000}
        />
      </Field>
      {unloaded && (
        <Notice tone="warning">
          The current description could not be downloaded from IPFS. Saving keeps it as it is,
          unless you type a new one here.
        </Notice>
      )}
      <ScheduleEditor value={schedule} onChange={setSchedule} />
      {problem && <Notice tone="error">{problem}</Notice>}
      <TransactionStatus state={transaction.state} />
      <div className="flex gap-2">
        <Button
          onClick={() => void save()}
          disabled={!ready || loading || transaction.busy}
          title={blocker}
        >
          Save details
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  );
}

function EditCandidates({ election, onDone }: { election: OnchainElection; onDone: () => void }) {
  const config = useConfig();
  const { account, ready, blocker } = useWallet();
  const transaction = useTransaction();
  const [problem, setProblem] = useState<string>();
  // The current candidates with their manifestos, so they can be edited rather than retyped.
  const current = useQuery({
    queryKey: ["candidate-drafts", election.address, election.candidates],
    queryFn: () => candidateDrafts(election.candidates),
    staleTime: Infinity,
  });
  const [edited, setEdited] = useState<CandidateDraft[]>();
  const candidates = edited ?? current.data;

  async function save() {
    if (!candidates) return;
    setProblem(undefined);
    const invalid = candidatesProblem(candidates);
    if (invalid) return setProblem(invalid);
    try {
      const onChain = await pinCandidates(candidates);
      const receipt = await transaction.send(async () => {
        const { request } = await simulateContract(config, {
          ...simulateAt,
          chainId: chain.id,
          account,
          address: election.address,
          abi: merkleElectionAbi,
          functionName: "setCandidates",
          args: [onChain],
        });
        return writeContract(config, request);
      });
      if (receipt) onDone();
    } catch (error) {
      setProblem(describeError(error));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {candidates ? (
        <CandidatesEditor value={candidates} onChange={setEdited} />
      ) : (
        <p className="text-sm text-zinc-500">Loading the manifestos…</p>
      )}
      {problem && <Notice tone="error">{problem}</Notice>}
      <TransactionStatus state={transaction.state} />
      <div className="flex gap-2">
        <Button
          onClick={() => void save()}
          disabled={!ready || !candidates || transaction.busy}
          title={blocker}
        >
          Save candidates
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  );
}

/**
 * What the contract lets the authority do at `now`. Its powers end by the clock: registration is
 * open from its start time, and voting from its start time, whether or not anyone has recorded
 * that on-chain yet.
 */
function authorityPowers(election: OnchainElection, now: number) {
  const { phase, schedule } = election;
  const beforeVoting = phase === Phase.Created || phase === Phase.Registration;
  const published = election.voterListCid !== "";
  const votingWindow = now >= schedule.votingStart && now < schedule.votingEnd;
  return {
    configure: phase === Phase.Created && now < schedule.registrationStart,
    candidates: beforeVoting && now < schedule.votingStart,
    // A failed election, whose list never appeared or whose voting never opened, can be cancelled.
    cancel: beforeVoting && !(votingWindow && published),
  };
}

/** Shown to the election's authority while it has any powers left. */
export function AuthorityPanel({ election, now }: { election: OnchainElection; now: number }) {
  const { account } = useWallet();
  const isAuthority = useHasRole(election.address, AUTHORITY_ROLE, account);
  const [editing, setEditing] = useState<"details" | "candidates">();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const can = authorityPowers(election, now);

  if (!isAuthority || !(can.configure || can.candidates || can.cancel)) return null;

  return (
    <Card title="Authority" description="You manage this election from this wallet.">
      {editing === "details" && can.configure ? (
        <EditDetails election={election} onDone={() => setEditing(undefined)} />
      ) : editing === "candidates" && can.candidates ? (
        <EditCandidates election={election} onDone={() => setEditing(undefined)} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {can.configure && (
              <Button variant="secondary" onClick={() => setEditing("details")}>
                Edit details and schedule
              </Button>
            )}
            {can.candidates && (
              <Button variant="secondary" onClick={() => setEditing("candidates")}>
                Edit candidates
              </Button>
            )}
            {can.cancel && !confirmCancel && (
              <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
                Cancel the election
              </Button>
            )}
          </div>
          {can.cancel && confirmCancel && (
            <Notice tone="warning">
              <div className="flex flex-col gap-3">
                <span>Cancelling is permanent. Nobody will be able to vote in this election.</span>
                <div className="flex flex-wrap gap-2">
                  <ActionButton election={election.address} step="cancel" variant="danger">
                    Yes, cancel it
                  </ActionButton>
                  <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            </Notice>
          )}
        </div>
      )}
    </Card>
  );
}
