"use client";

// Semaphore's proving files, downloaded once per depth and checked against the hashes pinned in
// @dvote/shared before they are used. The web app serves its own copies from /semaphore (filled by
// `pnpm --filter @dvote/web artifacts`), and falls back to where they are published. Either way a
// file that does not match its pinned hash is refused, so a tampered proving key is never used.
import { SEMAPHORE_ARTIFACTS_URL, semaphoreArtifact, semaphoreArtifactName } from "@dvote/shared";

const SOURCES = ["/semaphore", SEMAPHORE_ARTIFACTS_URL];

const cache = new Map<string, Promise<Uint8Array>>();

async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function download(depth: number, kind: "wasm" | "zkey"): Promise<Uint8Array> {
  const pinned = semaphoreArtifact(depth, kind);
  if (!pinned) throw new Error(`Elections of this size need a deeper tree than DVote supports.`);
  const name = semaphoreArtifactName(depth, kind);
  let mismatch = false;
  for (const source of SOURCES) {
    const response = await fetch(`${source}/${name}`).catch(() => undefined);
    if (!response?.ok) continue;
    const data = new Uint8Array(await response.arrayBuffer());
    if ((await sha256(data)) === pinned.sha256) return data;
    mismatch = true;
  }
  throw new Error(
    mismatch
      ? "A proving file did not match its pinned hash, so it was not used."
      : "The proving files could not be downloaded. Check your connection and try again.",
  );
}

/** The checked circuit and proving key for a tree depth. */
export function provingFiles(depth: number): Promise<{ wasm: Uint8Array; zkey: Uint8Array }> {
  const get = (kind: "wasm" | "zkey") => {
    const name = semaphoreArtifactName(depth, kind);
    let file = cache.get(name);
    if (!file) {
      file = download(depth, kind);
      file.catch(() => cache.delete(name));
      cache.set(name, file);
    }
    return file;
  };
  return Promise.all([get("wasm"), get("zkey")]).then(([wasm, zkey]) => ({ wasm, zkey }));
}

/** Bytes to download for a depth, for a progress message. */
export function provingFilesSize(depth: number): number {
  return (
    (semaphoreArtifact(depth, "wasm")?.bytes ?? 0) + (semaphoreArtifact(depth, "zkey")?.bytes ?? 0)
  );
}
