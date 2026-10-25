// The API: the registrar, the metadata service and the indexer's read cache.
import {
  apiConfigSchema,
  apiErrorSchema,
  ballotListSchema,
  codeResponseSchema,
  electionDetailSchema,
  electionListSchema,
  indexerStatusSchema,
  pinResponseSchema,
  publicationSchema,
  receiptSchema,
  registrationCountSchema,
  type ElectionMetadata,
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

async function call<T extends z.ZodType>(
  schema: T,
  path: string,
  body?: object,
): Promise<z.output<T>> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, `Could not reach the API at ${apiUrl}. Is it running?`);
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

  requestCode: (election: Address, email: string) =>
    call(codeResponseSchema, `/elections/${election}/codes`, { email }),
  register: (election: Address, request: RegistrationRequest) =>
    call(receiptSchema, `/elections/${election}/registrations`, request),
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
