# DVote: A Decentralized Voting System

DVote replaces the centralized election authority with a smart-contract-governed
election: eligibility is proven cryptographically, ballots are cast anonymously,
tallies are computed on-chain, and *anyone* can independently verify the result
without trusting the people who ran the election.

---

## The problem

Conventional e-voting asks you to trust a single operator with four things at once:
the voter roll, the ballot box, the counting, and the audit log. That operator can
silently add voters, drop ballots, miscount, or rewrite history, and a voter has no
way to detect it. Paper ballots trade this for a different problem: slow, expensive,
and unverifiable by the individual voter once the ballot enters the box.

DVote splits those four responsibilities apart so that no single party can compromise
an election on their own:

| Trust assumption in a centralized system | How DVote removes it |
|---|---|
| "The roll is correct" | Voter roll is committed as a Merkle root on-chain before voting opens; it cannot be changed afterwards |
| "No one voted twice" | Each ballot carries a ZK **nullifier**; the contract rejects duplicates without learning who voted |
| "My ballot was counted" | Every ballot is an on-chain transaction the voter can point to |
| "The count is honest" | Tallies are incremented by contract code, not by an operator |
| "The log wasn't edited" | The log *is* the chain |

## What it does

- **Election authority** creates an election, sets the candidate roster, and defines the
  registration and voting windows. It cannot vote, cannot edit ballots, and cannot stop
  the count once voting opens.
- **Registrar** verifies real-world eligibility off-chain and publishes only a
  cryptographic commitment to the voter set; no personal data ever touches the chain.
- **Voter** proves membership in that set with a zero-knowledge proof and casts a ballot
  that is unlinkable to their identity, paying **no gas** (a relayer sponsors it).
- **Auditor / observer** reads the live tally and re-derives the result from raw chain
  events, independently of our backend and our frontend. The role is open to anyone.

## Planned stack

Solidity + Foundry · Ethereum Sepolia testnet · Semaphore (zk-SNARK group membership) ·
Next.js + wagmi/viem · Fastify + Postgres indexer · IPFS for ballot metadata.

## Working on it

- [CONTRIBUTING.md](CONTRIBUTING.md): setup, commands and code style
- [docs/roadmap.md](docs/roadmap.md): what gets built, milestone by milestone
- [Issue #2](https://github.com/Chaitanya-Keyal/decentralized-voting-system/issues/2): the
  checklist of everything left, kept up to date
