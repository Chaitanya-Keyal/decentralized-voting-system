# Roadmap

Evaluation 1 (problem, requirements, design, evaluation parameters) is done and its report
and slides are frozen in `reports/submitted/`. What remains is Evaluation 2: a live demo,
the complete code, and the final report. This roadmap builds everything the Evaluation 1
report committed to, in three milestones, then measures it.

The system has three tiers. Tier 1 is the conventional approach and is only a point of
comparison; tiers 2 and 3 are both built, in that order.

| Tier | Eligibility | Ballot privacy | Voter pays gas |
|---|---|---|---|
| 1 (not built) | voter list on-chain | none: ballots linked to addresses | yes |
| 2 (M1) | Merkle root | none | yes |
| 3 (M2) | Semaphore zero-knowledge proof | anonymous, protected by nullifiers | no |

Tier 2 comes first so that the cost of anonymity can be measured against a working
baseline rather than asserted, and so that the fallback is a complete voting system. Tier 3
replaces tier 2's tree rather than extending it: tier 2 uses keccak256 with OpenZeppelin
`MerkleProof`, tier 3 uses Poseidon in a LeanIMT because that is what the Semaphore circuit
checks. The lifecycle, the factory, the indexer and the gas baseline carry over.

---

## Setup

- pnpm workspace in this repo: `contracts/`, `apps/web`, `apps/api`, `packages/shared`,
  `bench/`
- Foundry project with OpenZeppelin 5.x and Semaphore contracts
- Next.js app, Fastify service, Postgres and Redis through Docker Compose
- CI on every pull request: format, lint, typecheck and build for the TypeScript packages,
  and `forge fmt --check`, `forge lint`, `forge build` and `forge test` for the contracts

---

## M1 · A vote works end to end (tier 2)

Plurality voting with plain Merkle-proof eligibility, no anonymity, no gas sponsorship,
on a local node (Anvil).

**Contracts**
- `Election` with the full lifecycle: Created, Registration, Voting, Tallying, Finalized,
  and Cancelled. Each step needs its scheduled time to have passed and an explicit
  transaction, and steps only move forward. Only the authority can configure or cancel,
  and only before voting opens; anyone can open registration, open and close voting, and
  finalize
- Candidates can change only before voting opens (FR1)
- `ElectionFactory` deploying each election as an EIP-1167 clone and keeping a list of all
  elections for auditors
- `VoterRegistry` storing the root, the voter count and the voter list's IPFS address,
  written in one transaction when registration closes and frozen afterwards (FR3)
- Voting cannot open until the list's IPFS address is published, and the schedule leaves a
  gap between the list freezing and voting opening, so voters can check they are on it
- `castVote` with `MerkleProof` verification; the tally changes only in the transaction that
  accepts a ballot, and the result is permanent once finalized (FR8)
- `TallyLib` with plurality voting
- Foundry tests for every rule above

**Shared**
- Merkle tree builder, with proofs that agree exactly between TypeScript and Solidity

**Backend**
- Fastify service with Postgres (Prisma)
- Registrar: institute email and one-time code, commitment intake with no personal data
  on-chain, a receipt signed over the commitment and the election ID (FR2), and publication
  of the voter list to IPFS with the root, the voter count and the address (FR3)
- Metadata service pinning the ballot description and candidate manifestos to IPFS (FR1)
- Indexer reading `VoteCast` events into Postgres as a read cache

**Frontend**
- Admin console: create and configure an election, open each phase
- Registration page: institute email and code; the voter's secret is created on their device
  and only the commitment is sent; the signed receipt is shown; the voter is offered a backup
  copy of the secret and told it is the only copy
- Ballot booth: downloads the voter list, checks the voter's own commitment is on it,
  builds its own proof path without asking the registrar (FR6), casts a ballot

**Done when:** from a fresh clone, start Anvil, deploy, register five voters, cast five
ballots from the browser, and see the tally.

Commit the first gas snapshot here. It is the tier 2 side of A1.

---

## M2 · Anonymous and gasless, on Sepolia (tier 3)

**Proofs**
- Poseidon LeanIMT replacing the tier 2 tree; nullifiers scoped to the election ID
- Browser proving with Semaphore v4 in a Web Worker
- The Semaphore setup files are taken from the published ceremony, and their hashes are
  checked against the Semaphore repository

**Contracts**
- `castVote` accepts a Semaphore proof against the frozen root; nullifier registry; a
  ballot is rejected once spent nullifiers would exceed the voter count (FR5)
- ERC-2771 support on `Election`, and `VoteForwarder` (OpenZeppelin `ERC2771Forwarder`)

**Backend**
- Relayer with a BullMQ queue: checks the proof and that the nullifier is unused before
  paying gas, rate limiting, and a signed receipt for every accepted ballot (FR7)
- The relayer runs as its own process with its own database and logs, separate from the
  registrar, and keeps no request logs

**Frontend**
- Proving progress, receipt screen, Sepolia network handling
- A fresh throwaway signing key for every ballot
- If no transaction appears by a deadline, the booth warns the voter and offers direct
  submission; a voter with gas can always skip the relayer (FR7)

**Deploy** the contracts to Ethereum Sepolia.

**Go/no-go, one week after M1:** if phones cannot produce valid proofs, proving moves to
the server. That fallback is weaker and is reported as weaker, because the voter's secret
leaves their device.

**Done when:** a voter holding no ETH casts an anonymous ballot on Sepolia, and nothing
on-chain links their address to it.

Commit the second gas snapshot here. The difference from M1's is the cost of anonymity (A1).

---

## M3 · Feature freeze

- Approval voting in `TallyLib`
- A clean Slither report and good test coverage
- Reorg handling in the indexer, and rebuilding the indexer from scratch
- Edge cases: empty voter list, single candidate, tie
- IPFS pinning of the voter list and metadata by us, with instructions for auditors to pin
  their own copy
- Audit dashboard reading the chain through a public RPC endpoint, never our backend: it
  re-checks every proof, rebuilds the root from the published list and recounts the tally,
  and still works with all our services switched off (FR8, D4)
- Relayer deployed somewhere reachable from a phone, with a tunnel as backup

**Tier 3 fallback, a week before the freeze:** if an anonymous ballot has not been cast on
Sepolia by then, tier 2 is what gets demonstrated, and tier 3 is reported as unfinished.

**Done when:** features are frozen. After this, only fixes, benchmarks and writing.

---

## Measurement

Every parameter in [`evaluation-parameters.md`](evaluation-parameters.md) gets a measured
value, or a written reason why it has none.

- **Harness:** everything runs through `bench/`. Raw results are committed as CSV, graphs
  are generated by script, each point is repeated several times and reported as the median
  and 95th percentile, and every number records its conditions (gas price, block number, RPC
  provider, commit, contract addresses, device)
- **A1:** gas per contract function, tier 2 against tier 3
- **B1:** end-to-end latency on Sepolia. **B2:** proof time on a named laptop and a named
  mid-range Android phone
- **C1:** gas against voter-list size, on a local node. **C2:** tree rebuild and proving
  time at the same sizes. **C3:** increase load until something fails
- **D1 to D5:** attack tests that must fail, including fuzz tests on nullifiers (D1) and an
  actual attempt to link ballots to voters from chain data (D3)
- **E1 to E3:** steps to vote, zero ETH needed, and a usability test with ten people who do
  not use cryptocurrency

---

## Report and demo

- Evaluation 2 report, following the template in `docs/evaluation_2_template.docx`
- Three timed demo rehearsals on Sepolia, on the actual presentation hardware and network
- Relayer wallet funded, with a funded backup, and a few funded wallets so voters can submit
  directly if the relayer fails
- A recorded video of the demo in case the network fails on the day

### Demo script

1. The authority creates an election, and the registrar registers the audience.
2. A batch of ballots is cast before any live one, so that no live ballot is the only one in
   its time window.
3. Two or three people vote from their own phones, paying no gas.
4. Open the block explorer and show that no on-chain field links ballots to the people who
   cast them.
5. Attempt a double vote and watch it fail.
6. Switch off the backend, and show the audit dashboard still recounting the correct tally
   from the chain.
7. Finalize, and show the permanent result.

---

## Risks

| Risk | Response |
|---|---|
| Browser proving is slow or fails on phones | Web Worker; go/no-go after M1; server-side proving as the fallback, with its privacy cost reported |
| Tier 3 not ready in time | Demonstrate tier 2, a complete system without anonymity, and report tier 3 as unfinished |
| Relayer down on the day | Voters submit directly from funded wallets |
| Relayer funds drained | It checks the proof and the nullifier before paying, so it pays for at most one ballot per registered voter |
| Relayer drops one candidate's ballots | Signed receipts and the booth's deadline warning make it visible; direct submission works around it |
| Not enough Sepolia ETH | Gas and load tests run on a local node; collect test ETH from faucets early |
