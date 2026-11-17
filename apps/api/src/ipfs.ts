import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";

import { env } from "./env";
import { loggable } from "./redact";

const addResponse = z.object({ Hash: z.string() });
const uploadResponse = z.object({ data: z.object({ cid: z.string() }) });

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

export interface Document {
  cid: string;
  /** A name to list it under at Pinata. */
  name: string;
}

/**
 * Copies documents from the IPFS node to Pinata, a pinning service on the public IPFS network, so
 * that any gateway can serve them rather than only this server's. The node's own bytes are sent,
 * with the node's settings for building a CID, so Pinata must arrive at the same CID; a copy that
 * does not is reported and serves nobody, since the chain records the node's CID. Copying again
 * is harmless: Pinata keeps one copy of the same content. Does nothing without PINATA_JWT, and
 * never throws, so that a failed copy cannot hold up what it follows.
 */
export async function copyToPinata(
  documents: Document[],
  log: FastifyBaseLogger,
): Promise<{ copied: number; failed: number }> {
  let copied = 0;
  if (!env.PINATA_JWT) return { copied, failed: 0 };
  for (const { cid, name } of documents) {
    try {
      const body = new FormData();
      body.append("file", new Blob([await cat(cid)], { type: "application/json" }), name);
      body.append("network", "public");
      body.append("cid_version", "v1");
      const response = await fetch(env.PINATA_UPLOAD_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.PINATA_JWT}` },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(
          `Pinata answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
        );
      }
      const made = uploadResponse.parse(await response.json()).data.cid;
      if (made !== cid) throw new Error(`Pinata made ${made} of the same bytes`);
      copied += 1;
      log.info({ cid }, "Copied to Pinata");
    } catch (error) {
      log.warn({ cid, err: loggable(error) }, "Could not copy the document to Pinata");
    }
  }
  return { copied, failed: documents.length - copied };
}

/** Reads a document back from the IPFS node, byte for byte as it was added. */
async function cat(cid: string): Promise<ArrayBuffer> {
  const response = await fetch(`${env.IPFS_API_URL}/api/v0/cat?arg=${encodeURIComponent(cid)}`, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`IPFS cat failed with ${response.status}: ${await response.text()}`);
  }
  return response.arrayBuffer();
}
