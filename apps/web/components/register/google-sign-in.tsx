"use client";

// Google sign-in, through Google Identity Services. The browser gets an ID token from Google and
// hands it to the registrar, which checks its signature and that the account belongs to the
// institute's Google domain. The token proves the email address; it is not kept anywhere.
import { useEffect, useRef, useState } from "react";

import { Notice } from "../ui";

const SCRIPT = "https://accounts.google.com/gsi/client";

interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        nonce?: string;
        callback: (response: { credential: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }): void;
      renderButton(
        parent: HTMLElement,
        options: { theme?: string; size?: string; text?: string; shape?: string; width?: number },
      ): void;
      disableAutoSelect(): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

let loading: Promise<GoogleIdentity> | undefined;

function loadGoogle(): Promise<GoogleIdentity> {
  loading ??= new Promise((resolve, reject) => {
    if (window.google) return resolve(window.google);
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () =>
      window.google ? resolve(window.google) : reject(new Error("Google sign-in did not load."));
    script.onerror = () => {
      loading = undefined;
      reject(new Error("Google sign-in could not be reached."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** The email address an ID token is for, read without checking it: the registrar checks it. */
function emailOfIdToken(token: string): string | undefined {
  try {
    const payload = token.split(".")[1] ?? "";
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const email = (JSON.parse(json) as { email?: unknown }).email;
    return typeof email === "string" ? email.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

/** Google's own sign-in button. `onSignedIn` receives the ID token and its email address. */
export function GoogleSignInButton({
  clientId,
  nonce,
  onSignedIn,
}: {
  clientId: string;
  /** Put into the token Google signs, tying it to one registration (see googleNonce). */
  nonce: string;
  onSignedIn: (signedIn: { email: string; idToken: string }) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onSignedIn);
  useEffect(() => {
    callback.current = onSignedIn;
  }, [onSignedIn]);
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    loadGoogle()
      .then((google) => {
        if (cancelled || !container.current) return;
        google.accounts.id.initialize({
          client_id: clientId,
          nonce,
          auto_select: false,
          cancel_on_tap_outside: true,
          callback: ({ credential }) => {
            const email = emailOfIdToken(credential);
            if (email) callback.current({ email, idToken: credential });
            else setProblem("Google did not share an email address.");
          },
        });
        google.accounts.id.renderButton(container.current, {
          // Google's dark button on a dark page, its light one otherwise.
          theme: window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "filled_black"
            : "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          width: 280,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, nonce]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={container} className="min-h-10" />
      {problem && <Notice tone="error">{problem}</Notice>}
    </div>
  );
}
