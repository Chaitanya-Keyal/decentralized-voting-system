// Proves a tier 3 ballot off the main thread, so the page stays responsive while the proof is
// made. The voter's secret arrives here from the page and leaves only as a zero-knowledge proof.
import { Identity, identityTree, proveBallot } from "@dvote/shared";
import type { Address } from "viem";

export interface ProveRequest {
  identity: string;
  commitments: string[];
  election: Address;
  choice: string;
  wasm: Uint8Array;
  zkey: Uint8Array;
}

export type ProveResponse =
  { ok: true; choice: string; nullifier: string; points: string[] } | { ok: false; error: string };

self.onmessage = async (event: MessageEvent<ProveRequest>) => {
  const { identity, commitments, election, choice, wasm, zkey } = event.data;
  try {
    const ballot = await proveBallot({
      identity: Identity.import(identity),
      tree: identityTree(commitments),
      election,
      choice: BigInt(choice),
      // snarkjs reads circuits and keys from bytes as well as from URLs.
      artifacts: () => ({ wasm: wasm as unknown as string, zkey: zkey as unknown as string }),
    });
    const response: ProveResponse = {
      ok: true,
      choice: ballot.choice.toString(),
      nullifier: ballot.nullifier.toString(),
      points: ballot.points.map(String),
    };
    self.postMessage(response);
  } catch (error) {
    const response: ProveResponse = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
