import type { Address } from "viem";

import { deployments } from "./generated";

export interface Deployment {
  chainId: number;
  /** Block to start reading events from. */
  startBlock: number;
  electionFactory: Address;
  merkleElection: Address;
}

/** The contracts deployed on a chain, from contracts/deployments. */
export function deploymentFor(chainId: number): Deployment | undefined {
  return (deployments as Record<string, Deployment | undefined>)[String(chainId)];
}
