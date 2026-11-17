import { explorerTx } from "@/lib/env";
import type { TransactionState } from "@/lib/transaction";

import { ExternalLink, Mono, Notice } from "./ui";

function TransactionLink({ hash }: { hash: string }) {
  const href = explorerTx(hash);
  return href ? (
    <ExternalLink href={href}>
      <Mono value={hash} />
    </ExternalLink>
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
      return <Notice busy>Waiting for the wallet…</Notice>;
    case "confirming":
      return (
        <Notice busy>
          Waiting for the transaction <TransactionLink hash={state.hash} />…
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
