// Google sign-in, as a second way for a voter to prove an institute email address. Google's ID
// token is checked as Google documents: its signature against Google's published keys, the issuer,
// the audience (our client ID) and the expiry. Membership of the institute is the `hd` (hosted
// domain) claim, which Google sets only for accounts its Workspace manages; the email's domain
// alone would not show that.
import { createRemoteJWKSet, jwtVerify } from "jose";

import { env } from "./env";
import { HttpError } from "./http";

let keys: ReturnType<typeof createRemoteJWKSet> | undefined;

/** The verified institute address the token speaks for, in lower case. */
export async function verifyGoogleIdToken(token: string): Promise<string> {
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(400, "Google sign-in is not set up here.");
  keys ??= createRemoteJWKSet(new URL(env.GOOGLE_JWKS_URL));
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer: ["accounts.google.com", "https://accounts.google.com"],
      audience: env.GOOGLE_CLIENT_ID,
    }));
  } catch {
    throw new HttpError(400, "Google sign-in did not check out. Sign in again.");
  }
  if (payload.hd !== env.EMAIL_DOMAIN) {
    throw new HttpError(403, `Sign in with your @${env.EMAIL_DOMAIN} Google account.`);
  }
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
  if (!email || payload.email_verified !== true || !email.endsWith(`@${env.EMAIL_DOMAIN}`)) {
    throw new HttpError(403, `Sign in with your @${env.EMAIL_DOMAIN} Google account.`);
  }
  return email;
}
