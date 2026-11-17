# System Architecture

## 1. Actors and stakeholders

| Actor | On-chain identity | Can do | Explicitly *cannot* do |
|---|---|---|---|
| **Election Authority** | `AUTHORITY_ROLE` | Configure an election before registration opens (windows, metadata CID); change its candidates and cancel it until voting opens | Cast or alter a ballot, change the voter root after registration closes, delay or block the count |
| **Registrar** | `REGISTRAR_ROLE` | Verify eligibility off-chain (an institute email address, by emailed code or Google sign-in), collect identity commitments (wallet addresses in tier 2) into an off-chain tree, publish the root, the roll size and the leaf-set CID | Add voters after the root is frozen; learn which leaf is voting, because the booth derives its own authentication path |
| **Voter** | *none* (anonymous) | Register an identity commitment, check that commitment appears in the published leaf set, cast exactly one ballot, verify their own ballot landed | Vote twice, vote without being in the committed set |
| **Candidate** | address (optional) | Be listed on a ballot, publish a manifesto to IPFS | Anything privileged |
| **Auditor / Observer** | *none* (permissionless) | Re-derive the full tally from chain events, verify every ZK proof, recompute the root from the published leaf set, trigger any phase change once its time has passed | Alter anything |
| **Relayer** | its own funded address | Pay gas on a voter's behalf by submitting the ballot itself; it also reads the candidate choice in every ballot it receives and decides whether to submit it | Forge or modify a ballot, because the proof binds the nullifier and the candidate signal; replay one, because the nullifier is already spent |

Two rows in that table need their reasoning spelled out.

The Registrar's row stops at "learn which leaf is voting" and does not extend to "see how anyone
voted." The same operator runs the registrar and the relayer in this design, so one party could
hold both halves of the join. Section 2 therefore states ballot secrecy as conditional rather than
absolute, and says what the condition is.

The Authority's row denies it any power over the count. The design earns that by making every
phase change permissionless: once its scheduled time has passed, anyone can open registration,
open voting, close voting and finalize. The authority is confined to configuration and to
cancellation before voting opens, because those are administrative judgements with no
cryptographic substitute. An authority-only finalization would be a silent veto, since an
authority that dislikes the result could simply never call it and the time gate only prevents a
transition happening earlier than announced, never later. The same holds for opening
registration and voting: an authority that could delay them could stall an election it dislikes.

### Two liveness dependencies, not one

The relayer is not the only liveness trust assumption. A booth that had to ask the registrar for
the voter's Merkle authentication path at vote time would depend on the registrar as well, and a
registrar that is down, or that silently serves nothing to one named voter, would stop that voter
casting at all. Refusing a path is quieter than refusing a ballot, because it looks like a bug,
and direct submission is no help against it, since it bypasses the relayer and not the registrar.

The ballot path in section 4 keeps the registrar out of vote time for that reason. The leaf set
is published to IPFS with its content identifier written on-chain in the same transaction as the
root, and the booth rebuilds the tree and derives its own path. Each dependency has an escape:
IPFS reconstruction for the registrar, direct submission for the relayer.

### Selective censorship by the relayer

The relayer reads the candidate choice, and the relayer decides what to forward. Those are not
two mild costs; combined they are one result-altering attack. A relayer can drop only the
ballots for the candidate it dislikes, and this is invisible, because turnout below roll size
is the normal state of every election and an aggregate observer therefore sees nothing wrong.

The escape hatch does not rescue the population this design targets. Parameter E2 sets the
voter's required holding to zero and E3 tests people who have never used a wallet, so a voter
who can self-fund never needed the relayer and a voter who cannot is exactly the one a relayer
can censor.

The mitigation we adopt bounds the attack rather than removing it. The relayer returns a signed
receipt for every ballot it accepts, so a dropped ballot becomes a signed promise it did not
keep, and the booth watches the chain for the ballot's nullifier: if it is not counted within
five minutes the booth says so and offers submission from a wallet, which is always available
and is suggested outright when voting is about to close. Removing the attack rather than bounding it needs encrypted ballots or
several independent relayers, and we build neither.

Direct submission is a trade and not an upgrade. Nothing off-chain sees the payload, but a
funded address lands in the permanent public record along with the trail that funded it, and a
faucet claim or an exchange withdrawal can identify a voter better than a relayer that sees a
choice it cannot attribute.

## 2. Trust model

**What we guarantee**

- *Eligibility*: only committed identities can produce a valid proof. This rests on the
  Semaphore circuit's trusted setup, stated below.
- *One-voter-one-ballot*: enforced by nullifier uniqueness, not by address tracking.
- *Ballot secrecy against the chain*: no on-chain data links an address or an identity to a
  ballot. Secrecy against the operator is conditional and is listed under non-guarantees.
- *A ceiling on accepted ballots*: `castVote` requires that the count of spent nullifiers never
  exceeds the roll size stored beside the root in `VoterRegistry`. This is enforced by the
  contract, not inferred from circuit soundness. It does not make the declared roll size
  honest, which is a separate non-guarantee.
- *Individual verifiability*: a voter can locate their own ballot transaction.
- *Universal verifiability*: anyone can recompute the tally from public data.
- *Integrity of the count*: the tally is contract state, mutated only by `castVote`.

**The trusted setup**

Groth16 requires a circuit-specific trusted setup, and the eligibility guarantee above rests on
it. We use the Semaphore circuit's phase-two ceremony artifacts as published (version 4.13.0) rather
than running our own ceremony. Their SHA-256 hashes are pinned in
`packages/shared/src/semaphore-artifacts.json`, checked against the
`@zk-kit/semaphore-artifacts` npm package, whose tarball matched the registry's integrity hash,
and against the published copies; the browser refuses any proving file that does not match. If every
contributor to that ceremony colluded, forged membership proofs against a roll the forger was
never on would verify, with arbitrary nullifiers, and we would not detect them from the proofs
alone. That is part of why the on-chain ballot ceiling above matters: it converts a
cryptographic assumption into a bound the contract checks.

**What ballot secrecy means here**

Secrecy here is anonymity within the roll, not secrecy of ballot content. Every `VoteCast`
carries the candidate choice in the clear and increments a public counter, so what is hidden is
which member of the roll authored a given ballot. The hiding is worth exactly the number of
plausible authors at that moment, and the running tally and block timestamps erode that
continuously. For the first ballot cast and the last ballot cast in a small election the
anonymity set has one member and secrecy is zero. At demonstration scale the roll is a room, so
we state the size beside the claim rather than speaking in general terms.

**What we do not guarantee (and will state plainly in the report)**

- *Roll correctness*: we do not guarantee that the published roll corresponds to the people who
  actually registered. The registrar chooses the roll size, and registration is voluntary, so
  nobody independently knows the true figure and a roll padded with phantom commitments looks
  exactly like an honest one. Publishing the roll size does not make stuffing detectable, because
  the quantity any such check compares against is supplied by the party the check is meant to
  catch. What publication does buy is weaker: the capacity to stuff is fixed and published before
  any ballot exists, so a dishonest registrar must commit to a number before it knows which way the
  vote is going, and that number is public forever. A hosted system lets rows be added at the close
  of poll knowing the gap. That is a real difference, and it is not detection. Two attacks pass
  every check we have. Substitution, swapping one real voter's commitment for the registrar's own,
  leaves both the root recomputation and the roll size consistent. Exclusion, dropping fifty
  commitments, is quieter still and cheaper than fabricating two hundred. Two mitigations make both
  provable rather than preventing them, and neither costs gas: the registrar signs a receipt over
  the accepted commitment and the election id at registration time, so an excluded voter holds
  transferable evidence that contradicts the published leaf set; and the leaf set is published when
  registration closes while voting opens later, so there is a window in which every voter checks
  that their own commitment is in the list and, if it is not, can show the receipt before any
  ballot is cast. The genuine remedy, which this project does not build, is to stop trusting a single
  registrar: split the role across parties who each hold a share of the enrolment, or require
  candidate-appointed observers to co-sign the leaf set before the root is frozen. We record that
  as future work.
- *Sybil resistance at the registrar*: a dishonest registrar can enrol identities whose secrets
  it holds. Combined with the public running tally below, it can pre-load phantom leaves, watch
  the live count and spend them in the last hour for whichever candidate needs them. That is the
  reserve-of-unused-eligibility attack we use to condemn the hosted web application, and nothing
  we build catches it. See roll correctness above for what publication does and does not buy.
- *Ballot secrecy from the operator*: unconditional against the chain, conditional against us.
  The relayer reads the candidate choice in every ballot it submits and sees the network address
  it arrives from. If the registrar and the relayer shared one deployment and one database, one
  party would hold the institute email and the identity commitment from registration, and the
  source IP, arrival time and candidate choice from the ballot. Joining them would need no
  cryptography, only two log lines. So the relayer runs as its own process with its own store
  (Redis), has no access to the registrar's database and keeps no request logs; once a ballot is
  done only its outcome is kept. Secrecy from the operator holds as long as that separation does,
  or when the voter submits directly.
  We never state ballot secrecy as an unqualified guarantee. The same reasoning is why there is
  no server-side proving fallback: moving proof generation onto our server would not add one row
  to this table, it would collapse privacy back onto the operator.
- *Network-level anonymity*: a relayer or RPC provider sees IP addresses. Stripping metadata at
  the relayer is a promise by the party being distrusted rather than a property, so we do not
  count it as a mitigation. The genuine fixes (Tor, mixnets) are out of scope.
- *Coercion resistance*: handing over the identity secret does not merely prove a past vote, it
  transfers the vote. The holder computes the proof and the nullifier, casts the ballot, and the
  real voter can never override it, because the nullifier is deterministic and there is no key
  rotation and no override mechanism. Remote vote buying is therefore verifiable, irreversible
  and checkable by a stranger at scale, which a paper ballot is not, since a coerced voter in a
  booth can lie. On this axis DVote is worse than the hosted system it replaces, not merely
  incomplete, and we say so. MACI-style key rotation, where a voter invalidates an earlier ballot
  with a key the coercer does not hold, is the known remedy and needs a coordinator and far more
  circuit work than this schedule allows.
- *Credential transfer and organised vote farming*: the identity secret is a bearer credential
  with nothing binding it to a person. A campus operator can generate the secrets, register on
  the voters' behalf and cast the ballots itself, and gasless, four-step, zero-cryptocurrency
  voting makes that farm cheap. Anonymity then removes the forensic trail afterwards, where a
  centralized system at least leaves logs an investigator could pull. Anonymity has a real cost
  here and the report counts it as one; it is listed separately from coercion because it is a
  different attack.
- *Credential loss*: the identity secret lives in browser storage, and a cleared browser, a new
  device, private browsing or an evicted origin destroys it. The root is frozen on purpose, so
  after the close of registration there is no recovery and the voter is disenfranchised. We build
  the cheap mitigation: creating the key downloads a backup file, which restores it in any other
  browser, and the booth offers to restore one when the browser holds no key. The backup is a
  bearer credential, so it is also one more way to hand the vote to someone else. The stronger
  mitigation, deriving the identity deterministically from a wallet signature over a fixed
  message including the election id, is not built. Either way the boundary is that
  re-registration with the same identity works until the root freezes and never after.
- *Secrecy of the running tally*: votes are counted on-chain as they arrive, so a partial result
  is visible while voting is open and can influence late voters. Hiding it needs homomorphic or
  commit-reveal tallying, which is out of scope.

The honest summary of this section: DVote removes the operator from the ballot box and from the
count, and leaves one party in control of the franchise.

## 3. Component layout

```
┌────────────────────────────────────────────────────────────────────┐
│  FRONTEND  (Next.js, in the browser)                               │
│                                                                    │
│   Admin console    │  Registration and    │  Audit panel           │
│   create, manage,  │  ballot booth: proof │  recount from chain    │
│   open/close       │  in a Web Worker     │  events and IPFS       │
└─────────┬──────────────────────┬─────────────────────────┬─────────┘
          │ wallet tx            │ register / relay        │ read only
          ▼                      ▼                         │
┌────────────────────────────────────────────────┐         │
│  BACKEND  (Fastify; separate processes)        │         │
│   • API: registrar    • Relayer (own Redis)    │         │
│     and metadata      • Indexer (read cache)   │         │
└────┬──────────────────┬──────────────────┬─────┘         │
     │ ballots, roots   │ materialise      │ pin           │
     │                  ▼                  ▼               │
     │           ┌─────────────┐   ┌──────────────┐        │
     │           │  Postgres   │   │  IPFS (Kubo) │        │
     │           └─────────────┘   └──────────────┘        │
     │                                                     │
     ▼                     via an RPC provider             ▼
┌────────────────────────────────────────────────────────────────────┐
│  CONTRACTS  (Ethereum Sepolia)                                     │
│                                                                    │
│   ElectionFactory (tier 2) ──clones──▶ MerkleElection              │
│   ElectionFactory (tier 3) ──clones──▶ SemaphoreElection           │
│                                          └──verifies──▶ Semaphore  │
│                                                         verifier   │
│        both extend Election (lifecycle, VoterRegistry, TallyLib)   │
│                                                                    │
│   VoteForwarder (ERC-2771; accepted, not used by our relayer)      │
└────────────────────────────────────────────────────────────────────┘
```
The ballot booth talks to the backend to register and to hand a finished ballot to the relayer.
It does not read the tree from the backend at vote time: it fetches the published leaf set from
IPFS at the CID recorded on-chain and rebuilds the tree in the browser.

Registrar and relayer share the backend codebase but run as separate processes with separate
stores, the registrar's Postgres and the relayer's Redis, and the relayer keeps no request logs. Section 2 explains why: one operator holding
both sets of logs could link a voter's registration to their ballot.

The audit panel on each election page deliberately talks to the RPC provider and an IPFS gateway
and never to our API or indexer. It rebuilds the root from the published list, reads every ballot
from the contract's own `VoteCast` events, re-verifies every tier 3 proof in the browser (or, in
tier 2, checks every voting wallet is on the list), and recounts the tally and the winners. If our
server is down, or lying, the result is still verifiable; the list can come from any gateway that
has it, since it is checked against the root. With the leaf set on IPFS a voter can also still
build a proof without us. Casting it is the weaker half: with the relayer down,
submission costs the voter their own gas, which section 1 concedes most of them will not have. This
is the single most important architectural property to demo in Eval 2: **kill the backend mid-demo
and show the tally still verifies.**

## 4. Smart contracts

| Contract | Responsibility | Notes |
|---|---|---|
| `ElectionFactory.sol` | Deploys and registers elections | EIP-1167 minimal proxy clones, one factory per tier, each cloning its own implementation. In the tier 2 gas snapshot, creating a later election, clone and set-up with three candidates, costs 622,262 gas; deploying a full copy of the election contract costs 2,084,623 |
| `Election.sol` | Lifecycle state machine, candidate roster, ballot acceptance, tally storage | Abstract base of both tiers; one clone per election. The counting rule is fixed when the election is created. Accepting a ballot reverts once spent ballot keys reach the roll size |
| `MerkleElection.sol` | Tier 2 `castVote(choice, proof)` | Checks a keccak Merkle proof that the sender's address is on the list; the ballot key is the address |
| `SemaphoreElection.sol` | Tier 3 `castVote(choice, nullifier, points)` | Calls Semaphore's verifier with the stored root, the election's own address as the scope and the tree depth the contract computes, in constant time, from the stored roll size; never with values from the caller. The ballot key is the nullifier |
| `VoterRegistry.sol` | Merkle root, roll size and leaf-set CID per election | A base of `Election`. No commitment is stored on-chain. All three values are written in one transaction and never change afterwards |
| `SemaphoreVerifier` | Groth16 verification of the membership proof | Semaphore's standalone verifier, called with our own root, not Semaphore's group contracts. The tree depth selects the verification key, which is why the depth is pinned in the contract |
| `TallyLib.sol` | Counting rules: plurality and approval | Under approval a choice is a non-empty bitmask of candidates, each of which gets a vote; ties give several winners |
| `VoteForwarder.sol` | ERC-2771 trusted forwarder | OpenZeppelin `ERC2771Forwarder`. Tier 3 elections accept ballots through it, but our relayer does not use it: see below |

The forwarder deserves a note, because the obvious reading credits it with a protection it does
not provide. It is the proof, not the EIP-712 signature, that stops a relayer altering a ballot:
the proof commits to the nullifier and the candidate signal, so any tampering invalidates it,
and the nullifier blocks replay. `castVote` never reads the sender at all, so ERC-2771 is not a
security boundary here and a relayer can simply submit the ballot itself, with the same result.
The plan was to use it anyway, for a request deadline and the audited implementation, but
measurement settled it the other way. Under mainnet's current rules a ballot through the
forwarder costs 335,214 gas against 296,692 submitted directly. On Sepolia, which runs
Glamsterdam, the gap was about 127,000 gas per ballot (521,094 against 393,900), most of it the
forwarder's nonce slot for the fresh signing key each ballot used, which EIP-8037 prices as new
state. So the relayer submits `castVote` itself and the booth signs nothing; the forwarder stays
deployed and accepted for any ERC-2771 relayer that wants it.

### Lifecycle

```
Created ──▶ Registration ──▶ Voting ──▶ Tallying ──▶ Finalized
   │             │
   └─────────────┴──▶ Cancelled   (authority only, before voting opens)
```

Transitions are time-gated by block timestamp *and* require an explicit call, so the
authority can never rewind a phase. Caller permissions are part of the design and are stated
here rather than left to be inferred:

- Configuration belongs to the authority, and only until registration is due to open. The
  candidates can change until voting is due to open, so a ballot's meaning never changes after it
  is cast. Both limits go by the clock as well as the phase, because registration is open from its
  start time even if nobody has recorded that on-chain yet.
- Cancellation belongs to the authority until voting is due to open. Once the leaf set is
  published and the voting window has begun, the authority can no longer stop the vote; an
  election whose leaf set never appeared, or whose voting window passed without voting opening,
  can still be cancelled.
- The transition into `Voting` additionally requires a non-empty leaf-set CID alongside the
  root, so a registrar that withholds the roll stops the election rather than going unnoticed,
  and it must happen before the voting window ends.
- Every other transition, from opening registration to finalizing, is permissionless once its
  timestamp has passed: any observer may call it. The time gate prevents a transition happening
  earlier than announced, so if these were authority-only the authority could delay them
  indefinitely, which is exactly the silent veto we claim not to have.

Once `Voting` opens, the voter root is immutable.

### The ballot path

This is the tier 3 path. Tier 2, built first, follows the same steps without the anonymity: the
voter registers their wallet address instead of an identity commitment, the leaf set is the list
of registered addresses, and the ballot is `castVote(choice, proof)` sent from that wallet with
an ordinary Merkle proof, so the chain shows which wallet voted for whom.

1. The voter's browser generates a Semaphore identity, keeps it, and downloads a backup of it.
   Only the commitment is sent to the registrar, which returns a receipt signed over the
   commitment and the election.
2. At the close of registration the registrar publishes the full leaf set to IPFS, and the root,
   the roll size and the content identifier are written on-chain in one transaction. Publication
   serves two purposes: auditors recompute the root, and voters build proofs without talking to
   the registrar.
3. Before voting opens, the booth checks that the voter's own commitment appears in the published
   leaf set and warns them if it does not. Root recomputation alone proves only that the leaves
   match the root; this is the check that makes leaf substitution detectable by the person it
   targets.
4. At vote time the booth downloads the leaf set at the on-chain CID, reconstructs the tree in
   the browser and derives its own authentication path. The backend is never told which leaf is
   voting. Fetching the path from the registrar instead would be a break rather than a detail:
   the path identifies the leaf, the registrar knows which leaf belongs to which person, and the
   relayer sees the candidate choice, so an operator correlating the two requests could
   deanonymize every voter.
5. The browser builds a zk-SNARK proving: *"I know a secret whose commitment is a leaf in the
   tree with root R"*, without revealing which leaf.
6. The proof carries a **nullifier** = `hash(identitySecret, scope)`, where the scope is the
   election's address. Deterministic per voter per election, but reveals nothing about the voter,
   and a proof for one election is useless in any other.
7. The relayer, or any wallet, sends `castVote(choice, nullifier, points)`. It verifies the proof
   against the frozen root, reverts if the nullifier was seen before, reverts if the count of
   spent nullifiers has already reached the stored roll size, records the nullifier, and adds the
   ballot to the tally.
8. Result: double voting is impossible, accepted ballots cannot outnumber the declared roll, and
   no on-chain field links a ballot to a person, within the anonymity-set bound section 2 puts on
   what that hides.

### Gas strategy

The design goal is **O(1) gas per operation in the size of the voter roll**. Per operation, not per
election, and on the ballot side in tier 3 rather than in both tiers. A tier 3 ballot costs the
same whether the roll is ten or a hundred thousand, publishing the roll costs the same either way
in both tiers, and tier 2's ballot is the logarithmic exception treated below. The total cost of an
election is linear in the ballots cast, and no on-chain voting system avoids that, including this
one. A hundred thousand ballots at roughly 300k gas each is a hundred thousand transactions and the
bill scales with turnout, not with the roll.

The per-operation property depends on one decision: **the membership tree is built off-chain and
only its root is written on-chain.**

This means deliberately *not* using Semaphore's on-chain group management, where each
`addMember` call inserts a leaf and costs gas per voter. That is the baseline worth naming,
because it is the one this design actually beats: registration goes from a transaction per voter
to a single write. The registrar maintains the tree, and `VoterRegistry` stores one `bytes32`
root, one roll size and one CID per election, so a roll of 10 and a roll of 100,000 cost the
same.

That flatness is true by construction, and the report presents it as such rather than as a
finding. One `SSTORE` of a root is one `SSTORE` at any roll size, and tier 2 already has flat
registration gas without any zero knowledge, because tier 2 also publishes a root and nothing
else. Parameter C1 on the registration side is therefore a regression guard, catching an
implementation that accidentally introduced an O(n) term such as emitting the leaf array in an
event or storing commitments on-chain, rather than a hypothesis that could come out otherwise.

Where the anonymity layer does change the shape is the ballot. In tier 2 the authentication path
travels in calldata, so ballot gas is logarithmic in the roll. The sweep in
`bench/results/gas.csv` measured 73,462 gas at a roll of 2 and 84,703 at 65,536, about 750 gas per
tree level. In tier 3 the path becomes a private witness inside a Groth16 proof whose size is
fixed at every tree depth, so the line should be flat. The first sweep was not quite: it rose by
about 210 gas per level, which turned out to be the contract computing the tree depth in a loop
that re-read the roll size from storage. The depth is now computed in constant time. The line is
also higher, about 297,000 gas per ballot because of the pairing check, so the tier 3 line sits
above the tier 2 line at every roll size measured, and the curves never cross in any realistic
range. That is the price of anonymity, not a cost win.

These figures are under mainnet's current rules, which Foundry's local EVM implements. Sepolia
runs Glamsterdam, whose EIP-8037 prices new state at 1,530 gas per byte, so writing a storage
slot for the first time costs 97,920 gas instead of 20,000 and deploying code costs about 1,530
gas per byte instead of 200. Every ballot writes at least one new slot (its nullifier or address),
so a typical tier 3 ballot cost about 395,000 gas there. The shape in the roll size is unchanged.

The two tiers do not share a tree, and the move from one to the other is a replacement rather
than an upgrade. Tier 2 is keccak256 over sorted pairs with OpenZeppelin `MerkleProof`; tier 3
is Poseidon in a LeanIMT, because that is what the Semaphore circuit constrains, and a keccak
root is not even a valid circuit input since it is not constrained below the field modulus. The
tree builder, the verification path and the registry's notion of a root are replaced rather than
extended. The tier 2 work still earns its place, because it gives us the lifecycle, the factory,
the indexer and a gas baseline, but the cryptographic code does not carry over.

The real tradeoff is not auditor inconvenience, it is relocation: the O(n) work moved off-chain
to the registrar and the auditor. A roll of 100,000 is roughly 3.2 MB of commitments and about
200,000 Poseidon hashes, and every auditor pays that independently, so verification is O(n) per
auditor rather than O(n) once. Moving it is still worth doing, because a Poseidon hash off-chain
costs microseconds where a storage slot on-chain costs 22,100 gas, and the auditor's share is a
download rather than a fee paid to a network. But measuring only the on-chain side would be
measuring the cheap side, so the scalability parameters report registrar tree-build time,
published leaf-set size and auditor root-recomputation time across the same roll sizes as C1,
printed beside the flat line. A flat on-chain curve next to an unreported hundred-megabyte audit
artifact would be a misleading graph, and if checking the roll at 100,000 voters turns out to be
impractical in a browser then universal verifiability degrades even though the gas line stayed
flat.

One check turns an observation into an invariant the contract enforces. `castVote` compares the
count of spent nullifiers against the roll size stored beside the root, and reverts when it would
exceed it. Under EIP-2929 it costs a cold read of the roll size, 2,100 gas, plus the counter it is
compared with: a cold read of 2,100 and an update of 2,900, or 20,000 for the first ballot, which
moves the counter off zero. In the tier 2 snapshot the first ballot costs 114,397 gas and later
ones 80,221, almost all of the difference being that write and the candidate's count leaving zero
(A1). Without it, the statement that accepted ballots can never
outnumber the declared enrolment would rest on circuit soundness with no line of code behind it:
the root and the roll size are two independent values written by the same registrar, and a Merkle
root does not commit to a leaf count. With it, silent tree stuffing becomes a visible revert. It
still does not make the declared number honest, which is the roll correctness non-guarantee.

## 5. Backend

Not a source of truth; it is a convenience and liveness layer. Four services:

- **Registrar**: off-chain eligibility check: the voter proves an institute email address with
  a one-time code emailed to it, or with Google sign-in, where the registrar checks the ID token's
  signature against Google's published keys, its issuer, audience and expiry, and requires its
  `hd` (hosted domain) claim to be the institute's domain. It builds the Semaphore group (in tier
  2, the list of registered wallet addresses), returns a signed receipt over each accepted
  commitment and the election, binds an email address to one commitment or wallet for good,
  and at the close of registration publishes the root, the roll size and the leaf-set CID in one
  transaction, by itself. Personal data stays in Postgres, never on-chain. It is not involved at
  vote time. Since anyone can create an election naming it, it serves only elections where it
  holds the registrar role and, when configured, whose authority it recognises.
- **Relayer**: its own process, with a BullMQ queue on Redis. It accepts a ballot (the choice,
  the nullifier and the proof, nothing else), **verifies the Groth16 proof off-chain before it
  spends anything**, checks that the election is one of ours and open and that the nullifier is
  unused and not already queued, simulates the exact call, and only then returns a signed receipt
  and queues the ballot. It submits `castVote` itself, sending ballots one at a time with
  consecutive nonces but without waiting for each to be mined (up to `RELAYER_CONCURRENCY`, 64 by
  default, in flight), so a burst of voters shares blocks; it retries a failed submission and
  releases the nullifier for resubmission elsewhere if it gives up. In the C3 load test, 256
  simultaneous ballots were all counted within six 12-second blocks, and the relayer accepted
  about nine ballots a second on one core. Off-chain verification with snarkjs needs no chain
  access, and checks the root, the scope and the signal at once. Without it, ten thousand ballots
  carrying fresh random nullifiers and garbage proofs all pass a nullifier check, get sponsored,
  fail the pairing check on-chain and revert, and the relayer pays for roughly 250k gas each; a
  daily cap does not prevent that, it only sets the price of shutting down the gasless path on
  the morning of the demonstration. With it, the relayer's worst-case lifetime exposure is
  bounded by the roll size, because a valid proof requires an enrolled identity and each identity
  yields exactly one usable nullifier per election. Rate limiting per source and per nullifier
  sits on top of that bound rather than substituting for it.
- **Indexer**: tails both factories' `ElectionCreated` and each election's events
  (configuration, candidates, phases, `VoterRootPublished`, `VoteCast`, `Finalized`) and
  materializes them into Postgres so pages load quickly. It stays a few blocks behind the head on
  a public chain, notices a replaced block by its hash and rebuilds from the deployment block;
  the tests exercise that rebuild.
- **Metadata**: pins ballot descriptions, manifestos and the published leaf set to IPFS, and
  stores the CIDs on-chain.

## 6. Frontend

Three surfaces, one codebase:

- **Admin console**: create election, manage roster, open/close phases, watch registration.
  This surface needs a wallet.
- **Registration and ballot booth**: in an anonymous election no wallet is required, to register
  or to vote; eligibility comes entirely from the proof, so a wallet is needed only for the admin
  console, wallet elections and the direct-submission escape hatch. Registration makes the
  voter's key in the browser and downloads its backup. The booth fetches the leaf set from IPFS,
  rebuilds the tree, checks the voter's own commitment is present, derives the authentication
  path, downloads the proving files and checks their pinned hashes, generates the proof in a Web
  Worker so the UI stays alive, hands the ballot to the relayer, and shows the nullifier, the
  transaction and the relayer's receipt.
- **Audit panel**: on every election page; recounts the result from the chain's events and the
  published list, as described in section 3.
- **Device benchmark** (`/bench`): times the tree rebuild and proving on whatever device opens
  it, for parameters B2 and C2, and offers the results as CSV.

Proving time and tree rebuild time are measured in `bench/results/timings-*.csv`. On the
measurement machine named there, in Node.js on one thread, proving took about 0.6 s at a roll of
2 and 1.5 s at 65,536, growing only with the tree's depth, while rebuilding the tree grew with the
roll: about 2 s at 8,192 voters and 16 s at 65,536. C2 is therefore where the design struggles:
past a few thousand voters, rebuilding the list costs the booth more than proving does. Phones
will be slower on both, and B2 measures them with `/bench`. The failure mode to watch is not
slowness but exhausting the mobile WASM memory ceiling while running several megabytes of
circuit files.

## 7. Deployment targets

| Network | Role | Why |
|---|---|---|
| **Ethereum Sepolia** | Deployment and live demo | The Ethereum Foundation's recommended testnet for application and contract development; deepest faucet and tooling support, and execution matching Ethereum mainnet |
| **Local Foundry node (Anvil)** | Development, gas parameters, throughput, reorg test | Gas is deterministic, so a local sweep over roll sizes is exact, instant and free; throughput runs without network noise, and the reorg test needs a manipulable chain |

Gas parameters (A1, C1) are measured locally, because gas is deterministic given the same
bytecode and calldata and a sweep over roll sizes from ten to a hundred thousand would
otherwise drain testnet faucets. Only end-to-end latency and the live demonstration need
Sepolia itself. One qualification: since 6 October 2026 Sepolia runs Glamsterdam, whose EIP-8037
charges far more for new state than mainnet's current rules, which is what Foundry's local EVM
implements. A1 is therefore reported twice, under mainnet's rules from the local snapshot and
under Glamsterdam's from transactions on Sepolia, and the Sepolia deploy takes its gas limits from
the node rather than from a local simulation. Cost is graded as gas (A1) only. A fiat cost per vote is not a parameter,
because converting gas to money needs a gas price and an exchange rate the project does not
control; where the report quotes a rupee figure it is a stated illustration, not a target.

See [tech-stack.md](tech-stack.md) for the testbed reasoning in full.
