import type { FastifyBaseLogger } from "fastify";
import { anvil } from "viem/chains";

import { chain } from "./chain";
import { loggable } from "./http";
import { publishDueVoterLists } from "./registrar";

const INTERVAL_MS = chain.id === anvil.id ? 2_000 : 30_000;

/** Publishes each voter list as soon as its registration closes, checking every few seconds. */
export function startPublisher(log: FastifyBaseLogger): void {
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    publishDueVoterLists(log)
      .catch((error: unknown) =>
        log.error({ err: loggable(error) }, "Publishing voter lists failed"),
      )
      .finally(() => {
        running = false;
      });
  }, INTERVAL_MS);
}
