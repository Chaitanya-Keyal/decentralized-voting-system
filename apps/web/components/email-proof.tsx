"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { api } from "@/lib/api";
import type { OnchainElection } from "@/lib/election";
import { isLocalChain } from "@/lib/env";
import { describeError } from "@/lib/errors";

import { GoogleSignInButton } from "./google-sign-in";
import { Button, Field, Input, Spinner } from "./ui";

/** How the voter showed they hold an institute address. */
export type EmailProofValue =
  { email: string; code: string } | { email: string; googleIdToken: string };

/**
 * The step every registration starts with: proving an institute email address, by signing in with
 * the institute's Google account or with a code emailed to the address. `submit` renders the
 * button that registers, given the proof once there is one.
 */
export function EmailProof({
  election,
  submitLabel,
  busy,
  disabled,
  onSubmit,
  children,
}: {
  election: OnchainElection;
  submitLabel: string;
  busy: boolean;
  /** Why the voter cannot register yet, for example a wallet still to connect. */
  disabled?: string;
  onSubmit: (proof: EmailProofValue) => void;
  children?: ReactNode;
}) {
  const config = useQuery({ queryKey: ["api-config"], queryFn: api.config });
  const [google, setGoogle] = useState<{ email: string; idToken: string }>();
  const [useCode, setUseCode] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string>();
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string>();

  if (!config.data) {
    return (
      <p className="flex items-center gap-2 text-sm text-zinc-500">
        <Spinner /> Loading…
      </p>
    );
  }
  const { googleClientId, emailCodes, emailDomain } = config.data;
  if (googleClientId === null && !emailCodes) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Registration is not set up on this deployment yet: it has neither Google sign-in nor email.
      </p>
    );
  }
  const offerGoogle = googleClientId !== null && !useCode;

  const sendCode = async () => {
    setProblem(undefined);
    setSending(true);
    try {
      const address = email.trim().toLowerCase();
      await api.requestCode(election.address, address);
      setSentTo(address);
      setCode("");
    } catch (error) {
      setProblem(describeError(error));
    } finally {
      setSending(false);
    }
  };

  /** In a form, the button submits it; otherwise it registers on click. */
  const submitButton = (proof: EmailProofValue | undefined, inForm: boolean) => (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          type={inForm ? "submit" : "button"}
          disabled={busy || !proof || Boolean(disabled)}
          title={disabled}
          onClick={inForm ? undefined : () => proof && onSubmit(proof)}
        >
          {busy && <Spinner />} {submitLabel}
        </Button>
      </div>
      {disabled && <p className="text-sm text-zinc-500">{disabled}.</p>}
    </div>
  );

  if (google) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        <p>
          Signed in with Google as <strong>{google.email}</strong>.{" "}
          <button
            type="button"
            className="text-zinc-500 underline"
            onClick={() => setGoogle(undefined)}
          >
            Use another account
          </button>
        </p>
        {children}
        {submitButton({ email: google.email, googleIdToken: google.idToken }, false)}
      </div>
    );
  }

  if (offerGoogle) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">
          Sign in with your @{emailDomain} Google account to show you are a student here.
        </p>
        <GoogleSignInButton clientId={googleClientId} onSignedIn={setGoogle} />
        {emailCodes && (
          <button
            type="button"
            className="w-fit text-zinc-500 underline"
            onClick={() => setUseCode(true)}
          >
            Get a code by email instead
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendCode();
        }}
      >
        <Field
          label="Institute email address"
          hint={`Only @${emailDomain} addresses can register.`}
        >
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={`f20230001@${emailDomain}`}
            autoComplete="email"
            required
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant={sentTo ? "secondary" : "primary"} disabled={sending}>
            {sending && <Spinner />} {sentTo ? "Send a new code" : "Send me a code"}
          </Button>
          {googleClientId !== null && (
            <button
              type="button"
              className="text-sm text-zinc-500 underline"
              onClick={() => setUseCode(false)}
            >
              Sign in with Google instead
            </button>
          )}
        </div>
      </form>

      {sentTo && (
        <form
          className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800"
          onSubmit={(event) => {
            event.preventDefault();
            if (/^\d{6}$/.test(code.trim())) onSubmit({ email: sentTo, code: code.trim() });
          }}
        >
          <p className="text-sm">
            We sent a six-digit code to <strong>{sentTo}</strong>. It works for ten minutes.
            {isLocalChain && (
              <>
                {" "}
                Locally, the email lands in{" "}
                <a
                  href="http://127.0.0.1:8025"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Mailpit
                </a>
                .
              </>
            )}
          </p>
          <Field label="Code">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="123456"
              autoComplete="one-time-code"
              required
            />
          </Field>
          {children}
          {submitButton(
            /^\d{6}$/.test(code.trim()) ? { email: sentTo, code: code.trim() } : undefined,
            true,
          )}
        </form>
      )}

      {problem && <p className="text-sm text-red-700 dark:text-red-400">{problem}</p>}
    </div>
  );
}
