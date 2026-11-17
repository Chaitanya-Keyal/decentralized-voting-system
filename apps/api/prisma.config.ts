import { defineConfig } from "prisma/config";

import { loadSettings } from "./src/settings";

// Prisma does not read .env files itself.
loadSettings();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generating the client needs no database, so a missing URL only fails commands that connect.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
