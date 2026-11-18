import { transactionSources } from "@/lib/sources";
import type { TransactionState } from "@/lib/transaction";

import { SourcesLink } from "./sources-link";
import { Mono, Notice } from "./ui";

function TransactionLink({ hash }: { hash: string }) {
  return (
    <SourcesLink sources={transactionSources(hash)}>
      <Mono value={hash} />
    </SourcesLink>
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
