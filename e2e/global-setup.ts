// Before the browser tests: a key for the Google sign-in stand-in (google.ts), and its public half
// served as a key set where the API under test looks for Google's (GOOGLE_JWKS_URL).
import { createHash, generateKeyPairSync } from "node:crypto";
import { createServer } from "node:http";

import { GOOGLE_STAND_IN_PORT } from "./google";

export default async function globalSetup() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  // A key id of its own each run, so an API still holding an earlier run's keys fetches again.
  const kid = createHash("sha256")
    .update(jwk.n ?? "")
    .digest("hex")
    .slice(0, 16);
  // The tests run in other processes, which inherit these.
  process.env.E2E_GOOGLE_KEY = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  process.env.E2E_GOOGLE_KEY_ID = kid;

  const server = createServer((_, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] }));
  });
  await new Promise<void>((resolve) => server.listen(GOOGLE_STAND_IN_PORT, "127.0.0.1", resolve));
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
