import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

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

/**
 * Refuses requests that another site's page sends in the background, by the Fetch Metadata headers
 * browsers attach. CORS keeps other sites from reading the answers; this keeps them from sending
 * anything at all. The web app's own origins may call, as may link clicks and clients that send
 * no such headers, such as scripts and older browsers.
 */
export function refuseOtherSites(origins: string[]) {
  return (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    void reply.header("Vary", "Sec-Fetch-Site, Sec-Fetch-Mode, Sec-Fetch-Dest");
    const site = request.headers["sec-fetch-site"];
    const navigating = request.headers["sec-fetch-mode"] === "navigate" && request.method === "GET";
    const origin = request.headers.origin;
    if (
      site === undefined ||
      site === "same-origin" ||
      site === "none" ||
      navigating ||
      (origin !== undefined && origins.includes(origin))
    ) {
      return Promise.resolve();
    }
    return Promise.reject(new HttpError(403, "Requests from other sites are not accepted."));
  };
}
