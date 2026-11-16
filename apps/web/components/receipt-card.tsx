"use client";

import type { Receipt } from "@dvote/shared";

import { downloadReceipt, useReceiptCheck } from "@/lib/receipts";
import { formatTime } from "@/lib/time";

import { Button, Card, Mono, Notice } from "./ui";

/** A registration receipt, checked in the browser against the election's registrar. */
export function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const check = useReceiptCheck(receipt);
  return (
    <Card
      title="Your registration receipt"
      description="Keep a copy. If this wallet is missing from the published voter list, the receipt shows that the registrar accepted it."
    >
      <div className="flex flex-col gap-3 text-sm">
        <p>
          Wallet <Mono value={receipt.voter} short={false} /> was registered on{" "}
          {formatTime(receipt.issuedAt)}.
        </p>
        {check.data?.valid === true && (
          <p className="text-zinc-600 dark:text-zinc-400">
            ✓ The receipt is signed by this election&apos;s registrar, as recorded in the contract.
          </p>
        )}
        {check.data?.valid === false && (
          <Notice tone="error">
            This receipt is not signed by the registrar the contract names.
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
