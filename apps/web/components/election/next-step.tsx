"use client";

import { Phase } from "@dvote/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { api } from "@/lib/api";
import type { OnchainElection } from "@/lib/election";
import { describeError } from "@/lib/errors";
import { ipfsUrl } from "@/lib/ipfs";
import { formatRelative, formatTime } from "@/lib/time";

import { Button, LinkButton, Mono, Notice, Spinner } from "../ui";
import { ActionButton } from "./action-button";
import { SkipAhead } from "./skip-ahead";

function useRegistrationCount(election: OnchainElection) {
  return useQuery({
    queryKey: ["registrations", election.address],
    queryFn: () => api.registrationCount(election.address),
    refetchInterval: 5_000,
  });
}

/** Asks the registrar to publish the voter list, which it does once registration has closed. */
function PublishButton({ election }: { election: OnchainElection }) {
  const publish = useMutation({ mutationFn: () => api.publishVoterList(election.address) });
  const { data } = useRegistrationCount(election);
  if (data?.count === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button disabled={publish.isPending} onClick={() => publish.mutate()}>
          {publish.isPending && <Spinner />} Ask the registrar to publish it now
        </Button>
      </div>
      {publish.error && <Notice tone="error">{describeError(publish.error)}</Notice>}
    </div>
  );
}

function RegistrationCount({ election, closed }: { election: OnchainElection; closed?: boolean }) {
  const { data } = useRegistrationCount(election);
  if (!data || (closed && data.count === 0)) return null;
  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-400">
      {data.count} {data.count === 1 ? "voter has" : "voters have"} registered so far.
    </p>
  );
}

function VoterList({ election }: { election: OnchainElection }) {
  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-400">
      The voter list has {election.voterCount} {election.voterCount === 1 ? "voter" : "voters"}.
      Root <Mono value={election.voterRoot} />,{" "}
      <a
        href={ipfsUrl(election.voterListCid)}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        full list on IPFS
      </a>
      .
    </p>
  );
}

function PublishingMessage({ election }: { election: OnchainElection }) {
  const { data } = useRegistrationCount(election);
  return data?.count === 0
    ? "Registration closed with nobody registered, so there is no voter list to publish and this election cannot go ahead. Its authority can cancel it."
    : "Registration has closed, and the registrar is publishing the voter list.";
}

interface Step {
  message: ReactNode;
  details?: ReactNode;
  actions?: ReactNode;
  /** The next time something becomes possible. */
  next?: number;
}

/**
 * Registration has closed and the voter list is not out yet. The registrar publishes it by itself
 * unless nobody registered, and once voting is due to open it can no longer be published.
 */
function awaitingList(election: OnchainElection, now: number): Step {
  if (now >= election.schedule.votingStart) {
    return {
      message:
        "The voter list was not published before voting was due to open, so this election cannot go ahead. Its authority can cancel it.",
    };
  }
  return {
    message: <PublishingMessage election={election} />,
    details: <RegistrationCount election={election} closed />,
    actions: <PublishButton election={election} />,
  };
}

/** What is happening in the election now, and what anyone can do next. */
function currentStep(election: OnchainElection, now: number): Step {
  const { schedule, address } = election;
  const published = election.voterListCid !== "";

  switch (election.phase) {
    case Phase.Created:
      if (now < schedule.registrationStart) {
        return {
          message: `Registration opens ${formatRelative(schedule.registrationStart, now)}.`,
          next: schedule.registrationStart,
        };
      }
      if (now >= schedule.registrationEnd) {
        // Nobody recorded that registration opened; the registrar does so when it publishes.
        return awaitingList(election, now);
      }
      // Registration is open from its start time; recording it on-chain is bookkeeping.
      return {
        message: `Registration is open until ${formatTime(schedule.registrationEnd)}.`,
        details: <RegistrationCount election={election} />,
        actions: (
          <>
            <LinkButton href={`/elections/${address}/register`}>Register to vote</LinkButton>
            <ActionButton election={address} step="openRegistration" variant="secondary">
              Record on-chain that registration is open
            </ActionButton>
          </>
        ),
        next: schedule.registrationEnd,
      };

    case Phase.Registration:
      if (!published && now < schedule.registrationEnd) {
        return {
          message: `Registration is open until ${formatTime(schedule.registrationEnd)}.`,
          details: <RegistrationCount election={election} />,
          actions: (
            <LinkButton href={`/elections/${address}/register`}>Register to vote</LinkButton>
          ),
          next: schedule.registrationEnd,
        };
      }
      if (!published) return awaitingList(election, now);
      if (now < schedule.votingStart) {
        return {
          message: `The voter list is published, and voting opens ${formatRelative(schedule.votingStart, now)}. Until then, voters can check that they are on it.`,
          details: <VoterList election={election} />,
          actions: (
            <LinkButton href={`/elections/${address}/vote`} variant="secondary">
              Check that you are on the list
            </LinkButton>
          ),
          next: schedule.votingStart,
        };
      }
      if (now >= schedule.votingEnd) {
        return {
          message:
            "The voting window passed without voting opening, so this election cannot go ahead. Its authority can cancel it.",
          details: <VoterList election={election} />,
        };
      }
      return {
        message: "Voting can open now.",
        details: <VoterList election={election} />,
        actions: (
          <ActionButton election={address} step="openVoting">
            Open voting
          </ActionButton>
        ),
      };

    case Phase.Voting:
      if (now < schedule.votingEnd) {
        return {
          message: `Voting is open until ${formatTime(schedule.votingEnd)}.`,
          details: <VoterList election={election} />,
          actions: (
            <LinkButton href={`/elections/${address}/vote`}>Go to the ballot booth</LinkButton>
          ),
          next: schedule.votingEnd,
        };
      }
      return {
        message: "Voting has ended and can be closed.",
        actions: (
          <ActionButton election={address} step="closeVoting">
            Close voting
          </ActionButton>
        ),
      };

    case Phase.Tallying:
      return {
        message: "Voting is closed. Finalizing records the winners permanently.",
        actions: (
          <ActionButton election={address} step="finalize">
            Finalize the result
          </ActionButton>
        ),
      };

    case Phase.Finalized:
      return { message: "The result is final and can no longer change." };

    default:
      return { message: "This election was cancelled." };
  }
}

export function NextStep({ election, now }: { election: OnchainElection; now: number }) {
  const step = currentStep(election, now);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{step.message}</p>
      {step.details}
      {/* Keyed by phase, so a step's button never shows the previous step's transaction. */}
      {step.actions && (
        <div key={election.phase} className="flex flex-wrap items-start gap-3">
          {step.actions}
        </div>
      )}
      {step.next !== undefined && <SkipAhead to={step.next} />}
    </div>
  );
}
