# System Architecture

## 1. Actors and stakeholders

| Actor | On-chain identity | Can do | Explicitly *cannot* do |
|---|---|---|---|
| **Election Authority** | `ELECTION_ADMIN_ROLE` | Create an election, set candidates + windows, publish metadata CID, trigger finalization | Cast or alter a ballot, change the voter root after registration closes, stop the count |
| **Registrar** | `REGISTRAR_ROLE` | Verify eligibility off-chain, collect identity commitments into an off-chain tree, publish its root and leaf set | See how anyone voted; add voters after the root is frozen |
| **Voter** | *none* (anonymous) | Register an identity commitment, cast exactly one ballot, verify their own ballot landed | Vote twice, vote without being in the committed set |
| **Candidate** | address (optional) | Be listed on a ballot, publish a manifesto to IPFS | Anything privileged |
| **Auditor / Observer** | *none* (permissionless) | Re-derive the full tally from chain events, verify every ZK proof, check the roll size | Alter anything |
| **Relayer** | trusted forwarder address | Pay gas on a voter's behalf | Forge, modify, or replay a ballot; the proof and nullifier are bound to the payload the voter signed |

The relayer is the one *liveness* trust assumption. A censoring relayer could refuse to
forward a ballot, and it necessarily sees the payload it is asked to forward, so it learns
*what* was voted. It does not learn *who* voted, because the voter's identity never appears
in the payload, and it cannot forge, alter, or replay a ballot. Voters who hold gas can
always bypass the relayer and submit directly to the contract. That escape hatch is what
stops a censoring relayer from blocking anyone.

## 2. Trust model

**What we guarantee**

- *Eligibility*: only committed identities can produce a valid proof.
- *One-voter-one-ballot*: enforced by nullifier uniqueness, not by address tracking.
- *Ballot secrecy*: the chain never learns which identity produced which ballot.
- *Individual verifiability*: a voter can locate their own ballot transaction.
- *Universal verifiability*: anyone can recompute the tally from public data.
- *Integrity of the count*: the tally is contract state, mutated only by `castVote`.

**What we do not guarantee (and will state plainly in the report)**

- *Coercion resistance*: a voter can be forced to reveal their identity secret and prove
  how they voted. Full coercion resistance needs MACI-style key rotation, which is out of
  scope; we document it as future work.
- *Sybil resistance at the registrar*: a dishonest registrar can enrol fake voters. We
  mitigate by publishing the roll size and root on-chain so ballot-stuffing is *detectable*
  even when it isn't preventable.
- *Privacy from the relayer*: the relayer reads the candidate choice in every ballot it
  forwards. It cannot attribute that choice to a voter, but it sees the running result
  before the public does. Submitting directly to the contract avoids this entirely.
- *Network-level anonymity*: a relayer or RPC provider sees IP addresses. Mitigated by
  the relayer stripping metadata; genuine fixes (Tor, mixnets) are out of scope.
- *Secrecy of the running tally*: votes are counted on-chain as they arrive, so a partial
  result is visible while voting is open and could influence late voters. Hiding it needs
  homomorphic or commit-reveal tallying, which is out of scope.

## 3. Component layout

```
┌────────────────────────────────────────────────────────────────────┐
│  FRONTEND  (Next.js, in the browser)                               │
│                                                                    │
│   Admin console    │  Ballot booth          │  Audit dashboard     │
│   create, manage,  │  ZK proof built in a   │  live tally, verify  │
│   open/close       │  Web Worker            │  from raw logs       │
└─────────┬──────────────────────┬─────────────────────────┬─────────┘
          │ signed meta-tx       │ register / read         │ read only
          ▼                      ▼                         │
┌────────────────────────────────────────────────┐         │
│  BACKEND  (Fastify)                            │         │
│   • Registrar        • Relayer                 │         │
│   • Indexer          • Merkle / group service  │         │
└────┬──────────────────┬──────────────────┬─────┘         │
     │ sponsored tx     │ materialise      │ pin           │
     │                  ▼                  ▼               │
     │           ┌─────────────┐   ┌──────────────┐        │
     │           │  Postgres   │   │ IPFS / Pinata│        │
     │           └─────────────┘   └──────────────┘        │
     │                                                     │
     ▼                     via RPC provider (Alchemy)      ▼
┌────────────────────────────────────────────────────────────────────┐
│  CONTRACTS  (Polygon Amoy)                                         │
│                                                                    │
│   ElectionFactory ──clones──▶ Election ──verifies──▶ Semaphore      │
│                                  │                   verifier      │
│                                  ├──▶ VoterRegistry  (roots)       │
│                                  └──▶ TallyLib       (counting)    │
│                                                                    │
│   VoteForwarder (ERC-2771)                                         │
└────────────────────────────────────────────────────────────────────┘
```
The audit dashboard deliberately talks to the RPC provider directly and never to our
backend. If our server is down, or lying, the result is still verifiable. This is the
single most important architectural property to demo in Eval 2: **kill the backend
mid-demo and show the tally still verifies.**

## 4. Smart contracts

| Contract | Responsibility | Notes |
|---|---|---|
| `ElectionFactory.sol` | Deploys and registers elections | EIP-1167 minimal proxy clones; deploying election #50 costs ~45k gas instead of ~2M |
| `Election.sol` | Lifecycle state machine, candidate roster, ballot acceptance, tally storage | The clone implementation; one instance per election |
| `VoterRegistry.sol` | Identity commitments, Merkle root per election, roll size | Root freezes when registration closes |
| `TallyLib.sol` | Counting rules: plurality first, approval voting if time allows | Library so counting strategy is swappable |
| `VoteForwarder.sol` | ERC-2771 trusted forwarder for gasless ballots | OpenZeppelin `ERC2771Forwarder` |

### Lifecycle

```
Created ──▶ Registration ──▶ Voting ──▶ Tallying ──▶ Finalized
   │             │              │
   └─────────────┴──────────────┴──▶ Cancelled   (authority only, pre-Voting)
```

Transitions are time-gated by block timestamp *and* require an explicit call, so the
authority can never rewind a phase. Once `Voting` opens, the voter root is immutable.

### The ballot path

1. Voter generates a Semaphore identity locally; the commitment is registered by the registrar.
2. At vote time, the browser builds a zk-SNARK proving: *"I know a secret whose commitment
   is a leaf in the tree with root R"*, without revealing which leaf.
3. The proof carries a **nullifier** = `hash(identitySecret, electionId)`. Deterministic per
   voter per election, but reveals nothing about the voter.
4. `castVote(proof, nullifier, signal)` verifies the proof, reverts if the nullifier was
   seen before, records it, and increments the candidate's tally.
5. Result: double voting is impossible, yet the chain never links a ballot to a person.

### Gas strategy

The design goal is **O(1) gas in the size of the voter roll**, and it depends on one
specific decision: **the membership tree is built off-chain and only its root is written
on-chain.**

This means deliberately *not* using Semaphore's on-chain group management, where each
`addMember` call inserts a leaf and costs gas per voter. That would make registration
O(n) and defeat the whole design. Instead the registrar maintains the tree in Postgres,
and `VoterRegistry` stores a single `bytes32` root per election. The verifier only ever
needs the root, so a roll of 10 and a roll of 100,000 cost the same one storage write.

The tradeoff is that the tree itself is not reconstructible from chain data alone, so the
registrar must publish the leaf set (via IPFS) for auditors to check the root. That
publication is what keeps the roll auditable despite living off-chain.

This is the headline result for the Eval 2 scalability chapter, and it is a claim we
verify empirically (parameter C1) rather than assert.

## 5. Backend

Not a source of truth; it is a convenience and liveness layer. Four services:

- **Registrar**: off-chain eligibility check (institute email OTP for the demo), builds the
  Semaphore group, publishes the root. Personal data stays in Postgres, never on-chain.
- **Relayer**: accepts a signed ballot + proof, pre-checks the nullifier, sponsors gas.
  Rate-limited and nullifier-deduplicated so it can't be drained.
- **Indexer**: tails `ElectionCreated` / `VoterRootPublished` / `VoteCast` / `Finalized`,
  materializes them into Postgres for sub-100ms dashboard reads. Rebuildable from genesis,
  which we will demonstrate.
- **Metadata**: pins ballot descriptions and manifestos to IPFS, stores the CID on-chain.

## 6. Frontend

Three surfaces, one codebase:

- **Admin console**: create election, manage roster, open/close phases, watch registration.
- **Ballot booth**: connect wallet, generate proof in a Web Worker (keeps the UI alive
  during the ~1–3 s proving time), cast, receive a verifiable receipt.
- **Audit dashboard**: live tally, per-ballot explorer links, a "verify this result
  yourself" panel that recomputes the count from raw logs in the browser.

## 7. Deployment targets

| Network | Role | Why |
|---|---|---|
| **Anvil** (local) | Development + throughput ceiling benchmarks | Instant, free, deterministic |
| **Polygon Amoy** | Primary deployment and live demo | Cheap and fast, and its lifecycle is independent of the Sepolia sunset on 30 Sep 2026 |
| **Ethereum Sepolia** | Secondary, benchmarks only | Gives us a genuine L1-vs-L2 cost/latency comparison for the performance chapter |

See [tech-stack.md](tech-stack.md) for the testnet reasoning in full.
