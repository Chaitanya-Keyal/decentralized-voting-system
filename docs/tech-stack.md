# Technology Stack and Justification

The assignment is graded partly on *justifying design decisions*, so every choice below
carries its reasoning and the alternative it beat.

## Smart contract layer

| Choice | Alternative considered | Why this one |
|---|---|---|
| **Solidity `^0.8.28`** | Vyper, Rust/Solana | Largest ecosystem, matches the course, and one language for the local node and the public testbed alike |
| **Foundry** (forge/cast/anvil) | Hardhat 3, Truffle | Tests are written *in Solidity*, so there is no context-switching, and the course is about Solidity. `forge snapshot` emits per-function gas numbers for free, which is literally one of our graded evaluation parameters. Built-in fuzzing gives us adversarial ballot tests cheaply. Single toolchain, one language. |
| **OpenZeppelin Contracts 5.x** | Hand-rolled | Audited `AccessControl`, `ERC2771Forwarder`, `MerkleProof`, `Clones`. Writing our own access control in a security-focused project would be indefensible. |
| **EIP-1167 minimal proxies** | Deploy a fresh `Election` each time | Deploying election #50 should drop from roughly 2M gas to roughly 45k. rather than repeating it. |
| **Semaphore v4** | Custom circom circuits, MACI | Audited, maintained, has the exact primitive we need (anonymous group membership + nullifier). Writing our own circuits would consume the entire project budget. We use its verifier and nullifier scheme but **not** its on-chain group management; the tree is built off-chain so registration stays O(1) in gas. Groth16 needs a circuit-specific trusted setup, so the eligibility guarantee rests on one: we take the published phase-two ceremony artifacts for the Semaphore circuits and verify their hashes against the Semaphore repository rather than running a ceremony of our own. If every contributor to that ceremony colluded, forged membership proofs would verify, which is why the contract also caps accepted ballots at the declared roll size. MACI adds coercion resistance but needs a coordinator and far more infrastructure than the schedule allows. |

> **Note on Hardhat:** Hardhat 3's Rust rewrite closed most of the speed gap and it wins
> when contracts are tightly coupled to a TypeScript codebase. We still chose Foundry
> because Solidity-native tests are a better learning outcome for a blockchain course,
> and `wagmi` CLI generates typed TS bindings straight from Foundry ABIs, so we get the
> TypeScript integration without adopting a second toolchain.

## Blockchain testbed

**Deployment target: Polygon Amoy (chain 80002), and nothing else.** Amoy is the
officially maintained Polygon PoS testnet, its lifecycle is independent of the Sepolia
sunset, and blocks of about 2s keep the demo responsive. Faucets: Alchemy, QuickNode,
Chainlink, ETHGlobal. (The *official* Polygon faucet is deprecated; use the third-party
ones.)

One naming point, because the report is graded on precision: Polygon PoS is a
**checkpointed sidechain, not a rollup**. It runs its own validator set and its own
consensus and periodically checkpoints state to Ethereum; it does not publish transaction
data to Ethereum and does not inherit Ethereum's security for execution. We describe it
that way throughout and we do not call it a Layer-2.

**Ethereum Sepolia: not used.** Sepolia reaches end-of-life on 30 September 2026, four
days after Eval 1, and the first deployable contract does not exist until milestone M1 in
October. There is therefore no day on which both a live Sepolia and a working contract
exist, and a secondary target we can never deploy to is not a target. Base Sepolia does
not rescue it, because Base Sepolia settles to Sepolia and has published no migration plan
of its own, so that whole family inherits the same schedule.

**Local: Anvil.** Development, the gas parameters (gas is deterministic given the same
bytecode and calldata, so local measurement is exact rather than approximate), the
throughput and ceiling runs, and the reorg test, which needs a chain that can be
manipulated.

### Why the L1-versus-L2 comparison was dropped

The calendar is the smaller reason. The larger one is that the comparison was never an
experiment. Gas is a function of the EVM and of the bytecode, so an identical suite
consumes identical gas on Ethereum and on Polygon, and running it on both would have
produced two copies of the same A1 number. The entire difference between the two networks
is a fee market, gas price multiplied by token price, and both networks hand out
valueless test tokens, so any rupee figure has to be imported from mainnet price feeds
wherever the transaction ran. The second reason is the naming point above: Polygon PoS is
a sidechain, so pricing it against Ethereum compares two EVM fee markets and is not a
result about rollup economics.

A2 states the gas price and token price it used, so the rupee figure can be recomputed. It prices the single gas figure A1 produces under several fee
regimes (Ethereum mainnet, Polygon PoS mainnet, Polygon Amoy) and reports a band across a
range of gas prices instead of one number, because a quote taken on one afternoon is a
screenshot rather than a cost. It needs no second network, which is why dropping Sepolia
costs the report nothing. If a live layer-1 figure is still wanted in November, we name a
successor testnet rather than one with a published shutdown date.

Faucet drip, not price, is the binding constraint on Amoy: roughly 0.009 POL per vote
against roughly 0.1 POL per claim per day means a sustained load run is not fundable on a
testnet inside this project's window. That is why the gas and throughput parameters run on
Anvil, and Amoy carries only end-to-end latency, indexer lag and the live demo. See the
benchmark methodology in [evaluation-parameters.md](evaluation-parameters.md).

## Frontend

| Choice | Why |
|---|---|
| **Next.js 15 (App Router) + TypeScript** | Server components for the public dashboard, static export possible for IPFS hosting, and a DApp served from IPFS is a genuinely decentralized front door |
| **wagmi v2 + viem** | viem is typed, tree-shakeable, and far lighter than ethers v6; wagmi CLI generates hooks from our Foundry ABIs so contract changes surface as type errors |
| **RainbowKit** | Multi-wallet connect with almost no code; wallet UX is not where we should spend our budget |
| **Tailwind + shadcn/ui** | Three distinct role-based UIs to build on a tight schedule; component velocity matters |
| **@semaphore-protocol/proof + snarkjs in a Web Worker** | Proof generation is expected to take 1 to 3 seconds on desktop hardware, taken from published Semaphore benchmarks rather than from anything we have timed, and it blocks the main thread. A worker keeps the UI responsive; parameter B2 replaces the expectation with a measurement on the devices we can borrow, and reports worker against main-thread proving time with it. |

## Backend

| Choice | Alternative | Why |
|---|---|---|
| **Node 22 + TypeScript + Fastify** | Express, NestJS | Same language as the frontend (shared types across the whole repo), faster than Express, lighter than NestJS |
| **PostgreSQL + Prisma** | MongoDB | The indexer's data is relational (elections → candidates → ballots) and we want transactional integrity on the registrar's voter records |
| **viem** (server-side too) | ethers | One chain library across frontend, backend, and codegen |
| **IPFS via Pinata** | On-chain storage | Storing a 2KB manifesto on-chain should cost roughly 40x the gas of a 32-byte CID. rather than assuming it. |
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
- **Splitting the registrar**: one party controls enrolment, and committing the roll size
  before any ballot exists bounds that power rather than checking it. The genuine remedies
  are distributing the registrar across parties that each hold a share of the enrolment, or
  requiring candidate-appointed observers to co-sign the leaf set before the root freezes.
  Neither is built here; see the roll correctness non-guarantee in
  [architecture.md](architecture.md).
