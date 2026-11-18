import { sepolia } from "viem/chains";

import { chain, explorers } from "./env";
import { ipfsUrl, publicIpfsUrl } from "./ipfs";

/** A place outside this page where a reader can see something for themselves. */
export interface Source {
  name: string;
  /** Shown under the name, to say whose it is. */
  note?: string;
  href: string;
}

/** A transaction, with its events, on each public block explorer. */
export function transactionSources(hash: string): Source[] {
  return explorers.map(({ name, url }) => ({
    name,
    href: `${url}/tx/${hash}${name === "Etherscan" ? "#eventlog" : ""}`,
  }));
}

/** A contract or wallet on each public block explorer. */
export function addressSources(address: string): Source[] {
  return explorers.map(({ name, url }) => ({ name, href: `${url}/address/${address}` }));
}

/** The events a contract has emitted, on each public block explorer. */
export function eventSources(address: string): Source[] {
  return explorers.map(({ name, url }) => ({
    name,
    href: `${url}/address/${address}${name === "Etherscan" ? "#events" : "?tab=logs"}`,
  }));
}

/** A contract's verified source code: on Blockscout, and on Sourcify, which verified it. */
export function codeSources(address: string): Source[] {
  const blockscout = explorers.find(({ name }) => name === "Blockscout");
  return [
    ...(blockscout
      ? [{ name: "Blockscout", href: `${blockscout.url}/address/${address}?tab=contract` }]
      : []),
    ...(chain.id === sepolia.id
      ? [{ name: "Sourcify", href: `https://repo.sourcify.dev/${chain.id}/${address}` }]
      : []),
  ];
}

/**
 * A document on IPFS: on this site's own node, and on Pinata once it has a copy. The registrar
 * copies an election's documents there when it publishes the voter list. Either way the address
 * is a hash of the content, so any copy can be checked against it.
 */
export function documentSources(cid: string, copied: boolean): Source[] {
  const elsewhere = copied ? publicIpfsUrl(cid) : undefined;
  return [
    { name: "DVote's IPFS node", note: "this site's own", href: ipfsUrl(cid) },
    ...(elsewhere
      ? [{ name: "Pinata", note: "a public IPFS gateway, run by others", href: elsewhere }]
      : []),
  ];
}
