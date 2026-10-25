"use client";

import { useState } from "react";
import { createTestClient, http } from "viem";
import { usePublicClient } from "wagmi";

import { chain, isLocalChain, rpcUrl } from "@/lib/env";
import { describeError } from "@/lib/errors";
import { formatTime } from "@/lib/time";

import { Button } from "../ui";

/**
 * Development only: moves Anvil's clock forward to `to`, so the next step can be tried without
 * waiting for it. A real chain's clock cannot be moved.
 */
export function SkipAhead({ to }: { to: number }) {
  const client = usePublicClient();
  const [problem, setProblem] = useState<string>();
  if (!isLocalChain) return null;

  async function skip() {
    setProblem(undefined);
    try {
      const node = createTestClient({ chain, mode: "anvil", transport: http(rpcUrl) });
      const latest = await client?.getBlock();
      if (latest && BigInt(to) > latest.timestamp) {
        await node.setNextBlockTimestamp({ timestamp: BigInt(to) });
      }
      await node.mine({ blocks: 1 });
    } catch (error) {
      setProblem(describeError(error));
    }
  }

  return (
    <div className="flex flex-col gap-1 border-t border-dashed border-zinc-300 pt-3 text-xs text-zinc-500 dark:border-zinc-700">
      <div className="flex flex-wrap items-center gap-2">
        <span>Anvil only:</span>
        <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => void skip()}>
          Move the chain&apos;s clock to {formatTime(to)}
        </Button>
      </div>
      {problem && <span className="text-red-600">{problem}</span>}
    </div>
  );
}
