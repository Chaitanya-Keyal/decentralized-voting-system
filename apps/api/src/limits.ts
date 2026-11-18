// Limits on what one client can ask of the registrar, so that nobody can fill its database or its
// IPFS node, or spend its RPC allowance. The API runs as one process, so the counts are kept in
// memory; a restart clears them.
import type { FastifyRequest } from "fastify";

import { HttpError } from "./http";

const windows = new Map<string, { count: number; resetAt: number }>();

/** At most `max` requests per client per minute for one kind of request. */
export function perClient(kind: string, max: number) {
  return (request: FastifyRequest) => {
    const now = Date.now();
    const key = `${kind}:${request.ip}`;
    const window = windows.get(key);
    if (!window || window.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + 60_000 });
      return Promise.resolve();
    }
    window.count++;
    if (window.count > max) {
      return Promise.reject(
        new HttpError(429, "Too many requests from here. Wait a minute and try again."),
      );
    }
    return Promise.resolve();
  };
}

const daily = new Map<string, { count: number; day: number }>();

/** At most `max` of one kind of request per day from everyone together. */
export function perDay(kind: string, max: number) {
  return () => {
    const day = Math.floor(Date.now() / 86_400_000);
    const entry = daily.get(kind);
    if (entry?.day !== day) {
      daily.set(kind, { count: 1, day });
      return Promise.resolve();
    }
    entry.count++;
    if (entry.count > max) {
      return Promise.reject(
        new HttpError(429, "DVote has reached today's limit for this. Try again tomorrow."),
      );
    }
    return Promise.resolve();
  };
}

// Old windows are dropped now and then, so the map does not grow with every client ever seen.
setInterval(() => {
  const now = Date.now();
  for (const [key, window] of windows) if (window.resetAt <= now) windows.delete(key);
}, 5 * 60_000).unref();
