## What

<!-- One or two sentences. What does this change do? -->

## Why

<!-- Link the issue or milestone. What problem does this solve? -->

## How to verify

<!-- Exact steps a reviewer runs to see this working. Not "tested locally". -->

1.
2.

## Checklist

- [ ] Tests added or updated (required for contract changes)
- [ ] `forge test` passes
- [ ] `pnpm format:check && pnpm lint && pnpm typecheck` pass
- [ ] No secrets, keys, or `.env` files in the diff
- [ ] Docs updated if behaviour or architecture changed

## Gas impact

<!-- Contract changes: paste `forge snapshot --diff`. Otherwise write N/A. -->

```
N/A
```
