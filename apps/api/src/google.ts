// Google sign-in, as a second way for a voter to prove an institute email address. Google's ID
// token is checked as Google documents: its signature against Google's published keys, the issuer,
// the audience (our client ID) and the expiry. Membership of the institute is the `hd` (hosted
// domain) claim, which Google sets only for accounts its Workspace manages; the email's domain
// alone would not show that.
import { createRemoteJWKSet, errors, jwtVerify } from "jose";

import { env } from "./env";
import { HttpError } from "./http";

let keys: ReturnType<typeof createRemoteJWKSet> | undefined;

/**
 * The verified institute address the token speaks for, in lower case. The token must have been
 * made for this registration (`nonce`, see googleNonce) and within the last ten minutes.
 */
export async function verifyGoogleIdToken(token: string, nonce: string): Promise<string> {
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(400, "Google sign-in is not set up here.");
  keys ??= createRemoteJWKSet(new URL(env.GOOGLE_JWKS_URL));
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer: ["accounts.google.com", "https://accounts.google.com"],
      audience: env.GOOGLE_CLIENT_ID,
      requiredClaims: ["exp", "iat", "nonce"],
      maxTokenAge: "10m",
      clockTolerance: "5s",
    }));
  } catch (error) {
    const unreachable = error instanceof errors.JWKSTimeout || !(error instanceof errors.JOSEError);
    if (unreachable) {
      throw new HttpError(503, "Google's sign-in keys could not be fetched. Try again shortly.");
    }
    throw new HttpError(400, "Google sign-in couldn't be verified. Sign in again.");
  }
  if (payload.nonce !== nonce) {
    throw new HttpError(400, "That Google sign-in was for another registration. Sign in again.");
  }
  const domain = env.EMAIL_DOMAIN.toLowerCase();
  if (payload.hd !== domain) {
    throw new HttpError(403, `Sign in with your @${env.EMAIL_DOMAIN} Google account.`);
  }
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
  if (!email || payload.email_verified !== true || !email.endsWith(`@${domain}`)) {
    throw new HttpError(403, `Sign in with your @${env.EMAIL_DOMAIN} Google account.`);
  }
  return email;
}
