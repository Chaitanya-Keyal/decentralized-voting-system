# System Architecture

## 1. Actors and stakeholders

| Actor | On-chain identity | Can do | Explicitly *cannot* do |
|---|---|---|---|
| **Election Authority** | `ELECTION_ADMIN_ROLE` | Configure an election before registration opens (candidates, windows, metadata CID); cancel it before voting opens | Cast or alter a ballot, change the voter root after registration closes, delay or block the count |
| **Registrar** | `REGISTRAR_ROLE` | Verify eligibility off-chain, collect identity commitments into an off-chain tree, publish the root, the roll size and the leaf-set CID | Add voters after the root is frozen; learn which leaf is voting, because the booth derives its own authentication path |
| **Voter** | *none* (anonymous) | Register an identity commitment, check that commitment appears in the published leaf set, cast exactly one ballot, verify their own ballot landed | Vote twice, vote without being in the committed set |
| **Candidate** | address (optional) | Be listed on a ballot, publish a manifesto to IPFS | Anything privileged |
| **Auditor / Observer** | *none* (permissionless) | Re-derive the full tally from chain events, verify every ZK proof, recompute the root from the published leaf set, close voting and finalize once the windows have passed | Alter anything |
| **Relayer** | trusted forwarder address | Pay gas on a voter's behalf; it also reads the candidate choice in every ballot it forwards and decides whether to forward it | Forge or modify a ballot, because the proof binds the nullifier and the candidate signal; replay one, because the nullifier is already spent |

Two rows in that table need their reasoning spelled out.

The Registrar's row stops at "learn which leaf is voting" and does not extend to "see how anyone
voted." Registrar and relayer are one deployment in this design, so one party holds both halves
of the join. Section 2 therefore states ballot secrecy as conditional rather than absolute, and
says what the condition is.

The Authority's row denies it any power over the count. The design earns that by making the
closing transitions permissionless: once their timestamps have passed, any observer can close
voting, enter tallying and finalize. The authority is confined to configuration, to opening the
phases, and to cancellation before voting opens, because those are administrative judgements
with no cryptographic substitute. An authority-only finalization would
be a silent veto, since an authority that dislikes the result could simply never call it and the
time gate only prevents a transition happening earlier than announced, never later.

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
keep, and the booth warns the voter and offers direct submission if no transaction hash appears
before a deadline. Removing the attack rather than bounding it needs encrypted ballots or
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
it. We use the Semaphore circuit's phase-two ceremony artifacts as published, and verify their
hashes against the Semaphore repository, rather than running our own ceremony. If every
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
  that their own commitment is in the list, with re-registration still available until the root
  freezes. The genuine remedy, which this project does not build, is to stop trusting a single
  registrar: split the role across parties who each hold a share of the enrolment, or require
  candidate-appointed observers to co-sign the leaf set before the root is frozen. We record that
  as future work.
- *Sybil resistance at the registrar*: a dishonest registrar can enrol identities whose secrets
  it holds. Combined with the public running tally below, it can pre-load phantom leaves, watch
  the live count and spend them in the last hour for whichever candidate needs them. That is the
  reserve-of-unused-eligibility attack we use to condemn the hosted web application, and nothing
  we build catches it. See roll correctness above for what publication does and does not buy.
- *Ballot secrecy from the operator*: unconditional against the chain, conditional against us.
  The relayer reads the candidate choice in every ballot it forwards and sees the network address
  it arrives from. As designed, the registrar and the relayer are two services inside one Fastify
  deployment over one PostgreSQL instance, so one party holds the institute email and the
  identity commitment from registration, and the source IP, arrival time and candidate choice
  from the ballot. Joining them needs no cryptography, only two log lines. Secrecy from the
  operator therefore holds when the relayer is run separately from the registrar, as distinct
  deployments with separate databases and no request logs, or when the voter submits directly.
  We never state ballot secrecy as an unqualified guarantee. The same reasoning applies to the
  server-side proving fallback: moving proof generation onto our server would not add one row to
  this table, it would collapse privacy back onto the operator, so it addresses a browser
  runtime risk and is not a privacy-preserving option.
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
  after the close of registration there is no recovery and the voter is disenfranchised. The
  cheap mitigation is an exportable credential shown once at registration, exactly as a wallet
  does; the stronger one is deriving the identity deterministically from a wallet signature over
  a fixed message including the election id, which removes storage from the path at the cost of
  assuming the voter still has their wallet. Either way the boundary is that re-registration
  works until the root freezes and never after.
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
│   Admin console    │  Ballot booth          │  Audit dashboard     │
│   create, manage,  │  ZK proof built in a   │  live tally, verify  │
│   open/close       │  Web Worker            │  from raw logs       │
└─────────┬──────────────────────┬─────────────────────────┬─────────┘
          │ signed meta-tx       │ register / relay        │ read only
          ▼                      ▼                         │
┌────────────────────────────────────────────────┐         │
│  BACKEND  (Fastify)                            │         │
│   • Registrar        • Relayer                 │         │
│   • Indexer          • Metadata / IPFS pinning │         │
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
│   ElectionFactory ──clones──▶ Election ──verifies──▶ Semaphore     │
│                                  │                   verifier      │
│                                  ├──▶ VoterRegistry  (roots)       │
│                                  └──▶ TallyLib       (counting)    │
│                                                                    │
│   VoteForwarder (ERC-2771)                                         │
└────────────────────────────────────────────────────────────────────┘
```
The ballot booth talks to the backend to register and to hand a finished ballot to the relayer.
It does not read the tree from the backend at vote time: it fetches the published leaf set from
IPFS at the CID recorded on-chain and rebuilds the tree in the browser.

Registrar and relayer are drawn inside one backend box because that is where this design puts
them. Section 2 states what that co-location costs, and separating them is the condition under
which secrecy from the operator holds.

The audit dashboard deliberately talks to the RPC provider directly and never to our backend. If
our server is down, or lying, the result is still verifiable, and with the leaf set on IPFS a voter
can still build a proof without us. Casting it is the weaker half: with the relayer down,
submission costs the voter their own gas, which section 1 concedes most of them will not have. This
is the single most important architectural property to demo in Eval 2: **kill the backend mid-demo
and show the tally still verifies.**

## 4. Smart contracts

| Contract | Responsibility | Notes |
|---|---|---|
| `ElectionFactory.sol` | Deploys and registers elections | EIP-1167 minimal proxy clones; deploying election #50 should cost roughly 45k gas rather than roughly 2M |
| `Election.sol` | Lifecycle state machine, candidate roster, ballot acceptance, tally storage | The clone implementation; one instance per election. `castVote` reverts once spent nullifiers reach the roll size |
| `VoterRegistry.sol` | Merkle root, roll size and leaf-set CID per election | No commitment is stored on-chain. All three values are written in one transaction and freeze when registration closes |
| `SemaphoreVerifier` | Groth16 verification of the membership proof | The standalone verifier called with our own root, not Semaphore's group contracts. The tree depth selects the verification key, so the depth is pinned in the contract and never taken from the caller |
| `TallyLib.sol` | Counting rules: plurality first, approval voting if time allows | Library so counting strategy is swappable |
| `VoteForwarder.sol` | ERC-2771 trusted forwarder for gasless ballots | OpenZeppelin `ERC2771Forwarder`. A convenience, not a security control: see below |

The forwarder deserves a note, because the obvious reading credits it with a protection it does
not provide. It is the proof, not the EIP-712 signature, that stops a relayer altering a ballot:
the proof commits to the nullifier and the candidate signal, so any tampering invalidates it,
and the nullifier blocks replay. `Election` never checks the appended sender against the roll,
so ERC-2771 is not a security boundary here and a relayer could simply broadcast the transaction
with the same result. We keep it for three honest reasons: sponsored and direct submission share
one code path, the request deadline bounds how long a relayer may sit on a ballot before
submitting it, and the OpenZeppelin implementation is audited where a bespoke queue protocol
would not be. It is not free. The request struct, the 65-byte signature in calldata and a nonce
slot per signer cost roughly 30,000 gas per ballot, and with the ephemeral per-ballot key the
design uses that nonce is a fresh zero-to-non-zero write every time. If parameter A1 comes in
over budget, removing the forwarder is the first saving to take, because the payload
authenticates itself.

### Lifecycle

```
Created ──▶ Registration ──▶ Voting ──▶ Tallying ──▶ Finalized
   │             │              │
   └─────────────┴──────────────┴──▶ Cancelled   (authority only, pre-Voting)
```

Transitions are time-gated by block timestamp *and* require an explicit call, so the
authority can never rewind a phase. Caller permissions are part of the design and are stated
here rather than left to be inferred:

- Configuration and the transition out of `Created` belong to the authority.
- Cancellation belongs to the authority and is available only before voting opens.
- The transition into `Voting` additionally requires a non-empty leaf-set CID alongside the
  root, so a registrar that withholds the roll stops the election rather than going unnoticed.
- Closing voting, entering `Tallying` and finalizing are permissionless once their timestamps
  have passed: any observer may call them. The time gate prevents a transition happening earlier
  than announced, so if these were authority-only the authority could delay them indefinitely,
  which is exactly the silent veto we claim not to have.

Once `Voting` opens, the voter root is immutable.

### The ballot path

1. The voter generates a Semaphore identity locally and the commitment is sent to the registrar,
   which returns a receipt signed over the commitment and the election id.
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
   relayer in the same backend sees the candidate choice, so correlating the two requests would
   deanonymize every voter.
5. The browser builds a zk-SNARK proving: *"I know a secret whose commitment is a leaf in the
   tree with root R"*, without revealing which leaf.
6. The proof carries a **nullifier** = `hash(identitySecret, electionId)`. Deterministic per
   voter per election, but reveals nothing about the voter.
7. `castVote(proof, nullifier, signal)` verifies the proof against the frozen root, reverts if
   the nullifier was seen before, reverts if the count of spent nullifiers has already reached
   the stored roll size, records the nullifier, and increments the candidate's tally.
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
travels in calldata, so ballot gas is logarithmic in the roll: at 32 bytes per sibling and 16
gas per non-zero calldata byte, each level costs roughly 500 to 600 gas including the hash, so
moving from a roll of 10 (depth 4) to 100,000 (depth 17) adds about 7,000 to 8,000 gas per
ballot. In tier 3 the path becomes a private witness inside a Groth16 proof whose size is fixed
at every tree depth, so the line is flat. It is also higher, three to four hundred thousand gas
because of the pairing check, and we expect the tier 3 line to sit above the tier 2 line across
every roll size we can measure, with the curves never crossing in any realistic range. That is
the price of anonymity, not a cost win, and stating the expectation before the measurement keeps
the graph from being read as a claim we did not make.

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
exceed it. It costs one comparison against a value already in storage plus a warm counter write
of about 2,900 gas, declared in A1. Without it, the statement that accepted ballots can never
outnumber the declared enrolment would rest on circuit soundness with no line of code behind it:
the root and the roll size are two independent values written by the same registrar, and a Merkle
root does not commit to a leaf count. With it, silent tree stuffing becomes a visible revert. It
still does not make the declared number honest, which is the roll correctness non-guarantee.

## 5. Backend

Not a source of truth; it is a convenience and liveness layer. Four services:

- **Registrar**: off-chain eligibility check (institute email OTP for the demo), builds the
  Semaphore group, returns a signed receipt over each accepted commitment and the election id,
  and at the close of registration publishes the root, the roll size and the leaf-set CID in one
  transaction. Personal data stays in Postgres, never on-chain. It is not involved at vote time.
- **Relayer**: accepts a signed ballot and proof, **verifies the Groth16 proof off-chain before
  it spends anything**, pre-checks the nullifier, sponsors gas, and returns a signed receipt for
  every ballot it accepts. Off-chain verification with snarkjs takes milliseconds, needs no chain
  access, and checks the root, the scope and the signal at once. Without it, ten thousand ballots
  carrying fresh random nullifiers and garbage proofs all pass a nullifier check, get sponsored,
  fail the pairing check on-chain and revert, and the relayer pays for roughly 250k gas each; a
  daily cap does not prevent that, it only sets the price of shutting down the gasless path on
  the morning of the demonstration. With it, the relayer's worst-case lifetime exposure is
  bounded by the roll size, because a valid proof requires an enrolled identity and each identity
  yields exactly one usable nullifier per election. Rate limiting per source and per nullifier
  sits on top of that bound rather than substituting for it.
- **Indexer**: tails `ElectionCreated` / `VoterRootPublished` / `VoteCast` / `Finalized`,
  materializes them into Postgres, targeting sub-100ms dashboard reads. Rebuildable from genesis,
  which we will demonstrate.
- **Metadata**: pins ballot descriptions, manifestos and the published leaf set to IPFS, and
  stores the CIDs on-chain.

## 6. Frontend

Three surfaces, one codebase:

- **Admin console**: create election, manage roster, open/close phases, watch registration.
  This surface needs a wallet.
- **Ballot booth**: no wallet is required to vote. The booth creates an ephemeral key in the
  browser, signs the forwarding request with it, and eligibility comes entirely from the proof,
  so a wallet is needed only for the admin console, the registrar, and the direct-submission
  escape hatch. Reusing one signing key instead of a fresh one per ballot would save about 17,100
  gas, but would link a voter's ballots across elections, so the ephemeral key is a privacy
  purchase and we report it as one. The booth fetches the leaf set from IPFS, rebuilds the tree,
  checks the voter's own commitment is present, derives the authentication path, generates the
  proof in a Web Worker so the UI stays alive, casts, and shows a verifiable receipt.
- **Audit dashboard**: live tally, per-ballot explorer links, a "verify this result
  yourself" panel that recomputes the count from raw logs in the browser.

Proving time is an expectation, not a measurement. We take one to three seconds from published
Semaphore benchmarks on desktop hardware; nothing has been built and nothing has been timed.
Parameter B2 exists to replace that expectation with a measurement on the phones we can borrow,
and the failure mode that would actually trigger the fallback is not slowness but exhausting the
mobile WASM memory ceiling while downloading and running several megabytes of circuit artifacts.
That belongs in the risk table alongside slow proving.

## 7. Deployment targets

| Network | Role | Why |
|---|---|---|
| **Anvil** (local) | Development + throughput ceiling benchmarks | Instant, free, deterministic |
| **Polygon Amoy** | Primary deployment and live demo | Cheap and fast, and its lifecycle is independent of the Sepolia sunset on 30 Sep 2026. Polygon PoS is a checkpointed sidechain rather than a rollup, and we name it that way |
| **Ethereum Sepolia** | Not used | Sepolia reaches end of life on 30 Sep 2026 and our first deployable contract lands with M1 in October, so there is no day on which both a working contract and a live Sepolia exist |

Dropping Sepolia costs less than it appears, because the comparison it was meant to support was
not an experiment. Gas is a function of the EVM and the bytecode, so an identical suite consumes
identical gas on Sepolia and on Amoy; the entire difference is a fee market, and both tokens are
worthless testnet tokens, so any rupee figure has to be imported from mainnet price feeds
anyway. A2 is therefore cost per ballot computed from the single A1 gas figure, priced under
Ethereum mainnet, Polygon PoS mainnet and Amoy conditions, and reported with a sensitivity band
over gas price rather than as a single number. If a live layer-1 figure is still wanted in
November, we name a successor testnet rather than one with a published shutdown date.

See [tech-stack.md](tech-stack.md) for the testnet reasoning in full.
