// The API: the registrar, the metadata service and the indexer's read cache.
import {
  apiConfigSchema,
  apiErrorSchema,
  ballotListSchema,
  codeResponseSchema,
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

  requestCode: (election: Address, email: string) =>
    call(codeResponseSchema, `/elections/${election}/codes`, { email }),
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
