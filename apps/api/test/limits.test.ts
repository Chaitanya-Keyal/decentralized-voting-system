import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import { perClient, perDay } from "../src/limits";

const from = (ip: string) => ({ ip }) as FastifyRequest;

describe("request limits", () => {
  it("lets each client make so many requests a minute, then refuses it alone", async () => {
    const limit = perClient("test-per-client", 2);
    await limit(from("192.0.2.1"));
    await limit(from("192.0.2.1"));
    await expect(limit(from("192.0.2.1"))).rejects.toMatchObject({ statusCode: 429 });
    await expect(limit(from("192.0.2.2"))).resolves.toBeUndefined();
  });

  it("caps a kind of request across everyone for the day", async () => {
    const limit = perDay("test-per-day", 2);
    await limit();
    await limit();
    await expect(limit()).rejects.toMatchObject({ statusCode: 429 });
  });
});
