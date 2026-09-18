# Contributing

## Branches

```branch
main                       protected, always green
feat/<scope>-<short-desc>  feat/contracts-nullifier-registry
fix/<scope>-<short-desc>   fix/api-indexer-reorg
docs/<short-desc>          docs/eval1-report
bench/<short-desc>         bench/gas-vs-roll-size
```

Scope prefixes: `contracts`, `zk`, `api`, `web`, `bench`, `docs`.

Branch off the latest `main`. Rebase rather than merge to stay current; a linear history
is much easier to bisect when a demo breaks the night before.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/). The subject line says *what
changed*; the body, when there is one, says *why*.

```log
feat(contracts): add nullifier registry to prevent double voting
fix(api): handle chain reorg in indexer cursor
test(contracts): fuzz nullifier collisions across elections
bench: record gas vs voter roll size at 10^2..10^5
docs: add evaluation parameters for Eval 1
```

Types: `feat`, `fix`, `test`, `docs`, `bench`, `chore`, `refactor`, `perf`.

Subject ≤ 72 chars, imperative mood, no trailing period. Skip the body when the diff is
self-explanatory; write one when a reviewer would otherwise ask "why?".

## Pull requests

- Keep them small.
- Fill in the template, especially the *how to verify* section.
- CI must be green: `forge test`, `forge fmt --check`, `slither`, `tsc`, `eslint`.
- Contract changes must include tests. A contract PR with no new tests will be sent back.
- Squash-merge into `main`.

## Local setup

```bash
pnpm install
forge build && forge test          # contracts
cp .env.example .env               # then fill in your own keys
pnpm dev                           # web + api
```

Foundry: `curl -L https://foundry.paradigm.xyz | bash && foundryup`

## Gas discipline

Every contract PR that touches a hot path runs `forge snapshot --diff` and pastes the
result in the PR. Gas is a graded evaluation parameter; a regression that lands unnoticed
in October is a worse number in the November report.
