import { existsSync } from "node:fs";

import { addressSchema } from "@dvote/shared";
import { z } from "zod";

// The repository keeps one .env at its root. Variables that are already set take precedence.
const envFile = new URL("../../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

/** Treats an empty variable, such as `KEY=` in .env, as unset. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

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
    REGISTRAR_PRIVATE_KEY: optional(
      z
        .string()
        .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hex key")
        .transform((key) => key as `0x${string}`),
    ),
    /** On Anvil, an account the node has unlocked, used instead of a key. */
    REGISTRAR_ADDRESS: optional(addressSchema),
    /** Comma-separated authorities whose elections the registrar serves; empty serves any. */
    AUTHORITIES: z
      .string()
      .default("")
      .transform((list) => list.split(",").filter((entry) => entry.trim() !== ""))
      .pipe(z.array(z.string().trim().pipe(addressSchema))),

    IPFS_API_URL: z.url().default("http://127.0.0.1:5001"),

    /** Only addresses at this domain can register. */
    EMAIL_DOMAIN: z.string().default("hyderabad.bits-pilani.ac.in"),
    /** Required except on Anvil, where without it codes are written to the log instead. */
    SMTP_URL: optional(z.string()),
    MAIL_FROM: optional(z.string()).default("DVote <no-reply@dvote.local>"),
  })
  .refine((env) => env.REGISTRAR_PRIVATE_KEY ?? env.REGISTRAR_ADDRESS, {
    message: "Set REGISTRAR_PRIVATE_KEY, or REGISTRAR_ADDRESS for an account Anvil has unlocked",
  })
  // A code in a log can be read by whoever reads the log, so only a local chain may do without.
  .refine((env) => env.SMTP_URL !== undefined || env.CHAIN_ID === 31337, {
    message: "Set SMTP_URL; only on Anvil (CHAIN_ID 31337) can codes go to the log instead",
    path: ["SMTP_URL"],
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = parsed.data;
