// A stand-in for Google sign-in, so that the browser tests can register voters. Google's sign-in
// script is replaced in the test's browser by a small one that asks for an address, and the ID token
// it hands the page is signed with a key this run made (global-setup.ts). The API under test reads
// that key from GOOGLE_JWKS_URL, where it would otherwise read Google's; nothing else changes.
import { createHash, createPrivateKey, sign } from "node:crypto";

import { expect, type BrowserContext, type Page } from "@playwright/test";

export const GOOGLE_STAND_IN_PORT = 4410;
const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";

/** What runs in place of Google's script: an address box and a button, then a signed token. */
const STAND_IN = `
(() => {
  let options;
  window.google = { accounts: { id: {
    initialize(given) { options = given; },
    disableAutoSelect() {},
    renderButton(parent) {
      const form = document.createElement("form");
      form.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
      const address = document.createElement("input");
      address.type = "email";
      address.setAttribute("aria-label", "Google account (test stand-in)");
      address.style.cssText = "border:1px solid #888;border-radius:6px;padding:6px 10px;min-width:22em";
      const button = document.createElement("button");
      button.textContent = "Sign in (Google test stand-in)";
      button.style.cssText = "border:1px solid #888;border-radius:6px;padding:6px 12px";
      form.append(address, button);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const credential = await window.dvoteGoogleStandIn(address.value, options.nonce, options.client_id);
        options.callback({ credential });
      });
      parent.replaceChildren(form);
    },
  } } };
})();
`;

const base64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

/** An ID token as Google would issue it for an account in the address's domain. */
function idToken(email: string, nonce: string, audience: string): string {
  const key = createPrivateKey(process.env.E2E_GOOGLE_KEY ?? "");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: process.env.E2E_GOOGLE_KEY_ID };
  const payload = {
    iss: "https://accounts.google.com",
    aud: audience,
    sub: createHash("sha256").update(email).digest("hex").slice(0, 21),
    email,
    email_verified: true,
    hd: email.slice(email.lastIndexOf("@") + 1),
    nonce,
    iat: now,
    exp: now + 3600,
  };
  const signed = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  return `${signed}.${base64url(sign("sha256", Buffer.from(signed), key))}`;
}

/** Puts the stand-in in place of Google sign-in for every page of `context`. */
export async function useGoogleStandIn(context: BrowserContext) {
  await context.route(GOOGLE_SCRIPT, (route) =>
    route.fulfill({ contentType: "text/javascript", body: STAND_IN }),
  );
  await context.exposeFunction("dvoteGoogleStandIn", idToken);
}

/** Signs in as `email` on a registration page, through the stand-in. */
export async function signInWithGoogle(
  page: Page,
  email: string,
  typeIt?: (text: string) => Promise<void>,
) {
  const address = page.getByLabel("Google account (test stand-in)");
  if (typeIt) {
    await address.click();
    await typeIt(email);
  } else await address.fill(email);
  await page.getByRole("button", { name: "Sign in (Google test stand-in)" }).click();
  await expect(page.getByText("Signed in with Google as")).toBeVisible();
}
