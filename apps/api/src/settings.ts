// What the API, the indexer, the relayer and Prisma share in reading their settings. They run as
// separate processes, each with only the settings it needs, but read them the same way.
import { existsSync, readFileSync } from "node:fs";

import { addressSchema } from "@dvote/shared";
import { z } from "zod";

/**
 * Loads the repository's one .env, at its root, where variables that are already set take
 * precedence; then settings from files, the way container secrets are mounted: NAME_FILE=/path
 * sets NAME to the file's contents, unless NAME is already set. Keys and passwords then never sit
 * in a process's environment listing or in a compose file.
 */
export function loadSettings(): void {
  const envFile = new URL("../../../.env", import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const env = process.env;
  for (const [name, path] of Object.entries(env)) {
    if (!name.endsWith("_FILE") || !path) continue;
    const target = name.slice(0, -"_FILE".length);
    if (env[target]) continue;
    env[target] = readFileSync(path, "utf8").trim();
  }
}

/** Treats an empty variable, such as `KEY=` in .env, as unset. */
export function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema.optional());
}

/** An account's private key. */
export const privateKeySchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Expected a 32-byte hex key")
  .transform((key) => key as `0x${string}`);

/** Comma-separated addresses; empty is an empty list. */
export const addressListSchema = z
  .string()
  .default("")
  .transform((list) => list.split(",").filter((entry) => entry.trim() !== ""))
  .pipe(z.array(z.string().trim().pipe(addressSchema)));
