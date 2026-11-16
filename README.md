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
| "No one voted twice" | Each anonymous ballot carries a ZK **nullifier**; the contract rejects duplicates without learning who voted |
| "My ballot was counted" | Every ballot is an on-chain transaction the voter can point to |
| "The count is honest" | Tallies are incremented by contract code, not by an operator |
| "The log wasn't edited" | The log *is* the chain |

## What it does

- **Election authority** creates an election, sets the candidate roster, chooses plurality or
  approval counting, and defines the registration and voting windows. It cannot vote, cannot
  edit ballots, and cannot stop the count once voting opens.
- **Registrar** checks that a voter holds an institute email address (by an emailed code or by
  Google sign-in for the institute's domain) and publishes only the Merkle root of the voter
  list on-chain, with the list itself on IPFS; no personal data ever touches the chain.
- **Voter** in an anonymous election makes a voting key in the browser, registers only its
  public commitment, and later proves membership with a zero-knowledge proof. The ballot cannot
  be linked to them, and they need **no wallet and no ETH**: a relayer submits it and pays the
  gas. Elections can also use wallet ballots, which are cheaper but public.
- **Auditor / observer** recounts any election in the browser from the chain's own events and
  the published list, re-checking every anonymous ballot's proof, without asking our servers.
  The role is open to anyone.

## Stack and status

Solidity + Foundry · Semaphore v4 (zk-SNARK group membership) · Next.js + wagmi/viem ·
Fastify + Postgres (registrar, indexer) · BullMQ + Redis (relayer) · IPFS.

Both kinds of election work end to end in the browser, and the contracts are deployed on
Ethereum Sepolia and verified on Sourcify; their addresses are in
[`contracts/deployments/11155111.json`](contracts/deployments/11155111.json).

## Working on it

- [CONTRIBUTING.md](CONTRIBUTING.md): setup, commands and code style
- [docs/architecture.md](docs/architecture.md): how it works, and what it does not guarantee
- [docs/roadmap.md](docs/roadmap.md): what gets built, milestone by milestone
- [Issue #2](https://github.com/Chaitanya-Keyal/decentralized-voting-system/issues/2): the
  checklist of everything left, kept up to date
