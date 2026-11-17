// Request and response bodies of the API, shared so the web app and the API agree on them.
import { z } from "zod";

import { commitmentSchema } from "./semaphore";
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
  semaphoreFactory: addressSchema,
  emailDomain: z.string(),
  /** Google sign-in's client ID, or null where registration is not set up. */
  googleClientId: z.string().nullable(),
});
export type ApiConfig = z.infer<typeof apiConfigSchema>;

/** How a voter proves their institute address: a Google ID token for an account in its domain. */
const googleIdToken = z.string().min(20).max(4096);

export const registrationRequestSchema = z.object({
  email: emailSchema,
  googleIdToken,
  voter: addressSchema,
  /** The voter's signature over `registrationTypedData`. */
  signature: hexSchema,
});
export type RegistrationRequest = z.input<typeof registrationRequestSchema>;

/** Tier 3: the voter registers the commitment of an identity their device created. */
export const identityRegistrationRequestSchema = z.object({
  email: emailSchema,
  googleIdToken,
  /** The identity commitment, in decimal. */
  commitment: commitmentSchema.refine((value) => value !== "0", "Not an identity commitment"),
});
export type IdentityRegistrationRequest = z.input<typeof identityRegistrationRequestSchema>;

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

/** What a tier 3 voter keeps. The signature is over `identityReceiptTypedData`. */
export const identityReceiptSchema = z.object({
  chainId: z.number(),
  election: addressSchema,
  /** The identity commitment, in decimal. */
  commitment: z.string(),
  /** Unix seconds. */
  issuedAt: z.number().int(),
  registrar: addressSchema,
  signature: hexSchema,
});
export type IdentityReceipt = z.infer<typeof identityReceiptSchema>;

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
  /** 2 for wallet ballots, 3 for anonymous ballots. */
  tier: z.number(),
  /** `CountingRule`: 0 plurality, 1 approval. */
  countingRule: z.number(),
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
  /** As cast: a candidate index, or under approval a bitmask of candidates, in decimal. */
  choice: z.string(),
  /** The candidates the ballot counts for. */
  candidates: z.array(z.number()),
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

// ---------------------------------------------------------------------------------------------
// Relayer: submits tier 3 ballots and pays their gas
// ---------------------------------------------------------------------------------------------

const decimalSchema = z.string().regex(/^\d{1,78}$/, "Expected a number in decimal");

/** An anonymous ballot for the relayer to submit: the choice, the nullifier and the proof. */
export const relayRequestSchema = z.object({
  election: addressSchema,
  choice: decimalSchema,
  nullifier: decimalSchema,
  points: z.array(decimalSchema).length(8),
});
export type RelayRequest = z.input<typeof relayRequestSchema>;

/** The relayer's signed promise to submit a ballot. The signature is over `relayReceiptTypedData`. */
export const relayReceiptSchema = z.object({
  chainId: z.number(),
  election: addressSchema,
  /** In decimal. */
  nullifier: z.string(),
  /** In decimal. */
  choice: z.string(),
  /** Unix seconds. */
  acceptedAt: z.number().int(),
  relayer: addressSchema,
  signature: hexSchema,
});
export type RelayReceipt = z.infer<typeof relayReceiptSchema>;

export const relayAcceptedSchema = z.object({ id: z.string(), receipt: relayReceiptSchema });

export const relayStatusSchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "sending", "mined", "failed"]),
  txHash: hexSchema.optional(),
  error: z.string().optional(),
});
export type RelayStatus = z.infer<typeof relayStatusSchema>;

export const relayConfigSchema = z.object({
  chainId: z.number(),
  relayer: addressSchema,
  forwarder: addressSchema,
});
export type RelayConfig = z.infer<typeof relayConfigSchema>;
