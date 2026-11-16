"use client";

import { voterTreeDepth, type AnonymousBallot } from "@dvote/shared";
import type { Identity } from "@dvote/shared";
import type { Address } from "viem";

import { provingFiles } from "./artifacts";
import type { ProveRequest, ProveResponse } from "./prover.worker";

export type ProvingStage = "downloading" | "proving";

/**
 * Proves a ballot in a Web Worker: downloads and checks the proving files for the election's tree
 * depth, then proves membership, the choice and the election in one zero-knowledge proof. Returns
 * the ballot and how long proving itself took, for evaluation parameter B2.
 */
export async function proveInBrowser(args: {
  identity: Identity;
  commitments: string[];
  election: Address;
  choice: bigint;
  onStage?: (stage: ProvingStage) => void;
}): Promise<{ ballot: AnonymousBallot; provingMs: number }> {
  args.onStage?.("downloading");
  const { wasm, zkey } = await provingFiles(voterTreeDepth(args.commitments.length));
  args.onStage?.("proving");
  const worker = new Worker(new URL("./prover.worker.ts", import.meta.url), { type: "module" });
  const started = performance.now();
  try {
    const response = await new Promise<ProveResponse>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<ProveResponse>) => resolve(event.data);
      worker.onerror = (event) => reject(new Error(event.message || "The prover stopped."));
      const request: ProveRequest = {
        identity: args.identity.export(),
        commitments: args.commitments,
        election: args.election,
        choice: args.choice.toString(),
        wasm,
        zkey,
      };
      worker.postMessage(request);
    });
    if (!response.ok) throw new Error(`The proof could not be made: ${response.error}`);
    return {
      ballot: {
        choice: BigInt(response.choice),
        nullifier: BigInt(response.nullifier),
        points: response.points.map((point) =>
          BigInt(point),
        ) as unknown as AnonymousBallot["points"],
      },
      provingMs: performance.now() - started,
    };
  } finally {
    worker.terminate();
  }
}
