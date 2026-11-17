"use client";

import { useMemo, useState } from "react";
import { renderSVG } from "uqr";

import type { OnchainElection } from "@/lib/election";
import { chain } from "@/lib/env";
import {
  downloadIdentityBackup,
  forgetIdentity,
  transferLink,
  useStoredIdentity,
} from "@/lib/identity";

import { Button, Card } from "./ui";

/**
 * Moving the voting key to the device the voter will vote on. A key lives in one browser, so a
 * voter who registers on a laptop and votes on a phone, or whose link opens in another app's
 * browser, needs it there first. The QR code and the link carry the key itself.
 */
export function KeyTransfer({ election }: { election: OnchainElection }) {
  const identity = useStoredIdentity(chain.id, election.address);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = useMemo(
    () => (identity ? transferLink(election.address, identity) : undefined),
    [identity, election.address],
  );
  const qr = useMemo(
    () => (shown && link ? renderSVG(link, { border: 1 }) : undefined),
    [shown, link],
  );
  if (!identity || !link) return null;

  const share = async () => {
    if (typeof navigator.share === "function") {
      await navigator
        .share({ title: `Your voting key for ${election.title}`, url: link })
        .catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  return (
    <Card
      title="Voting from another device?"
      description="Your voting key is in this browser only. If you will vote on your phone or in another browser, move the key there now; it cannot be recovered later."
    >
      <div className="flex flex-col gap-4 text-sm">
        {!shown ? (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setShown(true)}>Show a QR code to scan</Button>
            <Button variant="secondary" onClick={() => void share()}>
              {copied ? "Link copied" : "Send the link to yourself"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div
              className="size-44 shrink-0 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800"
              // Generated here, from the link alone.
              dangerouslySetInnerHTML={{ __html: qr ?? "" }}
            />
            <p className="text-zinc-600 dark:text-zinc-400">
              Scan this with the phone you will vote on. It opens the ballot booth with your key;
              come back to it when voting opens.
            </p>
          </div>
        )}
        <p className="text-zinc-600 dark:text-zinc-400">
          Anyone with this code or link can cast your ballot, so send it only to yourself. You can
          also{" "}
          <button
            type="button"
            className="underline"
            onClick={() => downloadIdentityBackup(chain.id, election.address, identity)}
          >
            download the key as a file
          </button>
          .
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          On a shared computer? Once the key is on your own device, remove it from this browser and
          delete the downloaded key file.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              if (
                window.confirm(
                  "Remove the voting key from this browser? Do this only if the key is on your own device: without it you cannot vote.",
                )
              ) {
                forgetIdentity(chain.id, election.address);
              }
            }}
          >
            Remove the key from this browser
          </button>
        </p>
      </div>
    </Card>
  );
}
