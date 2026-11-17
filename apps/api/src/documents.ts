import { merkleElectionAbi } from "@dvote/shared";
import type { FastifyBaseLogger } from "fastify";
import type { Address } from "viem";

import { publicClient } from "./chain";
import { env } from "./env";
import { copyToPinata, type Document } from "./ipfs";

/**
 * An election's documents on IPFS, as its contract names them: its voter list, its description and
 * each candidate's manifesto. Pass the list's CID when it was only just published, and a node
 * may not report it yet.
 */
export async function electionDocuments(election: Address, listCid?: string): Promise<Document[]> {
  const contract = { address: election, abi: merkleElectionAbi } as const;
  const [voterListCid, metadataCid, candidates] = await Promise.all([
    listCid ?? publicClient.readContract({ ...contract, functionName: "voterListCid" }),
    publicClient.readContract({ ...contract, functionName: "metadataCid" }),
    publicClient.readContract({ ...contract, functionName: "candidates" }),
  ]);
  const documents: Document[] = [];
  if (voterListCid) documents.push({ cid: voterListCid, name: `voter-list-${election}.json` });
  if (metadataCid) documents.push({ cid: metadataCid, name: `election-${election}.json` });
  candidates.forEach(({ manifestoCid }, index) => {
    if (manifestoCid)
      documents.push({ cid: manifestoCid, name: `manifesto-${index}-${election}.json` });
  });
  return documents;
}

/**
 * Copies a just-published election's documents to Pinata, when PINATA_JWT is set. Never rejects,
 * so that it can run after publication without anyone waiting on it.
 */
export async function copyElectionToPinata(
  election: Address,
  listCid: string,
  log: FastifyBaseLogger,
): Promise<void> {
  if (!env.PINATA_JWT) return;
  try {
    const { copied, failed } = await copyToPinata(await electionDocuments(election, listCid), log);
    log.info({ election, copied, failed }, "Copied the election's documents to Pinata");
  } catch (error) {
    log.warn({ election, err: error }, "Could not copy the election's documents to Pinata");
  }
}
