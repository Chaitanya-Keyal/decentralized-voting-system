"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { muted, TextButton } from "./ui";

/** The last message any copy button announced; see `copy` below. */
let lastAnnounced = "";

/**
 * Copies a value, shown as a link inside a sentence. The result is said next to it, in a status
 * region so that screen readers announce it too, and clears after a moment.
 */
export function CopyButton({
  value,
  copied = "Copied",
  children,
}: {
  /** The text to copy, or a function giving it at the moment of the click. */
  value: string | (() => string);
  copied?: string;
  children: ReactNode;
}) {
  const [result, setResult] = useState<{ ok: boolean; message: string }>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    clearTimeout(timer.current);
    let ok = true;
    try {
      await navigator.clipboard.writeText(typeof value === "function" ? value() : value);
    } catch {
      // Clipboard access can be refused; saying so beats a click that seems to do nothing.
      ok = false;
    }
    // VoiceOver skips a status message identical to the one before it, so a repeat gets a
    // no-break space, which is not read aloud, to tell it apart.
    let message = ok ? copied : "Copying failed";
    if (message === lastAnnounced) message += " ";
    lastAnnounced = message;
    setResult({ ok, message });
    timer.current = setTimeout(() => setResult(undefined), 3000);
  };

  const Icon = result?.ok ? Check : Copy;
  return (
    <>
      <TextButton onClick={() => void copy()}>
        <Icon aria-hidden className="mr-1 inline size-3.5 align-[-0.125em]" />
        {children}
      </TextButton>{" "}
      <span role="status" className={`text-xs ${muted}`}>
        {result?.message}
      </span>
    </>
  );
}
