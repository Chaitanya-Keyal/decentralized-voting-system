"use client";

import { useState } from "react";
import type { Hex, TransactionReceipt } from "viem";
import { useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

import { chain, isLocalChain } from "./env";
import { describeError } from "./errors";

/** How long to wait for a transaction to be mined before saying so. It may still be mined later. */
const RECEIPT_TIMEOUT_MS = isLocalChain ? 30_000 : 180_000;

export type TransactionState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "confirming"; hash: Hex }
  | { status: "done"; hash: Hex; receipt: TransactionReceipt }
  | { status: "failed"; message: string };

/**
 * Runs one transaction at a time: `send` takes a function that submits it (usually a simulation
 * followed by a write, so a revert shows its reason before the wallet is asked), then waits for
 * the receipt.
 */
export function useTransaction() {
  const config = useConfig();
  const [state, setState] = useState<TransactionState>({ status: "idle" });

  async function send(submit: () => Promise<Hex>): Promise<TransactionReceipt | undefined> {
    setState({ status: "pending" });
    try {
      const hash = await submit();
      setState({ status: "confirming", hash });
      const receipt = await waitForTransactionReceipt(config, {
        hash,
        chainId: chain.id,
        timeout: RECEIPT_TIMEOUT_MS,
      });
      if (receipt.status !== "success") throw new Error("The transaction reverted.");
      setState({ status: "done", hash, receipt });
      return receipt;
    } catch (error) {
      setState({ status: "failed", message: describeError(error) });
      return undefined;
    }
  }

  const busy = state.status === "pending" || state.status === "confirming";
  return { state, send, busy, reset: () => setState({ status: "idle" }) };
}
