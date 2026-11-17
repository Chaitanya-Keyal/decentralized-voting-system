// The relayer's settings. It is a separate process from the registrar, with its own key and its
// own store (Redis), and needs no access to the registrar's database: the registrar knows who
// registered, the relayer sees ballots, and keeping them apart keeps that knowledge apart.
import { addressSchema, deploymentFor } from "@dvote/shared";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { anvil, sepolia } from "viem/chains";
import { z } from "zod";

import { addressListSchema, loadSettings, optional, privateKeySchema } from "../settings";

loadSettings();

const schema = z
  .object({
    RELAYER_HOST: z.string().default("127.0.0.1"),
    RELAYER_PORT: z.coerce.number().int().positive().default(4100),
    WEB_ORIGIN: z.string().default("http://localhost:3000,http://127.0.0.1:3000"),
    RPC_URL: z.url().default("http://127.0.0.1:8545"),
    CHAIN_ID: z.coerce.number().int().default(31337),
    REDIS_URL: z.string().default("redis://127.0.0.1:6380"),
    /** Keeps several relayers, or test runs, apart in one Redis. */
    RELAYER_PREFIX: z.string().default("dvote-relayer"),
    RELAYER_PRIVATE_KEY: optional(privateKeySchema),
    /** On Anvil, an account the node has unlocked, used instead of a key. */
    RELAYER_ADDRESS: optional(addressSchema),
    /**
     * Comma-separated authorities whose elections the relayer pays ballots for, as for the
     * registrar. Empty pays for any, which is allowed only on Anvil: anyone can create an anonymous
     * election, and every ballot costs the relayer gas.
     */
    AUTHORITIES: addressListSchema,
    /**
     * How many proxies sit in front of the relayer and set X-Forwarded-For, so that the rate limit
     * sees each client's address rather than the proxy's. 0 when clients connect directly. Never
     * more than there really are, or a client could choose its own address.
     */
    RELAYER_TRUSTED_PROXIES: z.coerce.number().int().min(0).default(0),
    /**
     * Ballots one client may submit per minute. A room of voters on one network shares one
     * address, so this is generous; each ballot is still limited to one per voter.
     */
    RELAYER_RATE_LIMIT: z.coerce.number().int().positive().default(120),
    /**
     * Ballots in flight at once. They are still sent one at a time, in nonce order, but the relayer
     * does not wait for one to be mined before sending the next, so a burst of voters shares blocks.
     * 1 waits for each ballot's block before sending the next.
     */
    RELAYER_CONCURRENCY: z.coerce.number().int().positive().default(64),
    /**
     * How long to wait for a ballot's transaction before sending it again at the same nonce with
     * higher fees.
     */
    RELAYER_RECEIPT_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
    /**
     * The least priority fee (tip) a ballot offers, in wei: 0.1 gwei by default. On a quiet
     * testnet a node may suggest a tip of a few wei, and on Sepolia ballots offering that waited an
     * extra block or two more often.
     */
    RELAYER_MIN_PRIORITY_FEE_WEI: z.coerce.bigint().nonnegative().default(100_000_000n),
  })
  .refine((env) => env.RELAYER_PRIVATE_KEY ?? env.RELAYER_ADDRESS, {
    message: "Set RELAYER_PRIVATE_KEY, or RELAYER_ADDRESS for an account Anvil has unlocked",
  })
  .refine((env) => env.CHAIN_ID === anvil.id || env.AUTHORITIES.length > 0, {
    message: "Set AUTHORITIES: on a public chain the relayer pays only for their elections",
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid relayer environment:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}
export const config = parsed.data;

const found = [anvil, sepolia].find((candidate) => candidate.id === config.CHAIN_ID);
if (!found) throw new Error(`CHAIN_ID ${config.CHAIN_ID} is not supported`);
export const chain = found;

const deployed = deploymentFor(chain.id);
if (!deployed)
  throw new Error(`Nothing is deployed on chain ${chain.id}; see contracts/deployments`);
export const deployment = deployed;

const pollingInterval = chain.id === anvil.id ? 100 : 4_000;

export const publicClient = createPublicClient({
  chain,
  pollingInterval,
  transport: http(config.RPC_URL),
});

/**
 * Pays for ballots. Its address is public. A ballot tells it nothing about the voter, and it keeps
 * no record of where ballots came from.
 */
export const relayer = createWalletClient({
  account: config.RELAYER_PRIVATE_KEY
    ? privateKeyToAccount(config.RELAYER_PRIVATE_KEY)
    : config.RELAYER_ADDRESS!,
  chain,
  pollingInterval,
  transport: http(config.RPC_URL),
});

export const simulateAt = chain.id === anvil.id ? ({ blockTag: "pending" } as const) : {};
