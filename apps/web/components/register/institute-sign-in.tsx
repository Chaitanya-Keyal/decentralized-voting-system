"use client";

import { googleNonce } from "@dvote/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { api } from "@/lib/api";
import type { OnchainElection } from "@/lib/election";
import { chain } from "@/lib/env";

import { Button, Loading, muted, Spinner, TextButton } from "../ui";
import { GoogleSignInButton } from "./google-sign-in";

/** How the voter showed they hold an institute address. */
export interface SignIn {
  email: string;
  googleIdToken: string;
}

/**
 * The step every registration starts with: signing in with the institute's Google account, which
 * shows the voter holds an institute address. Then the button that registers, given the sign-in.
 */
export function InstituteSignIn({
  election,
  subject,
  submitLabel,
  busy,
  disabled,
  onSubmit,
  children,
}: {
  election: OnchainElection;
  /**
   * What is being registered: the wallet address or the voting key's commitment. A Google sign-in
   * is made for it alone, so it is needed before one is offered.
   */
  subject: string | undefined;
  submitLabel: string;
  busy: boolean;
  /** Why the voter cannot register yet, for example a wallet still to connect. */
  disabled?: string;
  onSubmit: (signIn: SignIn) => void;
  children?: ReactNode;
}) {
  const config = useQuery({ queryKey: ["api-config"], queryFn: api.config });
  const [signIn, setSignIn] = useState<SignIn>();

  if (!config.data) {
    return <Loading>Loading…</Loading>;
  }
  const { googleClientId, emailDomain } = config.data;
  if (googleClientId === null) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Registration is not set up on this deployment yet: it has no Google sign-in.
      </p>
    );
  }

  if (signIn) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        <p>
          Signed in with Google as <strong>{signIn.email}</strong>.{" "}
          <TextButton className={muted} onClick={() => setSignIn(undefined)}>
            Use another account
          </TextButton>
        </p>
        {children}
        <div className="flex flex-col gap-2">
          <div>
            <Button
              disabled={busy || Boolean(disabled)}
              title={disabled}
              onClick={() => onSubmit(signIn)}
            >
              {busy && <Spinner />} {submitLabel}
            </Button>
          </div>
          {disabled && <p className={`text-sm ${muted}`}>{disabled}.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-zinc-600 dark:text-zinc-400">
        Sign in with your @{emailDomain} Google account to show you are a student here.
      </p>
      {subject ? (
        <GoogleSignInButton
          clientId={googleClientId}
          nonce={googleNonce(chain.id, election.address, subject)}
          onSignedIn={({ email, idToken }) => setSignIn({ email, googleIdToken: idToken })}
        />
      ) : (
        <p className={muted}>{disabled ?? "Make your voting key first."}</p>
      )}
    </div>
  );
}
