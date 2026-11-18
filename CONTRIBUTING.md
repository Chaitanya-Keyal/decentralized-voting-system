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
  and `forge fmt --check`, `forge lint`, `forge build`, Slither and `forge test` for the
  contracts, plus checks that the generated ABIs and the gas snapshots match the contracts. A
  third job runs two elections end to end in a browser, one with wallet ballots and one with
  anonymous ballots, and audits both.
- Contract changes must include tests. A contract PR with no new tests will be sent back.
- Squash-merge into `main`.

## Local setup

You need Node.js 22 or newer, pnpm 10 or newer (`npm install -g pnpm`; it switches itself to the
version this repo pins), Docker, and Foundry for the contracts.

```bash
pnpm install
cp .env.example .env               # works as it is for a local chain
docker compose up -d               # Postgres, Redis and IPFS
anvil                              # a local chain; leave it running in its own terminal
pnpm deploy:local                  # deploy the contracts to it
pnpm db:migrate                    # create the database tables
pnpm --filter @dvote/web artifacts # optional: serve the proving files locally
pnpm dev                           # the web app, the API, the indexer and the relayer
```

Then open <http://localhost:3000>.

The web app proves anonymous ballots with Semaphore's published proving files. `pnpm --filter
@dvote/web artifacts` downloads them into `apps/web/public/semaphore`, checking each against the
SHA-256 pinned in `packages/shared/src/semaphore-artifacts.json`; without them the browser
fetches the published copies and checks them the same way.

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

1. Connect Anvil account 0 and create an election under **New election**. Choose anonymous or
   wallet ballots and plurality or approval counting. The registrar is filled in: it is Anvil
   account 1, which the API uses.
2. On the election page, **Move the chain's clock** skips to the next step. A real chain's clock
   cannot be moved, so the button appears only on Anvil.
3. Register voters. In a wallet election, connect another account for each voter. In an
   anonymous election no wallet is needed: the browser makes a voting key and downloads a backup
   of it, so use a separate browser profile, or a private window, per voter, or restore a backup
   to switch. Voters sign in with Google, which needs `GOOGLE_CLIENT_ID` in `.env`: the client ID
   of an OAuth client in Google Cloud that lists `http://localhost:3000` as an authorised
   JavaScript origin.
4. Once registration closes, the registrar publishes the voter list by itself within a few
   seconds. Then open voting, vote as each voter, close voting and finalize. Anonymous ballots
   are proved in the browser and submitted by the relayer, which pays the gas.
5. **Run the audit** on the election page recounts the result from the chain's events and the
   published list, without the API.

To use a browser wallet such as MetaMask instead, add a network with RPC URL
`http://127.0.0.1:8545` and chain ID 31337, and import the test accounts `anvil` prints when it
starts.

### Tests

```bash
pnpm test:contracts                # Foundry
pnpm test                          # Vitest; the API's tests need Postgres, Redis and Foundry
pnpm e2e                           # Playwright: both kinds of election end to end, in a browser
```

The API's tests start their own Anvil node and create a database of their own for each run, so
they never touch your development setup; the relayer's tests keep to Redis keys of their own.
`pnpm e2e` drives the running stack from the setup above; install its browser once with
`pnpm --filter @dvote/e2e exec playwright install --only-shell chromium`. Its voters sign in
through a stand-in for Google (`e2e/google.ts`), so start the API for it with
`GOOGLE_CLIENT_ID=dvote-e2e.apps.googleusercontent.com GOOGLE_JWKS_URL=http://127.0.0.1:4410/certs`,
where the test serves the stand-in's keys. With
`SCREENSHOTS=<directory>`, the end-to-end tests also save every step at desktop and phone width.

## Code style

Spaces, never tabs: two for TypeScript, JSON, YAML and CSS, four for Solidity.
`.editorconfig` sets this for any editor, and VS Code picks up the recommended extensions
and format-on-save from `.vscode/`.

```bash
pnpm format              # Prettier, writes changes
pnpm lint                # ESLint over the apps, packages and tests (pnpm lint:fix to auto-fix)
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

They also verify real Semaphore proofs made with the TypeScript library, from
`contracts/test/fixtures/semaphore-ballots.json`, against Semaphore's on-chain verifier. Proofs
are randomized, so this fixture is rewritten only on request:
`WRITE_SEMAPHORE_FIXTURE=1 pnpm --filter @dvote/shared test`.

## Gas discipline

`contracts/snapshots/tier2.json` and `tier3.json` record the gas of every step of a tier 2 and a
tier 3 election, each measured as its own transaction. CI fails if a contract change moves any of these numbers, so a
PR that changes gas runs `pnpm gas:contracts` and explains the difference. Gas is a graded
evaluation parameter, and a regression that lands unnoticed is a worse number in the final
report.

These are mainnet's current rules, which Foundry's local EVM implements. Sepolia runs
Glamsterdam, whose EIP-8037 charges far more gas for new state (contract code, storage slots
written for the first time), so the same steps cost more there; `bench/src/sepolia.ts` measures
them on Sepolia itself.

## Benchmarks

`bench/` holds the measurement scripts for the evaluation parameters; results go to
`bench/results/` as CSV.

```bash
pnpm --filter @dvote/bench gas      # C1: gas against roll size, both tiers, on a fresh Anvil
pnpm --filter @dvote/bench booth    # C2: tree rebuild and proving time against roll size
pnpm --filter @dvote/bench load     # C3: a burst of ballots through the relayer, on Anvil
pnpm --filter @dvote/bench sepolia  # A1 and B1 on Sepolia; needs throwaway testnet keys
pnpm --filter @dvote/bench d3 <election address>  # D3: try to link ballots to voters
```

`/bench` in the web app runs the C2 measurement in a browser, so it can be taken on a phone.
[`bench/README.md`](bench/README.md) gives each script's options and the files it writes.

## Deploying

To Sepolia: set `DEPLOYER_PRIVATE_KEY` (a throwaway key) and `SEPOLIA_RPC_URL`, run
`pnpm deploy:sepolia`, then `pnpm --filter @dvote/shared generate`. The deploy skips Foundry's
local simulation, which does not model EIP-8037 and would set gas limits too low, and takes each
gas limit from the node; it also publishes the source to Sourcify. To publish it to Etherscan
as well, run `forge verify-contract <address> <contract> --chain sepolia --verifier etherscan` in
`contracts/` with `ETHERSCAN_API_KEY` set, adding `--constructor-args` for the factories and
`SemaphoreElection`.

The `Dockerfile` builds one image for every service: the web app, the API, the indexer, the
relayer and the database migration, each started with the command in the file's header. What
the browser needs (`NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_API_URL`,
`NEXT_PUBLIC_RELAYER_URL`, `NEXT_PUBLIC_IPFS_GATEWAY`) is fixed at build time as build arguments.
The services read their other settings at start-up: those in `.env.example`. When the web app is served from another origin than the
API and the relayer, set `WEB_ORIGIN` to its origin: they accept browser requests only from the
origins listed there, and by default only from the local web app. Any setting can come from a file
instead: `NAME_FILE=/run/secrets/name` sets `NAME`, so keys and passwords can be mounted as
secrets. On a public chain the registrar needs `GOOGLE_CLIENT_ID`, the
registrar and relayer need their own keys, and `AUTHORITIES` must list the wallets whose
elections the deployment serves: the registrar, the relayer and the indexer all keep to them.

With `PINATA_JWT` set, the registrar copies each voter list it publishes, with its election's
description and manifestos, to Pinata, so any IPFS gateway can serve them. For elections published
before it was set, `pnpm --filter @dvote/api copy-to-pinata <election address>...` copies them from
the IPFS node at `IPFS_API_URL`.
