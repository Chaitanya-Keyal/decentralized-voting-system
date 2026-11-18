import type { Address } from "viem";

import { deployments } from "./generated";

/** The contracts deployed on a chain, from contracts/deployments. */
export interface Deployment {
  chainId: number;
  /** Block to start reading events from. */
  startBlock: number;
  /** Tier 2: the election implementation and the factory that clones it. */
  merkleElection: Address;
  electionFactory: Address;
  /** Tier 3: Semaphore's verifier, the election and its factory. */
  semaphoreVerifier: Address;
  semaphoreElection: Address;
  semaphoreFactory: Address;
}

/** The contracts deployed on a chain, or undefined if none are. */
export function deploymentFor(chainId: number): Deployment | undefined {
  return (deployments as Record<string, Deployment | undefined>)[String(chainId)];
}

/** Both factories of this deployment: an election is genuine if either created it. */
export function electionFactories(deployment: Deployment): Address[] {
  return [deployment.electionFactory, deployment.semaphoreFactory];
}

/** The factory for a tier. */
export function factoryFor(deployment: Deployment, tier: 2 | 3): Address {
  return tier === 3 ? deployment.semaphoreFactory : deployment.electionFactory;
}
