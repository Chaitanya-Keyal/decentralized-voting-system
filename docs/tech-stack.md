# Technology Stack and Justification

The assignment is graded partly on *justifying design decisions*, so every choice below
carries its reasoning and the alternative it beat.

## Smart contract layer

| Choice | Alternative considered | Why this one |
|---|---|---|
| **Solidity `^0.8.28`** | Vyper, Rust/Solana | Largest ecosystem, matches the course, EVM targets every testnet we want |
| **Foundry** (forge/cast/anvil) | Hardhat 3, Truffle | Tests are written *in Solidity*, so there is no context-switching, and the course is about Solidity. `forge snapshot` emits per-function gas numbers for free, which is literally one of our graded evaluation parameters. Built-in fuzzing gives us adversarial ballot tests cheaply. Single toolchain, one language. |
| **OpenZeppelin Contracts 5.x** | Hand-rolled | Audited `AccessControl`, `ERC2771Forwarder`, `MerkleProof`, `Clones`. Writing our own access control in a security-focused project would be indefensible. |
| **EIP-1167 minimal proxies** | Deploy a fresh `Election` each time | Deploying election #50 drops from ~2M gas to ~45k. Directly improves our scalability numbers. |
| **Semaphore v4** | Custom circom circuits, MACI | Audited, maintained, has the exact primitive we need (anonymous group membership + nullifier). Writing our own circuits would consume the entire project budget. We use its verifier and nullifier scheme but **not** its on-chain group management; the tree is built off-chain so registration stays O(1) in gas. MACI adds coercion resistance but needs a coordinator and far more infrastructure than the schedule allows. |

> **Note on Hardhat:** Hardhat 3's Rust rewrite closed most of the speed gap and it wins
> when contracts are tightly coupled to a TypeScript codebase. We still chose Foundry
> because Solidity-native tests are a better learning outcome for a blockchain course,
> and `wagmi` CLI generates typed TS bindings straight from Foundry ABIs, so we get the
> TypeScript integration without adopting a second toolchain.

## Blockchain testbed

**Primary: Polygon Amoy (chain 80002).**

The decisive factor is a calendar collision. **Ethereum Sepolia reaches end-of-life on
30 September 2026**, four days after our Eval 1 and *seven weeks before our live demo*.
Its replacement launched in March 2026 and the two run side by side during a grace
period, but building a graded November demo on a network scheduled to die in September is
an unnecessary risk. Base Sepolia settles to Sepolia and has not published its own
migration plan, so L2s in that family inherit the same uncertainty.

Polygon Amoy is the officially maintained Polygon PoS testnet, its lifecycle is
independent of the Sepolia sunset, and ~2s blocks make the demo feel responsive. Faucets:
Alchemy, QuickNode, Chainlink, ETHGlobal. (The *official* Polygon faucet is deprecated; use the third-party ones.)

Faucet drip is the real constraint, not price: roughly 0.009 POL per vote against ~0.1 POL
per claim per day means sustained load testing is not fundable on a testnet. That is why
gas is measured locally and throughput on Anvil, with Amoy reserved for latency and the
live demo. See the benchmark methodology in
[evaluation-parameters.md](evaluation-parameters.md).

**Secondary: Ethereum Sepolia**, benchmarks only, for an honest L1-vs-L2 comparison in
the performance chapter. If it degrades before November we still have the numbers, and
the comparison itself becomes a finding.

**Local: Anvil**, for development and for measuring the throughput ceiling without
network noise.

## Frontend

| Choice | Why |
|---|---|
| **Next.js 15 (App Router) + TypeScript** | Server components for the public dashboard, static export possible for IPFS hosting, and a DApp served from IPFS is a genuinely decentralized front door |
| **wagmi v2 + viem** | viem is typed, tree-shakeable, and far lighter than ethers v6; wagmi CLI generates hooks from our Foundry ABIs so contract changes surface as type errors |
| **RainbowKit** | Multi-wallet connect with almost no code; wallet UX is not where we should spend our budget |
| **Tailwind + shadcn/ui** | Three distinct role-based UIs to build on a tight schedule; component velocity matters |
| **@semaphore-protocol/proof + snarkjs in a Web Worker** | Proof generation takes 1–3s and blocks the main thread. A worker keeps the UI responsive, and worker-vs-main-thread proving time is itself a metric we report. |

## Backend

| Choice | Alternative | Why |
|---|---|---|
| **Node 22 + TypeScript + Fastify** | Express, NestJS | Same language as the frontend (shared types across the whole repo), faster than Express, lighter than NestJS |
| **PostgreSQL + Prisma** | MongoDB | The indexer's data is relational (elections → candidates → ballots) and we want transactional integrity on the registrar's voter records |
| **viem** (server-side too) | ethers | One chain library across frontend, backend, and codegen |
| **IPFS via Pinata** | On-chain storage | Storing a 2KB manifesto on-chain costs ~40x more gas than a 32-byte CID. The gas comparison is a reportable result. |
| **BullMQ + Redis** | Naive async | Relayer needs a durable, rate-limited queue; a dropped ballot is a lost vote |

## Repository and tooling

- **pnpm workspaces** monorepo: four packages, one `pnpm install`.
- **Planned layout:**

  ```
  contracts/        Foundry project (src, test, script)
  apps/web/         Next.js frontend
  apps/api/         Fastify backend + indexer + relayer
  packages/shared/  generated ABIs, shared types, Merkle utilities
  docs/             design docs
  reports/          LaTeX sources for the Eval 1 and Eval 2 reports
  bench/            benchmark harness and result CSVs
  ```

- **GitHub Actions CI**: `forge test`, `forge fmt --check`, `slither`, `tsc`, `eslint` on
  every PR. Green CI is a precondition for merge.
- **Slither + `forge coverage`**: static analysis findings and coverage percentage are
  reported as engineering-quality evaluation parameters, not just internal hygiene.

## Deliberately out of scope

Recording these keeps the report honest and gives us a real "future work" section.

- **MACI-style coercion resistance**: needs a coordinator, key rotation, and a much
  larger circuit budget.
- **Homomorphic encrypted tallying**: would hide intermediate results (currently the
  running tally is public, which can influence late voters). Genuinely interesting, but a
  project of its own.
- **Ranked-choice / quadratic voting**: `TallyLib` is structured so these can be added;
  we ship plurality, and approval voting only if Phase 3 lands early.
- **Real government-grade identity**: we use institute email OTP. Production would need
  Aadhaar/DigiLocker-class verification, which we discuss but do not build.
