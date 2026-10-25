"use client";

import { merkleElectionAbi } from "@dvote/shared";
import type { Address } from "viem";
import { useConfig } from "wagmi";
import { simulateContract, writeContract } from "wagmi/actions";

import { chain, simulateAt } from "@/lib/env";
import { useTransaction } from "@/lib/transaction";
import { useWallet } from "@/lib/wallet";

import { TransactionStatus } from "../transaction-status";
import { Button } from "../ui";

/** The election's steps that take no arguments. */
export type ElectionStep =
  "openRegistration" | "openVoting" | "closeVoting" | "finalize" | "cancel";

/** Sends one of the election's steps from the connected wallet. */
export function ActionButton({
  election,
  step,
  children,
  variant,
}: {
  election: Address;
  step: ElectionStep;
  children: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const config = useConfig();
  const { account, ready, blocker } = useWallet();
  const transaction = useTransaction();

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant={variant}
          disabled={!ready || transaction.busy}
          title={blocker}
          onClick={() =>
            void transaction.send(async () => {
              const { request } = await simulateContract(config, {
                ...simulateAt,
                chainId: chain.id,
                account,
                address: election,
                abi: merkleElectionAbi,
                functionName: step,
              });
              return writeContract(config, request);
            })
          }
        >
          {children}
        </Button>
      </div>
      <TransactionStatus state={transaction.state} />
    </div>
  );
}
