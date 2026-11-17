// A stand-in for Google sign-in: a key set of the tests' own, served where GOOGLE_JWKS_URL points
// (vitest.config.ts), and ID tokens signed with it the way Google signs them.
import { createServer } from "node:http";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

export const GOOGLE_CLIENT_ID = "dvote-test.apps.googleusercontent.com";
const PORT = 8566;

export interface TokenOptions {
  claims?: Record<string, unknown>;
  audience?: string;
  expiresAt?: number | string;
  issuedAt?: number;
}

export async function startGoogle() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
  const server = createServer((_, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(PORT, "127.0.0.1", resolve));

  return {
    /** An ID token as Google would issue it for an institute account, with any claim overridden. */
    idToken(email: string, options: TokenOptions = {}) {
      return new SignJWT({
        email,
        email_verified: true,
        hd: "hyderabad.bits-pilani.ac.in",
        ...options.claims,
      })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer("https://accounts.google.com")
        .setAudience(options.audience ?? GOOGLE_CLIENT_ID)
        .setSubject("1234567890")
        .setIssuedAt(options.issuedAt)
        .setExpirationTime(options.expiresAt ?? "1h")
        .sign(privateKey);
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
