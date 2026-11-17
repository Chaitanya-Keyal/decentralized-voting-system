"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { usePublicClient } from "wagmi";

import { auditSteps, runAudit, type AuditStep } from "@/lib/audit";
import type { OnchainElection } from "@/lib/election";

import { Button, muted, Spinner } from "../ui";

function Mark({ status }: { status: AuditStep["status"] }) {
  if (status === "running") return <Spinner />;
  const styles = {
    waiting: "border border-zinc-300 dark:border-zinc-700",
    pass: "bg-emerald-600 text-white",
    fail: "bg-red-600 text-white",
  } as const;
  return (
    <>
      <span
        aria-hidden
        className={`inline-flex size-4 shrink-0 items-center justify-center rounded-full ${styles[status]}`}
      >
        {status === "pass" && <Check className="size-3" strokeWidth={3} />}
        {status === "fail" && <X className="size-3" strokeWidth={3} />}
      </span>
      {status !== "waiting" && (
        <span className="sr-only">{status === "pass" ? "Passed: " : "Failed: "}</span>
      )}
    </>
  );
}

/**
 * Lets anyone check the election for themselves: the voter list against the root, every ballot
 * from the chain's own log, every proof, and the count. It reads only the chain and IPFS.
 */
export function Audit({ election }: { election: OnchainElection }) {
  const client = usePublicClient();
  const [steps, setSteps] = useState<AuditStep[]>();
  const running = steps?.some((step) => step.status === "running") ?? false;

  async function start() {
    if (!client) return;
    setSteps(auditSteps(election));
    await runAudit(client, election, (id, status, detail) =>
      setSteps((current) =>
        current?.map((step) => (step.id === id ? { ...step, status, detail } : step)),
      ),
    );
  }

  const failed = steps?.some((step) => step.status === "fail");
  const done = steps && !running && steps.every((step) => step.status !== "waiting");

  return (
    <div className="flex flex-col gap-4 text-sm">
      {steps && (
        <ol role="list" className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.id} className="flex gap-3">
              <span className="mt-0.5 flex">
                <Mark status={step.status} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span>{step.title}</span>
                {step.detail && (
                  <span
                    className={
                      step.status === "fail"
                        ? "text-xs wrap-anywhere text-red-700 dark:text-red-400"
                        : `text-xs wrap-anywhere ${muted}`
                    }
                  >
                    {step.detail}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {done && (
        <p
          role="status"
          className={
            failed ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"
          }
        >
          {failed
            ? "The audit found a problem. Each failed check says what did not match."
            : "Every check passed, using only the chain and IPFS."}
        </p>
      )}
      <div>
        <Button
          variant="secondary"
          onClick={() => void start()}
          disabled={running || !client || election.voterListCid === ""}
        >
          {running && <Spinner />} {steps ? "Run the audit again" : "Run the audit"}
        </Button>
      </div>
    </div>
  );
}
