import type { z } from "zod";

import { ipfsGateway } from "./env";

export function ipfsUrl(cid: string): string {
  return `${ipfsGateway}/ipfs/${cid}`;
}

/** Downloads a JSON document from the IPFS gateway and checks its shape. */
export async function fetchFromIpfs<T extends z.ZodType>(
  schema: T,
  cid: string,
): Promise<z.output<T>> {
  const response = await fetch(ipfsUrl(cid));
  if (!response.ok) throw new Error(`The IPFS gateway answered ${response.status} for ${cid}`);
  return schema.parse(await response.json());
}
