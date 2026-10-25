// The indexer runs as its own process, next to the API.
import { pino } from "pino";

import { db } from "../db";
import { runIndexer } from "./sync";

const log = pino();
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => controller.abort());
}

await runIndexer(log, controller.signal);
await db.$disconnect();
