import { STATUS_CODES } from "node:http";

import cors from "@fastify/cors";
import {
  addressSchema,
  codeRequestSchema,
  metadataSchema,
  registrationRequestSchema,
  type ApiConfig,
} from "@dvote/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import { chain, deployment, registrar } from "./chain";
import { env } from "./env";
import { clientError, loggable, parse } from "./http";
import { getElection, indexerStatus, listBallots, listElections } from "./indexer/queries";
import { pinJson } from "./ipfs";
import { publishVoterList, register, registrationCount, sendCode } from "./registrar";

const electionParams = z.object({ election: addressSchema });

export async function buildApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  await app.register(cors, { origin: env.WEB_ORIGIN.split(",") });

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
    emailDomain: env.EMAIL_DOMAIN,
  }));

  // Registrar

  app.post("/elections/:election/codes", async (request) => {
    const { election } = parse(electionParams, request.params);
    const { email } = parse(codeRequestSchema, request.body);
    return sendCode(election, email, request.log);
  });

  app.post("/elections/:election/registrations", async (request) => {
    const { election } = parse(electionParams, request.params);
    return register(election, parse(registrationRequestSchema, request.body));
  });

  app.get("/elections/:election/registrations/count", async (request) => {
    const { election } = parse(electionParams, request.params);
    return registrationCount(election);
  });

  // The registrar publishes each list by itself once registration closes (see publisher.ts).
  // Anyone may also ask, as with the phase changes: it only happens once registration has
  // closed, and what is published does not depend on who asked.
  app.post("/elections/:election/voter-list", async (request) => {
    const { election } = parse(electionParams, request.params);
    return publishVoterList(election, request.log);
  });

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

  app.post("/metadata", { bodyLimit: 64 * 1024 }, async (request) => {
    const document = parse(metadataSchema, request.body);
    return { cid: await pinJson(document, `${document.format}.json`) };
  });

  return app;
}
