// The relayer: its own process, beside the registrar and the indexer. It submits anonymous
// ballots and pays their gas, so a voter needs no ETH (FR7). It keeps no request logs: a log of
// who sent which ballot when would undo the anonymity the proofs provide.
import { relayRequestSchema, type RelayConfig } from "@dvote/shared";
import cors from "@fastify/cors";
import Fastify, { LogController, type FastifyServerOptions } from "fastify";
import { z } from "zod";

import { clientError, parse, refuseOtherSites } from "../http";
import { loggable } from "../redact";
import { chain, config, deployment, relayer } from "./config";
import { acceptBallot, ballotStatus, connect, startWorker } from "./service";

export async function buildRelayer(options: { logger?: boolean } = {}) {
  const relay = connect();
  const worker = startWorker(relay);
  // Warnings and errors only, and never per request.
  const settings: FastifyServerOptions = {
    logger: options.logger === false ? false : { level: "warn" },
    logController: new LogController({ disableRequestLogging: true }),
    // Trusts the nearest RELAYER_TRUSTED_PROXIES hops, counting from the connection itself.
    trustProxy: (_address: string, hop: number) => hop < config.RELAYER_TRUSTED_PROXIES,
  };
  const app = Fastify(settings);
  const origins = config.WEB_ORIGIN.split(",");
  app.addHook("onRequest", refuseOtherSites(origins));
  await app.register(cors, { origin: origins });

  app.setErrorHandler((error, request, reply) => {
    const shown = clientError(error);
    if (shown) {
      return reply.status(shown.status).send({ statusCode: shown.status, message: shown.message });
    }
    request.log.error({ err: loggable(error) }, "Relaying failed");
    return reply
      .status(500)
      .send({ statusCode: 500, message: "The relayer could not take that ballot. Try again." });
  });

  app.get("/health", () => ({ ok: true }));

  app.get("/config", (): RelayConfig => ({
    chainId: chain.id,
    relayer: relayer.account.address,
    forwarder: deployment.voteForwarder,
  }));

  app.post("/ballots", async (request) => {
    return acceptBallot(relay, parse(relayRequestSchema, request.body), request.ip);
  });

  app.get("/ballots/:id", async (request) => {
    const { id } = parse(z.object({ id: z.string().regex(/^[0-9a-f]{64}$/) }), request.params);
    return ballotStatus(relay, id);
  });

  app.addHook("onClose", async () => {
    await worker.close();
    await relay.queue.close();
    relay.redis.disconnect();
  });
  return app;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const app = await buildRelayer();
  await app.listen({ host: config.RELAYER_HOST, port: config.RELAYER_PORT });
  app.log.warn(`Relaying ballots for chain ${chain.id} from ${relayer.account.address}`);
}
