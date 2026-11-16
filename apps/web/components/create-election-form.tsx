"use client";

import { CountingRule, electionFactoryAbi } from "@dvote/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isAddress, parseEventLogs, type Address } from "viem";
import { useConfig } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";

import { api } from "@/lib/api";
import { deployment, factoryAbi } from "@/lib/election";
import { chain, simulateAt } from "@/lib/env";
import { describeError } from "@/lib/errors";
import { toLocalInput, useChainNow } from "@/lib/time";
import { useTransaction } from "@/lib/transaction";
import { useWallet } from "@/lib/wallet";

import {
  CandidatesEditor,
  candidatesProblem,
  parseSchedule,
  pinCandidates,
  pinDescription,
  ScheduleEditor,
  type CandidateDraft,
  type ScheduleDraft,
} from "./election-fields";
import { TransactionStatus } from "./transaction-status";
import { Button, Card, Field, Input, Notice, Textarea } from "./ui";

const MINUTE = 60;

/** Registration opens in two minutes and lasts an hour; voting follows ten minutes later. */
function defaultSchedule(now: number): ScheduleDraft {
  const start = Math.ceil(now / MINUTE) * MINUTE + 2 * MINUTE;
  return {
    registrationStart: toLocalInput(start),
    registrationEnd: toLocalInput(start + 60 * MINUTE),
    votingStart: toLocalInput(start + 70 * MINUTE),
    votingEnd: toLocalInput(start + 130 * MINUTE),
  };
}

export function CreateElectionForm() {
  const router = useRouter();
  const config = useConfig();
  const { account, ready, blocker } = useWallet();
  const apiConfig = useQuery({ queryKey: ["api-config"], queryFn: api.config });
  const transaction = useTransaction();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [candidates, setCandidates] = useState<CandidateDraft[]>([
    { name: "", manifesto: "" },
    { name: "", manifesto: "" },
  ]);
  // Until edited, the schedule follows the chain's clock, which on Anvil can run ahead.
  const now = useChainNow();
  const [edited, setSchedule] = useState<ScheduleDraft>();
  const schedule = edited ?? defaultSchedule(now);
  const [registrar, setRegistrar] = useState("");
  const [step, setStep] = useState<string>();
  const [problem, setProblem] = useState<string>();

  const registrarAddress =
    registrar.trim() !== "" ? registrar.trim() : (apiConfig.data?.registrar ?? "");

  function problemWith(parsed: ReturnType<typeof parseSchedule>): string | undefined {
    if (!title.trim()) return "Give the election a title.";
    const candidatesInvalid = candidatesProblem(candidates);
    if (candidatesInvalid) return candidatesInvalid;
    if ("problem" in parsed) return parsed.problem;
    if (!isAddress(registrarAddress)) return "The registrar's address is not valid.";
    return undefined;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(undefined);
    transaction.reset();
    if (!deployment || !ready) return;
    const factory = deployment.electionFactory;

    const parsed = parseSchedule(schedule);
    const invalid = problemWith(parsed);
    if (invalid !== undefined || "problem" in parsed) return setProblem(invalid);

    try {
      setStep("Saving the description and manifestos to IPFS…");
      const metadataCid = await pinDescription(description);
      const onChainCandidates = await pinCandidates(candidates);
      setStep(undefined);

      const receipt = await transaction.send(async () => {
        const { request } = await simulateContract(config, {
          ...simulateAt,
          chainId: chain.id,
          account,
          address: factory,
          abi: factoryAbi,
          functionName: "createElection",
          args: [
            registrarAddress as Address,
            CountingRule.Plurality,
            title.trim(),
            metadataCid,
            parsed.schedule,
            onChainCandidates,
          ],
        });
        return writeContract(config, request);
      });
      if (!receipt) return;

      const [created] = parseEventLogs({
        abi: electionFactoryAbi,
        eventName: "ElectionCreated",
        logs: receipt.logs,
      });
      if (!created) return;
      // Next keeps this page's state for when it is visited again, so start that visit afresh.
      setTitle("");
      setDescription("");
      setCandidates([
        { name: "", manifesto: "" },
        { name: "", manifesto: "" },
      ]);
      setSchedule(undefined);
      transaction.reset();
      router.push(`/elections/${created.args.election}`);
    } catch (error) {
      setStep(undefined);
      setProblem(describeError(error));
    }
  }

  if (!deployment) {
    return <Notice tone="error">The contracts are not deployed on this chain yet.</Notice>;
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
      <Card title="About the election">
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Student Senate 2026"
              maxLength={200}
            />
          </Field>
          <Field label="Description" hint="Saved to IPFS; the contract stores its address.">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is being decided, and who can vote."
              maxLength={10_000}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Candidates"
        description="Candidates can be changed until voting opens, but not after."
      >
        <CandidatesEditor value={candidates} onChange={setCandidates} />
      </Card>

      <Card
        title="Schedule"
        description="Each step needs its time to have passed and someone to trigger it. The gap between registration closing and voting opening lets voters check they are on the published list."
      >
        <ScheduleEditor value={schedule} onChange={setSchedule} />
      </Card>

      <Card
        title="Registrar"
        description="The registrar checks voters' email addresses and publishes the voter list."
      >
        <Field
          label="Registrar's address"
          hint={
            apiConfig.data
              ? `Leave empty to use this deployment's registrar, ${apiConfig.data.registrar}.`
              : undefined
          }
        >
          <Input
            value={registrar}
            onChange={(event) => setRegistrar(event.target.value)}
            placeholder={apiConfig.data?.registrar ?? "0x…"}
          />
        </Field>
      </Card>

      {problem && <Notice tone="error">{problem}</Notice>}
      {step && <Notice>{step}</Notice>}
      <TransactionStatus state={transaction.state} />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!ready || transaction.busy || Boolean(step)}>
          Create election
        </Button>
        {blocker && <span className="text-sm text-zinc-500">{blocker} to create an election.</span>}
      </div>
    </form>
  );
}
