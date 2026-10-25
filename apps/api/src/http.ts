import { z } from "zod";

import { env } from "./env";

/** An error with an HTTP status, whose message is written for the client and sent as is. */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

/** Validates a request body or parameters, answering 400 with the reasons if they are invalid. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw new HttpError(400, z.prettifyError(result.error));
  return result.data;
}

/**
 * The status and message to answer with when `error` may be shown to the client, or undefined
 * when it may not. Fastify's own errors, such as a malformed body, describe only the request.
 */
export function clientError(error: unknown): { status: number; message: string } | undefined {
  if (error instanceof HttpError) return { status: error.statusCode, message: error.message };
  if (!(error instanceof Error)) return undefined;
  const { code, statusCode } = error as { code?: unknown; statusCode?: unknown };
  const fromFastify = typeof code === "string" && code.startsWith("FST_");
  if (fromFastify && typeof statusCode === "number" && statusCode < 500) {
    return { status: statusCode, message: error.message };
  }
  return undefined;
}

// Errors from viem quote the RPC URL, whose path or query can hold the provider's API key.
const rpcUrl = new URL(env.RPC_URL);
const rpcSpellings = [
  ...new Set([
    env.RPC_URL,
    Object.assign(new URL(env.RPC_URL), { username: "", password: "" }).href,
  ]),
];
const redact = (text: string) =>
  rpcSpellings.reduce(
    (result, spelling) => result.replaceAll(spelling, `${rpcUrl.origin}/…`),
    text,
  );

/** An error as it can be logged: its message and stack, with the RPC URL cut down to its origin. */
export function loggable(error: unknown): { type: string; message: string; stack?: string } {
  if (!(error instanceof Error)) return { type: typeof error, message: redact(String(error)) };
  return {
    type: error.name,
    message: redact(error.message),
    ...(error.stack === undefined ? {} : { stack: redact(error.stack) }),
  };
}
