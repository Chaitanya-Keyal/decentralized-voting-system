"use client";

import { useAccount } from "wagmi";

import { chain } from "./env";

/**
 * The connected wallet, and whether it can act: it must be on the chain DVote is configured for.
 * A transaction sent from a wallet on another network would land on that network instead, and
 * signatures for DVote name its chain, so wallets refuse them anywhere else.
 */
export function useWallet() {
  const { address, chainId } = useAccount();
  const ready = address !== undefined && chainId === chain.id;
  const blocker =
    address === undefined
      ? "Connect a wallet first"
      : ready
        ? undefined
        : `Switch your wallet to ${chain.name} first`;
  return { account: address, ready, blocker };
}
