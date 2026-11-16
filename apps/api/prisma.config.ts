import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

import { loadFileSettings } from "./src/file-settings";

// Prisma does not read .env files itself. The repository keeps one at its root, and variables
// that are already set take precedence over it.
const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
loadFileSettings();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generating the client needs no database, so a missing URL only fails commands that connect.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
