import type { z } from "zod";

import { ipfsGateway, publicIpfsGateway } from "./env";

/** Long enough for a large voter list on a slow phone. */
const TIMEOUT_MS = 30_000;

export function ipfsUrl(cid: string): string {
  return `${ipfsGateway}/ipfs/${cid}`;
}

/** The same document on a public gateway run by others, where this chain's documents are copied. */
export function publicIpfsUrl(cid: string): string | undefined {
  return publicIpfsGateway ? `${publicIpfsGateway}/ipfs/${cid}` : undefined;
}

/**
 * Downloads a JSON document and checks its shape: from this site's gateway, or if that fails, from
 * a public one, whose answer is taken only if it hashes to the CID.
 */
export async function fetchFromIpfs<T extends z.ZodType>(
  schema: T,
  cid: string,
): Promise<z.output<T>> {
  return schema.parse(JSON.parse(new TextDecoder().decode(await download(cid))));
}

async function download(cid: string): Promise<Uint8Array> {
  try {
    return await bytesFrom(ipfsUrl(cid));
  } catch (error) {
    const elsewhere = publicIpfsUrl(cid);
    if (!elsewhere || !rawDigest(cid)) throw error;
    const bytes = await bytesFrom(elsewhere);
    if (!(await hashesTo(cid, bytes))) throw new Error(`${elsewhere} sent a different document`);
    return bytes;
  }
}

async function bytesFrom(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function hashesTo(cid: string, bytes: Uint8Array): Promise<boolean> {
  const expected = rawDigest(cid);
  if (!expected) return false;
  const actual = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return (
    actual.length === expected.length && actual.every((byte, index) => byte === expected[index])
  );
}

/**
 * The SHA-256 digest a CID names, for a document stored whole in one raw block: a CIDv1 in base32
 * whose bytes are version 1, the raw codec, then sha2-256 and its 32-byte digest. Documents up to
 * 256 KiB are stored that way, which covers every description and manifesto, and voter lists of a
 * few thousand voters. Larger ones are split into blocks, and come only from this site's gateway.
 */
function rawDigest(cid: string): Uint8Array | undefined {
  if (!cid.startsWith("b")) return undefined;
  const bytes = base32(cid.slice(1));
  const RAW_SHA256 = [0x01, 0x55, 0x12, 0x20];
  if (bytes?.length !== 36 || RAW_SHA256.some((byte, index) => bytes[index] !== byte)) {
    return undefined;
  }
  return bytes.slice(4);
}

/** RFC 4648 base32, lower case and unpadded, as multibase's "b" prefix means. */
function base32(text: string): Uint8Array | undefined {
  const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes: number[] = [];
  let value = 0;
  let bits = 0;
  for (const char of text) {
    const digit = ALPHABET.indexOf(char);
    if (digit === -1) return undefined;
    value = ((value << 5) | digit) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}
