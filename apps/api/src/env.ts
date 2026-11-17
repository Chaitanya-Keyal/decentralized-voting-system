import { addressSchema } from "@dvote/shared";
import { z } from "zod";

import { addressListSchema, loadSettings, optional, privateKeySchema } from "./settings";

loadSettings();

const schema = z
  .object({
    // Localhost by default; set HOST=0.0.0.0 to reach the API from a phone on the same network.
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().positive().default(4000),
    /** The web app's origins, comma-separated, allowed by CORS. */
    WEB_ORIGIN: z.string().default("http://localhost:3000,http://127.0.0.1:3000"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required; see .env.example"),

    RPC_URL: z.url().default("http://127.0.0.1:8545"),
    CHAIN_ID: z.coerce.number().int().default(31337),
    /** On a testnet, the registrar's key. */
    REGISTRAR_PRIVATE_KEY: optional(privateKeySchema),
    /** On Anvil, an account the node has unlocked, used instead of a key. */
    REGISTRAR_ADDRESS: optional(addressSchema),
    /**
     * Comma-separated authorities whose elections the registrar serves. Empty serves any, which is
     * allowed only on Anvil: anyone can create an election naming this registrar, and it pays to
     * publish each one's list.
     */
    AUTHORITIES: addressListSchema,

    /**
     * Comma-separated elections to leave off the list of elections, such as measurement runs whose
     * documents were never published. They stay reachable by their address.
     */
    HIDDEN_ELECTIONS: addressListSchema,

    IPFS_API_URL: z.url().default("http://127.0.0.1:5001"),
    /**
     * A Pinata API key (its JWT) that may upload files. With it, each voter list the registrar
     * publishes is copied to Pinata with its election's documents, so that any IPFS gateway can
     * serve them, not only this server's node. Without it, nothing is copied.
     */
    PINATA_JWT: optional(z.string().trim()),
    PINATA_UPLOAD_URL: z.url().default("https://uploads.pinata.cloud/v3/files"),

    /** Only addresses at this domain can register. */
    EMAIL_DOMAIN: z.string().default("hyderabad.bits-pilani.ac.in"),
    /** For email codes. Without it, on Anvil only, codes are written to the log instead. */
    SMTP_URL: optional(z.string()),
    /** Google sign-in: the OAuth client ID of the web app. Unset turns Google sign-in off. */
    GOOGLE_CLIENT_ID: optional(z.string()),
    GOOGLE_JWKS_URL: z.url().default("https://www.googleapis.com/oauth2/v3/certs"),
    MAIL_FROM: optional(z.string()).default("DVote <no-reply@dvote.local>"),
    /**
     * How many proxies sit in front of the API and set X-Forwarded-For, so that its limits see each
     * client's address rather than the proxy's. 0 when clients connect directly.
     */
    API_TRUSTED_PROXIES: z.coerce.number().int().min(0).default(0),
    /** Multiplies every per-client limit; the test suite, all from one address, raises it. */
    API_RATE_LIMIT_FACTOR: z.coerce.number().positive().default(1),
  })

  .refine((env) => env.REGISTRAR_PRIVATE_KEY ?? env.REGISTRAR_ADDRESS, {
    message: "Set REGISTRAR_PRIVATE_KEY, or REGISTRAR_ADDRESS for an account Anvil has unlocked",
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;

/**
 * Why voters would have no way to prove their address, if they would not. A code in a log can be
 * read by whoever reads the log, so a public chain needs real email, or Google sign-in alone.
 * Without either, registration is off.
 */
export function emailProofProblem(settings: {
  SMTP_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  CHAIN_ID: number;
}): string | undefined {
  if (settings.SMTP_URL !== undefined || settings.GOOGLE_CLIENT_ID !== undefined) return undefined;
  if (settings.CHAIN_ID === 31337) return undefined;
  return "Set SMTP_URL or GOOGLE_CLIENT_ID; only on Anvil (CHAIN_ID 31337) may codes be logged";
}
