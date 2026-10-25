// Request and response bodies of the API, shared so the web app and the API agree on them.
import { z } from "zod";

import { addressSchema } from "./voter-list";

export const hexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/, "Not a hex string")
  .transform((value) => value as `0x${string}`);

export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());

// ---------------------------------------------------------------------------------------------
// Registrar
// ---------------------------------------------------------------------------------------------

export const apiConfigSchema = z.object({
  chainId: z.number(),
  registrar: addressSchema,
  electionFactory: addressSchema,
  emailDomain: z.string(),
});
export type ApiConfig = z.infer<typeof apiConfigSchema>;

export const codeRequestSchema = z.object({ email: emailSchema });
export type CodeRequest = z.input<typeof codeRequestSchema>;

export const codeResponseSchema = z.object({ expiresAt: z.number() });

export const registrationRequestSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, "The code has six digits"),
  voter: addressSchema,
  /** The voter's signature over `registrationTypedData`. */
  signature: hexSchema,
});
export type RegistrationRequest = z.input<typeof registrationRequestSchema>;

/** What a voter keeps after registering. The signature is over `receiptTypedData`. */
export const receiptSchema = z.object({
  chainId: z.number(),
  election: addressSchema,
  voter: addressSchema,
  /** Unix seconds. */
  issuedAt: z.number().int(),
  registrar: addressSchema,
  signature: hexSchema,
});
export type Receipt = z.infer<typeof receiptSchema>;

export const registrationCountSchema = z.object({ count: z.number() });

export const publicationSchema = z.object({
  root: hexSchema,
  count: z.number(),
  cid: z.string(),
  /** The transaction that recorded it, when the registrar knows it. */
  txHash: hexSchema.optional(),
});
export type Publication = z.infer<typeof publicationSchema>;

// ---------------------------------------------------------------------------------------------
// Metadata pinned to IPFS
// ---------------------------------------------------------------------------------------------

/** The ballot description an election's `metadataCid` points to. */
export const electionMetadataSchema = z.object({
  format: z.literal("dvote-election-v1"),
  description: z.string().max(10_000),
});
export type ElectionMetadata = z.infer<typeof electionMetadataSchema>;

/** A candidate's manifesto, which their `manifestoCid` points to. */
export const manifestoSchema = z.object({
  format: z.literal("dvote-manifesto-v1"),
  candidate: z.string().min(1).max(200),
  text: z.string().min(1).max(20_000),
});
export type Manifesto = z.infer<typeof manifestoSchema>;

export const metadataSchema = z.discriminatedUnion("format", [
  electionMetadataSchema,
  manifestoSchema,
]);

export const pinResponseSchema = z.object({ cid: z.string() });

/** The error body Fastify sends. */
export const apiErrorSchema = z.object({ message: z.string() });

// ---------------------------------------------------------------------------------------------
// Indexer: a read cache of the chain, for pages that list things
// ---------------------------------------------------------------------------------------------

export const electionSummarySchema = z.object({
  address: addressSchema,
  title: z.string(),
  phase: z.number(),
  /** Unix seconds. */
  registrationStart: z.number(),
  registrationEnd: z.number(),
  votingStart: z.number(),
  votingEnd: z.number(),
  /** Null until the voter list is published. */
  voterCount: z.number().nullable(),
  ballotsCast: z.number(),
});
export type ElectionSummary = z.infer<typeof electionSummarySchema>;

export const electionListSchema = z.object({ elections: z.array(electionSummarySchema) });

export const electionDetailSchema = electionSummarySchema.extend({
  authority: addressSchema,
  registrar: addressSchema,
  metadataCid: z.string(),
  voterRoot: hexSchema.nullable(),
  voterListCid: z.string().nullable(),
  candidates: z.array(z.object({ name: z.string(), manifestoCid: z.string(), votes: z.number() })),
  /** Null until the election is finalized. */
  winners: z.array(z.number()).nullable(),
  createdTxHash: hexSchema,
});
export type ElectionDetail = z.infer<typeof electionDetailSchema>;

export const ballotSchema = z.object({
  /** The voter's address in tier 2, the nullifier in tier 3. */
  key: hexSchema,
  candidate: z.number(),
  blockNumber: z.number(),
  /** Unix seconds. */
  timestamp: z.number(),
  txHash: hexSchema,
});
export type Ballot = z.infer<typeof ballotSchema>;

export const ballotListSchema = z.object({ ballots: z.array(ballotSchema) });

export const indexerStatusSchema = z.object({
  chainId: z.number(),
  /** The last block indexed, or null before the first batch. */
  block: z.number().nullable(),
  head: z.number(),
});
