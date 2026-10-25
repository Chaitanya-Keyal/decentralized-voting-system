// Settings the browser needs. They default to the local setup (Anvil, the API on port 4000 and
// the IPFS node from docker compose); set the NEXT_PUBLIC_ variables to point anywhere else.
import type { Chain } from "viem";
import { anvil, sepolia } from "viem/chains";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? anvil.id);

const supported = [anvil, sepolia] as const;
const found = supported.find((candidate) => candidate.id === chainId);
if (!found) throw new Error(`NEXT_PUBLIC_CHAIN_ID ${chainId} is not supported`);

export const chain: Chain = found;

export const isLocalChain = chain.id === anvil.id;

/**
 * Where to simulate transactions. A simulation against Anvil's latest block runs at that block's
 * time, so after an idle spell a step that is due would appear too early; the pending block has
 * the current time.
 */
export const simulateAt = isLocalChain ? ({ blockTag: "pending" } as const) : {};

/** The node the browser reads from, which Anvil's development wallets also send through. */
export const rpcUrl: string =
  process.env.NEXT_PUBLIC_RPC_URL ?? chain.rpcUrls.default.http[0] ?? "http://127.0.0.1:8545";

export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";

export const ipfsGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? "http://127.0.0.1:8080";

/** A block explorer link for a transaction, where the chain has an explorer. */
export function explorerTx(hash: string): string | undefined {
  const explorer = chain.blockExplorers?.default.url;
  return explorer ? `${explorer}/tx/${hash}` : undefined;
}
