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
