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
- CI must be green: formatting, lint, typecheck, tests and build for the TypeScript packages,
  and `forge fmt --check`, `forge lint`, `forge build` and `forge test` for the contracts, plus
  checks that the generated ABIs and the gas snapshot match the contracts. A third job runs an
  election end to end in a browser.
- Contract changes must include tests. A contract PR with no new tests will be sent back.
- Squash-merge into `main`.

## Local setup

You need Node.js 22 or newer, pnpm 10 or newer (`npm install -g pnpm`; it switches itself to the
version this repo pins), Docker, and Foundry for the contracts.

```bash
pnpm install
cp .env.example .env               # works as it is for a local chain
docker compose up -d               # Postgres, Redis, IPFS and Mailpit
anvil                              # a local chain; leave it running in its own terminal
pnpm deploy:local                  # deploy the contracts to it
pnpm db:migrate                    # create the database tables
pnpm dev                           # the web app, the API and the indexer
```

Then open <http://localhost:3000>.

`pnpm install` also fetches the Solidity libraries (OpenZeppelin, Semaphore, forge-std)
into `contracts/node_modules`, so there are no git submodules.

Foundry: `curl -L https://foundry.paradigm.xyz | bash && foundryup`, then add
`~/.foundry/bin` to your `PATH`.

The contracts land at the addresses in `contracts/deployments/31337.json` only on a fresh chain,
so restart `anvil` rather than deploying a second time. A restarted Anvil is a new chain that
reuses those addresses; the indexer notices and clears everything the database held about the
old one, registrations included.

### Trying an election in the browser

On Anvil, the wallet menu also lists Anvil's own accounts. The node holds their keys and signs
for them, so you can play every role from one browser without a wallet extension:

1. Connect Anvil account 0 and create an election under **New election**. The registrar is
   filled in: it is Anvil account 1, which the API uses.
2. On the election page, **Move the chain's clock** skips to the next step. A real chain's clock
   cannot be moved, so the button appears only on Anvil.
3. Register voters as other accounts. The codes are emailed to Mailpit, at
   <http://127.0.0.1:8025>.
4. Once registration closes, the registrar publishes the voter list by itself within a few
   seconds. Then open voting, vote as each account, close voting and finalize.

To use a browser wallet such as MetaMask instead, add a network with RPC URL
`http://127.0.0.1:8545` and chain ID 31337, and import the test accounts `anvil` prints when it
starts.

### Tests

```bash
pnpm test:contracts                # Foundry
pnpm test                          # Vitest; the API's tests need Postgres and Foundry
pnpm e2e                           # Playwright: one election end to end, in a browser
```

The API's tests start their own Anvil node and create a database of their own for each run, so
they never touch your development setup. `pnpm e2e` drives the running stack from the setup above;
install its browser once with `pnpm --filter @dvote/e2e exec playwright install --only-shell
chromium`.

## Code style

Spaces, never tabs: two for TypeScript, JSON, YAML and CSS, four for Solidity and Python.
`.editorconfig` sets this for any editor, and VS Code picks up the recommended extensions
and format-on-save from `.vscode/`.

```bash
pnpm format              # Prettier, writes changes
pnpm lint                # ESLint over the whole workspace (pnpm lint:fix to auto-fix)
pnpm typecheck           # tsc in every package, strict mode
pnpm test                # Vitest in every package that has tests
pnpm format:contracts    # forge fmt
pnpm lint:contracts      # forge lint
```

Run all of these before opening a pull request; CI runs the same checks and fails on any
difference. TypeScript is strict everywhere, including `noUncheckedIndexedAccess`, and ESLint
uses type-aware rules, so floating promises and unsafe `any` are errors.

## Generated code

The web app and the API import contract ABIs and deployed addresses from
`packages/shared/src/generated.ts`, which is generated from the Foundry build and
`contracts/deployments/`. After changing a contract's interface or deploying somewhere new, run:

```bash
pnpm --filter @dvote/shared generate
```

The Solidity tests replay Merkle proofs built by the TypeScript tree builder, from
`contracts/test/fixtures/voter-list.json`. After changing the tree builder, rewrite the fixture
with `pnpm --filter @dvote/shared test -u`.

## Gas discipline

`contracts/snapshots/tier2.json` records the gas of every step of a tier 2 election, each
measured as its own transaction. CI fails if a contract change moves any of these numbers, so a
PR that changes gas runs `pnpm gas:contracts` and explains the difference. Gas is a graded
evaluation parameter, and a regression that lands unnoticed is a worse number in the final
report.
