import { z } from "zod";

import { env } from "./env";

const addResponse = z.object({ Hash: z.string() });

/** Long enough for a large voter list, short enough that a stuck node does not hold up the API. */
const TIMEOUT_MS = 30_000;

/** Adds a JSON document to the IPFS node and pins it there. Returns its CID. */
export async function pinJson(value: unknown, name: string): Promise<string> {
  const body = new FormData();
  body.append("file", new Blob([JSON.stringify(value)], { type: "application/json" }), name);

  const response = await fetch(`${env.IPFS_API_URL}/api/v0/add?cid-version=1&pin=true`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`IPFS add failed with ${response.status}: ${await response.text()}`);
  }
  return addResponse.parse(await response.json()).Hash;
}
