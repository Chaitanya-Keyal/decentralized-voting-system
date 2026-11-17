"use client";

import { useMemo, useState } from "react";
import { renderSVG } from "uqr";

import { downloadFile } from "@/lib/download";
import type { OnchainElection } from "@/lib/election";
import { chain } from "@/lib/env";
import {
  downloadIdentityBackup,
  forgetIdentity,
  transferLink,
  useStoredIdentity,
} from "@/lib/identity";

import { Button, Card, Notice, TextButton } from "../ui";

/** A calendar file reminding the voter when voting opens, with a link to the booth. */
function downloadReminder(election: OnchainElection) {
  const stamp = (seconds: bigint | number) =>
    new Date(Number(seconds) * 1000)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = (text: string) => text.replace(/[\\;,]/g, (match) => `\\${match}`);
  const booth = `${window.location.origin}/elections/${election.address}/vote`;
  const start = election.schedule.votingStart;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DVote//EN",
    "BEGIN:VEVENT",
    `UID:dvote-${election.address}@dvote`,
    `DTSTAMP:${stamp(Math.floor(Date.now() / 1000))}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(Number(start) + 15 * 60)}`,
    `SUMMARY:${escape(`Vote: ${election.title}`)}`,
    `DESCRIPTION:${escape(`Voting is open until ${new Date(Number(election.schedule.votingEnd) * 1000).toLocaleString()}. ${booth}`)}`,
    `URL:${booth}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  downloadFile("dvote-voting-reminder.ics", lines.join("\r\n"), "text/calendar");
}

/**
 * Moving the voting key to the device the voter will vote on. A key lives in one browser, so a
 * voter who registers on a laptop and votes on a phone, or whose link opens in another app's
 * browser, needs it there first. The QR code and the link carry the key itself.
 */
export function KeyTransfer({ election }: { election: OnchainElection }) {
  const identity = useStoredIdentity(chain.id, election.address);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
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
    <Card title="Where will you vote?">
      <div className="flex flex-col gap-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
            <p className="font-medium">Here, on this device and in this browser</p>
            <p className="text-zinc-600 dark:text-zinc-400">
              Nothing more to do. Come back when voting opens.
            </p>
            <TextButton className="w-fit" onClick={() => downloadReminder(election)}>
              Add a reminder to my calendar
            </TextButton>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-zinc-300 p-4 dark:border-zinc-700">
            <p className="font-medium">
              Somewhere else: another phone or computer, another browser, or a link opened inside
              WhatsApp or another app
            </p>
            <p className="text-zinc-600 dark:text-zinc-400">
              Your voting key is in this browser only. Move it there now; it cannot be recovered
              later.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setShown(true)}>Show a QR code</Button>
              <Button variant="secondary" onClick={() => void share()}>
                {copied ? "Link copied" : "Send the link to yourself"}
              </Button>
            </div>
          </div>
        </div>
        {shown && (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            {qr && (
              // Generated here, from the link alone; as an image, nothing is parsed into the page.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`}
                alt="QR code that opens the ballot booth with your voting key"
                className="size-44 shrink-0 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800"
              />
            )}
            <p className="text-zinc-600 dark:text-zinc-400">
              Scan this with the phone you will vote on. It opens the ballot booth with your key;
              come back to it when voting opens.
            </p>
          </div>
        )}
        <p className="text-zinc-600 dark:text-zinc-400">
          Anyone with this code or link can cast your ballot, so send it only to yourself. You can
          also{" "}
          <TextButton onClick={() => downloadIdentityBackup(chain.id, election.address, identity)}>
            download the key as a file
          </TextButton>
          .
        </p>
        <p className="text-zinc-600 dark:text-zinc-400">
          On a shared computer? Once the key is on your own device, remove it from this browser and
          delete the downloaded key file.{" "}
          <TextButton tone="danger" onClick={() => setConfirmRemove(true)}>
            Remove the key from this browser
          </TextButton>
        </p>
        {confirmRemove && (
          <Notice tone="warning">
            <div className="flex flex-col gap-3">
              <span>
                Remove the voting key from this browser? Do this only if the key is on your own
                device: without it you cannot vote.
              </span>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" onClick={() => forgetIdentity(chain.id, election.address)}>
                  Yes, remove it
                </Button>
                <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          </Notice>
        )}
      </div>
    </Card>
  );
}
