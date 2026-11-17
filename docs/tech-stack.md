# Technology Stack and Justification

The assignment is graded partly on *justifying design decisions*, so every choice below
carries its reasoning and the alternative it beat.

## Smart contract layer

| Choice | Alternative considered | Why this one |
|---|---|---|
| **Solidity `^0.8.28`** | Vyper, Rust/Solana | Largest ecosystem, matches the course, and one language for the local node and the public testbed alike |
| **Foundry** (forge/cast/anvil) | Hardhat 3, Truffle | Tests are written *in Solidity*, so there is no context-switching, and the course is about Solidity. `forge snapshot` emits per-function gas numbers for free, which is literally one of our graded evaluation parameters. Built-in fuzzing gives us adversarial ballot tests cheaply. Single toolchain, one language. |
| **OpenZeppelin Contracts 5.x** | Hand-rolled | Audited `AccessControl`, `ERC2771Forwarder`, `MerkleProof`, `Clones`. Writing our own access control in a security-focused project would be indefensible. |
| **EIP-1167 minimal proxies** | Deploy a fresh `Election` each time | Each election is a tiny clone that forwards to one shared implementation, so creating an election costs a small fraction of a full deployment; A1 measures the actual figure. The implementation cannot be upgraded, so the rules cannot change mid-vote. |
| **Semaphore v4** | Custom circom circuits, MACI | Audited, maintained, has the exact primitive we need (anonymous group membership + nullifier). Writing our own circuits would consume the entire project budget. We use its verifier and nullifier scheme but **not** its on-chain group management; the tree is built off-chain so registration stays O(1) in gas. Groth16 needs a circuit-specific trusted setup, so the eligibility guarantee rests on one: we take the published phase-two ceremony artifacts for the Semaphore circuits rather than running a ceremony of our own, and pin their SHA-256 hashes, checked against the `@zk-kit/semaphore-artifacts` npm package and the published copies; the browser refuses a file that does not match. If every contributor to that ceremony colluded, forged membership proofs would verify, which is why the contract also caps accepted ballots at the declared roll size. MACI adds coercion resistance but needs a coordinator and far more infrastructure than the schedule allows. |

> **Note on Hardhat:** Hardhat 3's Rust rewrite closed most of the speed gap and it wins
> when contracts are tightly coupled to a TypeScript codebase. We still chose Foundry
> because Solidity-native tests are a better learning outcome for a blockchain course,
> and `wagmi` CLI generates typed TS bindings straight from Foundry ABIs, so we get the
> TypeScript integration without adopting a second toolchain.

## Blockchain testbed

**Deployment target: Ethereum Sepolia.** Sepolia is the Ethereum Foundation's recommended
testnet for application and smart-contract development. It has the deepest faucet and
tooling support of any testnet (Alchemy, QuickNode, Google Cloud, Chainlink, Infura),
which matters for a project that funds many test ballots. Its execution normally matches
Ethereum mainnet, but since 6 October 2026 it runs the Glamsterdam upgrade ahead of mainnet, and
Glamsterdam's EIP-8037 makes creating state (new storage slots, deployed code) several times
dearer. Gas measured on Sepolia is therefore what a future mainnet would charge, not today's, and
we report it beside the local figures rather than in place of them.

**Local: a Foundry node (Anvil).** Development, and the gas parameters. Gas is
deterministic given the same bytecode and calldata, so a local sweep over roll sizes from
ten to a hundred thousand (C1) is exact, instant and free, where the same run on a testnet
would drain faucets. The throughput and ceiling runs go here too, so network noise is not
mistaken for a system property, and the reorg test needs a chain the harness can
manipulate. Only end-to-end latency and the live demonstration need Sepolia itself.

Cost is graded as gas (A1), which depends only on the bytecode, the calldata and the chain's gas
rules. A fiat cost per vote is not a
parameter, because converting gas to money needs a gas price and an exchange rate the
project does not control; Ethereum mainnet gas is not cheap, so any rupee figure the report
quotes is a stated illustration rather than a target.

## Frontend

| Choice | Why |
|---|---|
| **Next.js 16 (App Router) + TypeScript** | Server components for the public dashboard, static export possible for IPFS hosting, and a DApp served from IPFS is a genuinely decentralized front door |
| **wagmi v2 + viem** | viem is typed, tree-shakeable, and far lighter than ethers v6; the wagmi CLI generates typed ABIs from our Foundry build, so contract changes surface as type errors. Stay on wagmi 2: RainbowKit 2 does not support wagmi 3 |
| **RainbowKit** | Multi-wallet connect with almost no code; wallet UX is not where we should spend our budget |
| **Tailwind CSS 4** | Three role-based UIs on a tight schedule; a handful of small components of our own (`components/ui.tsx`) cover them without a component library |
| **@semaphore-protocol/proof + snarkjs in a Web Worker** | Proving blocks the thread it runs on, so it runs in a worker to keep the UI responsive. In Node.js on one thread it takes about 0.6 to 1.5 s depending on the tree's depth (`bench/results`); phones will be slower, and parameter B2 measures them with the app's `/bench` page. |

## Backend

| Choice | Alternative | Why |
|---|---|---|
| **Node 22+ + TypeScript + Fastify** | Express, NestJS | Same language as the frontend (shared types across the whole repo), faster than Express, lighter than NestJS |
| **PostgreSQL + Prisma** | MongoDB | The indexer's data is relational (elections → candidates → ballots) and we want transactional integrity on the registrar's voter records |
| **viem** (server-side too) | ethers | One chain library across frontend, backend, and codegen |
| **IPFS (a Kubo node)** | On-chain storage | On-chain storage is paid per byte, while a CID is a short fixed-size hash of the content, so pinning the manifesto and the voter list to IPFS and storing only the CID keeps them tamper-evident for far less gas. Anyone can pin their own copy by CID. |
| **BullMQ + Redis** | Naive async | Relayer needs a durable, rate-limited queue; a dropped ballot is a lost vote. Redis is the relayer's own store, separate from the registrar's Postgres |
| **jose** | Google's client library | Verifies Google sign-in ID tokens against Google's published keys, with the issuer, audience, expiry and hosted-domain checks Google documents, in a few lines and without Google's SDK |

## Repository and tooling

- **pnpm workspaces** monorepo: six packages, one `pnpm install`.
- **Layout:**

  ```
  contracts/        Foundry project (src, test, script, deployments, gas snapshots)
  apps/web/         Next.js frontend
  apps/api/         Fastify API (registrar, metadata), indexer, relayer
  packages/shared/  generated ABIs, shared types, Merkle and Semaphore utilities
  e2e/              Playwright end-to-end tests
  bench/            benchmark scripts and result CSVs
  docs/             design docs
  reports/          LaTeX sources for the Eval 1 and Eval 2 reports
  Dockerfile        one image for the web app, the API, the indexer and the relayer
  ```

- **GitHub Actions CI** on every PR: Prettier, ESLint, `tsc`, the tests and the Next.js build for
  the TypeScript packages; `forge fmt --check`, `forge lint`, `forge build`, Slither and
  `forge test` for the contracts; and both kinds of election end to end in a browser. Green CI is
  a precondition for merge.
- **Slither + `forge coverage`**: Slither reports nothing with one detector excluded,
  `timestamp`, because phases are time-gated by design and a block's timestamp is fixed by its
  slot; a proposer can at most skip its slot, delaying a phase change by 12 seconds.
  `forge coverage` measured 98.9% of lines and every branch of the contracts. Both are
  engineering hygiene, not evaluation parameters.

## Deliberately out of scope

Recording these keeps the report honest and gives us a real "future work" section.

- **MACI-style coercion resistance**: needs a coordinator, key rotation, and a much
  larger circuit budget.
- **Homomorphic encrypted tallying**: would hide intermediate results (currently the
  running tally is public, which can influence late voters). Genuinely interesting, but a
  project of its own.
- **Ranked-choice / quadratic voting**: `TallyLib` is structured so these can be added;
  we ship plurality and approval voting.
- **Real government-grade identity**: we use the institute email address, proved by an emailed
  code or by Google sign-in for the institute's domain. Production would need
  Aadhaar/DigiLocker-class verification, which we discuss but do not build.
- **Splitting the registrar**: one party controls enrolment, and committing the roll size
  before any ballot exists bounds that power rather than checking it. The genuine remedies
  are distributing the registrar across parties that each hold a share of the enrolment, or
  requiring candidate-appointed observers to co-sign the leaf set before the root freezes.
  Neither is built here; see the roll correctness non-guarantee in
  [architecture.md](architecture.md).
