// Settings the browser needs. They default to the local setup (Anvil, the API on port 4000 and
// the IPFS node from docker compose); set the NEXT_PUBLIC_ variables to point anywhere else.
import type { Chain } from "viem";
import { anvil, sepolia } from "viem/chains";

/** A build setting, where an empty one (as an unset build argument gives) counts as unset. */
function setting(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

const chainId = Number(setting(process.env.NEXT_PUBLIC_CHAIN_ID) ?? anvil.id);

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

/**
 * The nodes the browser reads from, in order of preference; NEXT_PUBLIC_RPC_URL may list several,
 * separated by commas, and a request that fails on one is tried on the next.
 */
export const rpcUrls: string[] = (
  setting(process.env.NEXT_PUBLIC_RPC_URL) ??
  chain.rpcUrls.default.http[0] ??
  "http://127.0.0.1:8545"
)
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

/** The first of them, which Anvil's development wallets also send through. */
export const rpcUrl: string = rpcUrls[0] ?? "http://127.0.0.1:8545";

export const apiUrl = setting(process.env.NEXT_PUBLIC_API_URL) ?? "http://127.0.0.1:4000";

/** The relayer, which submits anonymous ballots and pays their gas. */
export const relayerUrl = setting(process.env.NEXT_PUBLIC_RELAYER_URL) ?? "http://127.0.0.1:4100";

export const ipfsGateway = setting(process.env.NEXT_PUBLIC_IPFS_GATEWAY) ?? "http://127.0.0.1:8080";

/** A block explorer link for a transaction, where the chain has an explorer. */
export function explorerTx(hash: string): string | undefined {
  const explorer = chain.blockExplorers?.default.url;
  return explorer ? `${explorer}/tx/${hash}` : undefined;
}
