import { STATUS_CODES } from "node:http";

import cors from "@fastify/cors";
import { addressSchema, metadataSchema, type ApiConfig } from "@dvote/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import { chain, deployment, registrar } from "./chain";
import { env } from "./env";
import { clientError, parse, refuseOtherSites } from "./http";
import { loggable } from "./redact";
import { getElection, indexerStatus, listBallots, listElections } from "./indexer/queries";
import { pinJson } from "./ipfs";
import { perClient, perDay } from "./limits";
import { publishVoterList, registerVoter, registrationCount } from "./registrar";

const electionParams = z.object({ election: addressSchema });

/** A per-client limit, scaled by API_RATE_LIMIT_FACTOR. */
const limit = (kind: string, max: number) =>
  perClient(kind, Math.ceil(max * env.API_RATE_LIMIT_FACTOR));

export async function buildApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    // The client's address, for the limits below, as the proxies in front of the API saw it. Never
    // more proxies than there really are, or a client could choose its own address.
    trustProxy: (_address: string, hop: number) => hop < env.API_TRUSTED_PROXIES,
  });
  const origins = env.WEB_ORIGIN.split(",");
  app.addHook("onRequest", refuseOtherSites(origins));
  await app.register(cors, { origin: origins });

  // Only messages written for clients reach them. Anything else, such as a failed request to the
  // node, can quote internal details like the RPC URL and its key, so it is logged instead.
  app.setErrorHandler((error, request, reply) => {
    const shown = clientError(error);
    if (shown) {
      const { status, message } = shown;
      return reply
        .status(status)
        .send({ statusCode: status, error: STATUS_CODES[status], message });
    }
    request.log.error({ err: loggable(error) }, "Request failed");
    return reply.status(500).send({
      statusCode: 500,
      error: STATUS_CODES[500],
      message: "Something went wrong in the registrar. Try again in a moment.",
    });
  });

  app.get("/health", () => ({ ok: true }));

  app.get("/config", (): ApiConfig => ({
    chainId: chain.id,
    registrar: registrar.account.address,
    electionFactory: deployment.electionFactory,
    semaphoreFactory: deployment.semaphoreFactory,
    emailDomain: env.EMAIL_DOMAIN,
    googleClientId: env.GOOGLE_CLIENT_ID ?? null,
    organisers: env.AUTHORITIES,
  }));

  // Registrar

  // Generous per client, since a classroom may share one network address.
  app.post(
    "/elections/:election/registrations",
    { preHandler: limit("registrations", 120) },
    async (request) => {
      const { election } = parse(electionParams, request.params);
      return registerVoter(election, request.body);
    },
  );

  app.get(
    "/elections/:election/registrations/count",
    { preHandler: limit("count", 240) },
    async (request) => {
      const { election } = parse(electionParams, request.params);
      return registrationCount(election);
    },
  );

  // The registrar publishes each list by itself once registration closes (see publisher.ts).
  // Anyone may also ask, as with the phase changes: it only happens once registration has
  // closed, and what is published does not depend on who asked.
  app.post(
    "/elections/:election/voter-list",
    { preHandler: limit("voter-list", 60) },
    async (request) => {
      const { election } = parse(electionParams, request.params);
      return publishVoterList(election, request.log);
    },
  );

  // Indexer: a read cache of the chain, for pages that list elections and ballots. Anything shown
  // from here can be checked against the chain itself.

  app.get("/elections", () => listElections());

  app.get("/elections/:election", async (request) => {
    const { election } = parse(electionParams, request.params);
    return getElection(election);
  });

  app.get("/elections/:election/ballots", async (request) => {
    const { election } = parse(electionParams, request.params);
    return listBallots(election);
  });

  app.get("/indexer", () => indexerStatus());

  // Metadata: ballot descriptions and manifestos, pinned to IPFS (FR1).

  // Every document pinned stays on the IPFS node, so the number per day is capped as well.
  app.post(
    "/metadata",
    { bodyLimit: 64 * 1024, preHandler: [limit("metadata", 20), perDay("metadata", 2_000)] },
    async (request) => {
      const document = parse(metadataSchema, request.body);
      return { cid: await pinJson(document, `${document.format}.json`) };
    },
  );

  return app;
}
