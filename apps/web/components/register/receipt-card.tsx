"use client";

import type { Receipt } from "@dvote/shared";
import { ShieldCheck } from "lucide-react";

import { downloadReceipt, useReceiptCheck } from "@/lib/receipts";
import { formatTime } from "@/lib/time";

import { Button, Card, Mono, Notice } from "../ui";

/** A registration receipt, checked in the browser against the election's registrar. */
export function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const check = useReceiptCheck(receipt);
  return (
    <Card
      title="Your registration receipt"
      description="The registrar's signed confirmation that it accepted this wallet. If the wallet is ever missing from the published voter list, this receipt proves the registrar left it out."
    >
      <div className="flex flex-col gap-3 text-sm">
        <p>
          Wallet <Mono value={receipt.voter} short={false} /> was registered on{" "}
          {formatTime(receipt.issuedAt)}.
        </p>
        {check.data?.valid === true && (
          <p className="flex items-start gap-2 text-zinc-600 dark:text-zinc-400">
            <ShieldCheck
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
            />
            Checked: signed by the registrar named in this election&apos;s contract.
          </p>
        )}
        {check.data?.valid === false && (
          <Notice tone="error">
            This receipt is not signed by this election&apos;s registrar, so it doesn&apos;t prove
            you registered.
          </Notice>
        )}
        <div>
          <Button variant="secondary" onClick={() => downloadReceipt(receipt)}>
            Download the receipt
          </Button>
        </div>
      </div>
    </Card>
  );
}
