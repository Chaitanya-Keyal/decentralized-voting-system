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
  /**
   * Factories of an earlier deployment of the same contracts. Their elections are still genuine
   * and still read; new elections come from the factories above.
   */
  earlierFactories?: readonly Address[];
}

/** The contracts deployed on a chain, or undefined if none are. */
export function deploymentFor(chainId: number): Deployment | undefined {
  return (deployments as Record<string, Deployment | undefined>)[String(chainId)];
}

/** Every factory of this deployment: an election is genuine if any of them created it. */
export function electionFactories(deployment: Deployment): Address[] {
  return [
    deployment.electionFactory,
    deployment.semaphoreFactory,
    ...(deployment.earlierFactories ?? []),
  ];
}

/** The factory for a tier. */
export function factoryFor(deployment: Deployment, tier: 2 | 3): Address {
  return tier === 3 ? deployment.semaphoreFactory : deployment.electionFactory;
}
