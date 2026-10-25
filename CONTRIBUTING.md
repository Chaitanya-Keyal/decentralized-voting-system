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
- CI must be green: formatting, lint, typecheck and build for the TypeScript packages, and
  `forge fmt --check`, `forge lint`, `forge build` and `forge test` for the contracts.
- Contract changes must include tests. A contract PR with no new tests will be sent back.
- Squash-merge into `main`.

## Local setup

You need Node.js 22 or newer, pnpm 10 or newer (`npm install -g pnpm`; it switches itself to the
version this repo pins), Docker, and Foundry for the contracts.

```bash
pnpm install
cp .env.example .env               # then fill in your own keys
docker compose up -d               # Postgres and Redis
pnpm dev                           # web + api
pnpm test:contracts                # Foundry tests
```

`pnpm install` also fetches the Solidity libraries (OpenZeppelin, Semaphore, forge-std)
into `contracts/node_modules`, so there are no git submodules.

Foundry: `curl -L https://foundry.paradigm.xyz | bash && foundryup`, then add
`~/.foundry/bin` to your `PATH`.

## Code style

Spaces, never tabs: two for TypeScript, JSON, YAML and CSS, four for Solidity and Python.
`.editorconfig` sets this for any editor, and VS Code picks up the recommended extensions
and format-on-save from `.vscode/`.

```bash
pnpm format              # Prettier, writes changes
pnpm lint                # ESLint over the whole workspace (pnpm lint:fix to auto-fix)
pnpm typecheck           # tsc in every package, strict mode
pnpm format:contracts    # forge fmt
pnpm lint:contracts      # forge lint
```

Run all of these before opening a pull request; CI runs the same checks and fails on any
difference. TypeScript is strict everywhere, including `noUncheckedIndexedAccess`, and ESLint
uses type-aware rules, so floating promises and unsafe `any` are errors.

## Gas discipline

Every contract PR that touches a hot path runs `forge snapshot --diff` and pastes the
result in the PR. Gas is a graded evaluation parameter, and a regression that lands
unnoticed is a worse number in the final report.
