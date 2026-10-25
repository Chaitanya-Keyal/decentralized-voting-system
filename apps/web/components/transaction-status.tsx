import { explorerTx } from "@/lib/env";
import type { TransactionState } from "@/lib/transaction";

import { Mono, Notice, Spinner } from "./ui";

function TransactionLink({ hash }: { hash: string }) {
  const href = explorerTx(hash);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="underline">
      <Mono value={hash} />
    </a>
  ) : (
    <Mono value={hash} />
  );
}

/** What is happening to the transaction a button sent. */
export function TransactionStatus({ state }: { state: TransactionState }) {
  switch (state.status) {
    case "idle":
      return null;
    case "pending":
      return (
        <Notice>
          <span className="flex items-center gap-2">
            <Spinner /> Waiting for the wallet…
          </span>
        </Notice>
      );
    case "confirming":
      return (
        <Notice>
          <span className="flex items-center gap-2">
            <Spinner /> Waiting for the transaction <TransactionLink hash={state.hash} />…
          </span>
        </Notice>
      );
    case "done":
      return (
        <Notice tone="success">
          Done in transaction <TransactionLink hash={state.hash} />.
        </Notice>
      );
    case "failed":
      return <Notice tone="error">{state.message}</Notice>;
  }
}
