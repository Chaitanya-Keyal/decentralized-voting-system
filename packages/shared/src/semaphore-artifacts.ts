// The Semaphore v4 proving files (circuit and proving key) for each tree depth, pinned by hash in
// semaphore-artifacts.json. They are the published trusted-setup artifacts, version 4.13.0, which
// @semaphore-protocol/proof 4.14.5 asks for. Every hash was checked against the npm package
// @zk-kit/semaphore-artifacts@4.13.0, whose tarball matched the registry's integrity hash, and
// against the files served at its URL. The contract tests then verify proofs made with these files
// against Semaphore's on-chain verifier, which ties the proving keys to the deployed one.
import manifest from "./semaphore-artifacts.json";

/** Where the files are published. The web app serves its own copies, checked against the hashes. */
export const SEMAPHORE_ARTIFACTS_URL = manifest.url;

export interface ArtifactFile {
  sha256: string;
  bytes: number;
}

export function semaphoreArtifactName(depth: number, kind: "wasm" | "zkey"): string {
  return `semaphore-${depth}.${kind}`;
}

/** The pinned hash and size of one file, or undefined beyond the pinned depths. */
export function semaphoreArtifact(depth: number, kind: "wasm" | "zkey"): ArtifactFile | undefined {
  const files = (manifest.files as Record<string, Record<string, ArtifactFile> | undefined>)[
    String(depth)
  ];
  return files?.[kind];
}
