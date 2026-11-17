// The API: the registrar, the metadata service and the indexer's read cache.
import {
  apiConfigSchema,
  apiErrorSchema,
  ballotListSchema,
  electionDetailSchema,
  electionListSchema,
  identityReceiptSchema,
  indexerStatusSchema,
  pinResponseSchema,
  publicationSchema,
  receiptSchema,
  registrationCountSchema,
  type ElectionMetadata,
  type IdentityRegistrationRequest,
  type Manifesto,
  type RegistrationRequest,
} from "@dvote/shared";
import type { Address } from "viem";
import type { z } from "zod";

import { apiUrl } from "./env";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Generous: the relayer checks a proof before answering, and the registrar may be publishing. */
const REQUEST_TIMEOUT_MS = 60_000;

export async function call<T extends z.ZodType>(
  schema: T,
  path: string,
  body?: object,
  base = apiUrl,
): Promise<z.output<T>> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      // A service that accepts the connection and never answers must not leave the page waiting.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(0, `Could not reach ${base}. Is it running?`);
  }
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = apiErrorSchema.safeParse(data);
    throw new ApiError(response.status, error.success ? error.data.message : response.statusText);
  }
  return schema.parse(data);
}

export const api = {
  config: () => call(apiConfigSchema, "/config"),

  register: (election: Address, request: RegistrationRequest) =>
    call(receiptSchema, `/elections/${election}/registrations`, request),
  registerIdentity: (election: Address, request: IdentityRegistrationRequest) =>
    call(identityReceiptSchema, `/elections/${election}/registrations`, request),
  registrationCount: (election: Address) =>
    call(registrationCountSchema, `/elections/${election}/registrations/count`),
  publishVoterList: (election: Address) =>
    call(publicationSchema, `/elections/${election}/voter-list`, {}),

  pin: (document: ElectionMetadata | Manifesto) => call(pinResponseSchema, "/metadata", document),

  elections: () => call(electionListSchema, "/elections"),
  election: (election: Address) => call(electionDetailSchema, `/elections/${election}`),
  ballots: (election: Address) => call(ballotListSchema, `/elections/${election}/ballots`),
  indexer: () => call(indexerStatusSchema, "/indexer"),
};
