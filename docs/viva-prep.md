# Viva Preparation: DVote

This is the study guide for the Evaluation 1 viva (25/26 September 2026). The examiners
have the report; they will not ask us to read it back to them. They will ask what the
mechanisms actually are, where the cost went, and what the design does not do. Nothing has
been built yet, so every number in the report is a target and saying so out loud is the
correct answer, not an apology.

Seven claims carry most of the weight in this design, and they are the ones an examiner
will press hardest, because each has a sharp edge that a loose sentence turns into an
indefensible position. They are collected in "The seven claims to state exactly", and the
wording there is the wording to use in the room.

How to use it in the three days before:

- **Day 1.** Read "The seven claims to state exactly", then "The project in one page" and
  "How it works, from first principles" until you can draw the Merkle tree and explain the
  nullifier without notes. Everything else depends on those two.
- **Day 2.** Read "The decisions we have to defend" and "What we deliberately do not do".
  These are the two sections examiners score, because they separate a design from a
  shopping list. Learn the non-guarantees as well as the guarantees: stating a limitation
  before being asked is worth more than defending one after.
- **Day 3.** Work the question bank out loud, in pairs, with one person playing examiner.
  Silent reading does not prepare you to speak. Then read "The hard ones" last, so the
  strongest attacks are the freshest thing in your head.

Three rules for the room. Answer in under a minute, then stop; a long answer invites a
follow-up into territory you did not choose. If the honest answer is "we deliberately did
not solve that, here is why", give it, because every one of those has a written reason
behind it. If you do not know, say "we have not measured that yet, here is how we would",
and never invent a number.

## The seven claims to state exactly

Seven statements, each phrased the way it should leave your mouth. Every one has a full
treatment in "The hard ones".

1. **The ballot booth builds its own authentication path.** The registrar is not contacted
   at vote time. At the close of registration it publishes the whole leaf set to IPFS and
   the CID goes on-chain in the same transaction as the root; the booth downloads the leaf
   set, rebuilds the tree in the browser, and derives its own path. The backend is never
   told which leaf is voting.
2. **Ballot secrecy is conditional and we say so every time.** Against the chain it is
   unconditional: no on-chain data links an address or an identity to a ballot. Against the
   operator it is conditional, because the relayer reads the candidate choice and sees the
   network address it arrives from. It holds when the relayer is run separately from the
   registrar, or when the voter submits directly.
3. **Roll correctness is a stated non-guarantee, and stuffing is not detectable.** The
   registrar chooses the roll size and, with voluntary registration, nobody independently
   knows the true figure. What we get is weaker: the capacity to stuff is fixed and
   published before any ballot exists, and that number is public forever. The real remedy,
   which this project does not build, is to stop trusting a single registrar.
4. **The ballot count is capped on-chain.** `VoterRegistry` stores the roll size beside the
   root and `castVote` requires that the count of spent nullifiers never exceeds it. A
   Merkle root does not commit to a leaf count, so the root and the roll size are two
   independent values written by the same registrar, and this comparison is what ties them
   together.
5. **Eligibility rests on a trusted setup we did not run.** Groth16 needs a circuit-specific
   setup, and ours is the Semaphore circuit's phase-two ceremony. We use the published
   artifacts and verify their hashes against the Semaphore repository rather than running
   our own ceremony. If every contributor to that ceremony colluded, forged membership
   proofs would verify.
6. **Relayer censorship is one attack, and it is the strongest one against this design.** A
   relayer that reads the choice and decides what to forward can drop only the ballots for
   one candidate, invisibly. We bound it with a signed receipt per accepted ballot and a
   client-side deadline; we do not remove it.
7. **The go/no-go is conditional on M1, not on the calendar.** It fires one week after M1
   actually lands, or immediately if M1 has not landed by 18 October. Behind it sits a
   second fallback, decided on 1 November: tier 2 is a complete working voting system on its
   own, so the worst case is a demonstration without anonymity rather than no
   demonstration.

## The project in one page

DVote is a decentralized voting application in which the election itself is governed by
smart contracts on a public blockchain testbed rather than by an administrator. The target
is the institutional election: a student body or senate election, a departmental
association, a club committee, a shareholder resolution, where the electorate runs from a
few hundred to a few tens of thousands, the roll comes from a membership database that
already exists, and the result is expected within hours. That is the setting where the
realistic alternative is a hosted web application that one party configures in an
afternoon, and where that party holds the roll, the ballot box, the count and the audit log
at the same time.

The actors are the Election Authority (convenes the election, sets candidates and windows),
the Registrar (checks eligibility off-chain and commits the roll), the Voter, the Candidate,
the Auditor or Observer (permissionless), and the Relayer (pays gas so a voter does not
have to). Registration puts one 32-byte Merkle root on-chain instead of a list of voters,
together with the roll size and the IPFS identifier of the leaf set, all in one
transaction. The leaf set is published for two reasons: auditors recompute the root from
it, and voters rebuild the tree from it in the browser so that nobody has to ask the
registrar for an authentication path. A ballot is a zero-knowledge proof that its author
knows a secret behind one leaf under that root, plus a nullifier that makes a second ballot
from the same voter impossible and tells nobody who that voter is. Ballot acceptance also
requires that the number of spent nullifiers stays within the published roll size, so the
declared capacity is enforced by the contract rather than asserted in prose. Tallies are
contract state, incremented only by the ballot-acceptance function. Gas is sponsored by a
relayer through an ERC-2771 forwarder, so a voter needs no cryptocurrency, and a voter who
holds gas can bypass the relayer entirely.

**The one sentence.** It is not a database with extra steps because a database still has an
operator who decides what goes into it and can show two different logs to two different
readers, whereas here inclusion and ordering are agreed by parties who do not work for us,
the counting rule is contract code that runs identically for everyone, and eligibility is
enforced when the ballot is written rather than audited afterwards by someone you also have
to trust.

The test of that sentence is step 5 of the Evaluation 2 demonstration: kill the backend on
stage, and the audit dashboard still recomputes the correct tally from chain logs alone. If
any part of our server were load-bearing for the result, that step would fail.

What is genuinely decentralized is the part that decides the outcome: ballot acceptance,
the rules, and the count. What is not decentralized is part of the participation path, and
we name it rather than hide it: the registrar decides who is enrolled, and the relayer
decides whether it pays for a ballot. Said in one line, which is the line to use when the
question is "what did you actually achieve": DVote removes the operator from the ballot box
and from the count, and leaves one party in control of the franchise.

**Secrecy, stated correctly, every time.** Against the chain, ballot secrecy is
unconditional: nothing on-chain links an address or an identity to a ballot. Against our
own operator it is conditional, because the relayer reads the candidate choice in every
ballot it forwards and sees the network address it arrives from. It holds if the relayer is
operated separately from the registrar, or if the voter submits directly. Saying "ballot
secrecy" with no qualifier is the single easiest way to lose marks in this viva, because
the qualifier is in the report and the examiner has read it.

## How it works, from first principles

Each subsection uses only what came before it. Learn them in order.

### 1. Hashes, commitments and Merkle trees

A **hash function** takes an input of any size and returns a fixed 32 bytes. Three
properties carry everything that follows. It is deterministic: the same input always gives
the same output. It is one-way: given the output you cannot work back to the input. It is
collision resistant: nobody can find two different inputs with the same output. We use
**Poseidon**, a hash chosen because it is cheap to compute inside a zero-knowledge circuit;
Keccak-256 has the same properties outside one.

A **commitment** is a hash you publish instead of the secret. A voter picks a random
**identity secret** and keeps it on their own device. They compute `commitment = H(secret)`
and hand the registrar only the commitment. Because the hash is one-way the commitment
reveals nothing about the secret (it is *hiding*); because it is collision resistant the
voter cannot later claim a different secret produced it (it is *binding*). It behaves like a
sealed envelope: the contents are fixed but unreadable.

A **Merkle tree** folds many commitments into one value. Take four voters with commitments
`a1`, `b2`, `c3`, `d4`. Hash them in pairs, then hash the results:

```
              root = H(7e, 2f) = 9d
             /                     \
      H(a1,b2) = 7e            H(c3,d4) = 2f
       /      \                 /       \
      a1      b2               c3       d4
```

`9d` is the **root**, a single 32-byte value, and it is the only thing written on-chain. It
commits to the whole set: change one leaf, add a leaf, or reorder the leaves, and the parent
above changes, and that change propagates to the root.

An **inclusion proof** (or authentication path) shows one leaf sits under the root. To prove
`c3` is in the set, send `c3` plus its siblings `d4` and `7e`. Anyone recomputes
`H(c3,d4) = 2f`, then `H(7e,2f) = 9d`, and compares against the published root. Nothing about
`a1` or `b2` was revealed, and forging the proof would mean finding a hash collision.

The cost is the point. The path length is log2 of the number of leaves: four voters means
two hashes, a hundred thousand voters fits a tree of depth 17 (2^17 = 131,072) and means 17
hashes and about 544 bytes of path. The root is 32 bytes at every size. That is why one word
of storage stands in for the whole roll, and it is the mechanism behind parameter C1. Store
the roll on-chain instead and you pay a storage slot per voter, roughly 20,000 gas each, and
registration becomes linear in the electorate.

What this does **not** give you: the root says nothing about who the leaves are. It commits
to whatever set the registrar chose, so a root is a commitment to a roll, not evidence that
the roll is honest. And you cannot enumerate voters from a hash, which is why the registrar
publishes the leaf set to IPFS with its CID recorded on-chain in the same transaction as
the root. That publication does two jobs: an auditor recomputes the root from it, and a
voter's browser rebuilds the tree from it to derive their own authentication path, so the
path never has to be requested from the party that knows which leaf belongs to whom.

### 2. Zero-knowledge proofs and zk-SNARKs

A plain inclusion proof names your leaf. Presented on-chain, it proves eligibility and
destroys ballot secrecy in the same step, because the registrar knows which leaf belongs to
which person. The fix is to run the identical check somewhere nobody can see it, and prove
that it passed.

A **circuit** is that check written as a program. Its inputs split into **public inputs**,
which everybody sees, and a **private witness**, which only the prover sees. A **zk-SNARK**
is a short object proving the circuit ran correctly on some witness. *Zero-knowledge* means
it says nothing else about the witness. *Succinct* means verification is constant work:
Groth16, the scheme Semaphore v4 uses, produces a proof of eight field elements (two G1
points and one G2 point, 256 bytes) and verification is one pairing check of roughly 200,000
to 250,000 gas, whether the tree holds 4 leaves or 100,000.

Our statement, in one sentence: *I know a secret whose commitment is one of the leaves under
root R, this nullifier is correctly derived from that same secret and this election, and I am
casting this exact signal.*

| | Value | Why it is on this side |
| :-- | :-- | :-- |
| Public | Merkle root `R` | The contract already stores it and checks the proof against it |
| Public | Scope (election id) | Identical for every voter in the election |
| Public | Nullifier | The contract must store and compare it |
| Public | Signal (candidate choice) | Binding it stops a relayer re-pointing the ballot |
| Private | Identity secret | Revealing it means impersonation and no anonymity |
| Private | Authentication path and leaf indices | The sequence of left/right indices *is* your position in the tree |

The identity commitment is **not** a public input, and must not be: the commitment plus the
published leaf set names the voter immediately. The circuit rebuilds it internally from the
secret and checks it against the private path up to the public root.

Three standard properties, instantiated here. **Completeness**: an honest voter holding a
registered secret can always produce a proof the contract accepts, which protects the voter.
**Soundness**: someone without a secret under the published root cannot produce an accepted
proof except with negligible probability, which protects the election. **Zero-knowledge**:
the proof reveals nothing beyond the truth of the statement, which protects ballot secrecy.
Soundness here is computational and rests on the trusted setup and on pairing assumptions;
zero-knowledge does not rest on the setup.

**Trusted setup.** Groth16 needs a circuit-specific setup whose leftover randomness would
let whoever kept it forge proofs. We did not run a ceremony and should not on this schedule.
We use Semaphore v4's published artifacts, from a phase-one Powers of Tau and a
circuit-specific phase two with many independent contributors, and we verify the artifact
hashes against the Semaphore repository so we know we are running the real keys. If every
contributor colluded, the holder of the leftover secret could forge membership proofs with
arbitrary nullifiers, and we would not detect that from the proofs alone. Already-cast
ballots would not become linkable, because zero-knowledge holds whatever the setup was.
This is part of why `castVote` caps accepted ballots at the published roll size: a forged
proof still cannot push the count past a number that was fixed before any ballot existed.

What this does **not** give you: it does not prove a voter is a real, distinct person, it
does not hide the candidate choice (the signal is public), and it does not resist coercion,
because anyone who obtains the secret can prove how you voted.

### 3. Nullifiers

Start from the code you would have written: `mapping(address => bool) hasVoted`. It works,
and it is unusable here, because the key is the identity. The chain is public, so
`hasVoted[0xAb3f...] = true` next to a `VoteCast` event naming a candidate is a permanent
public record of how that person voted. We want the uniqueness of that flag with a key that
is not a person.

A **nullifier** is one number:

```
nullifier = H(identitySecret, electionId)
```

and the contract keeps `mapping(uint256 => bool) spent`, keyed by nullifier instead of by
address. Three properties each do a job. It is **deterministic**, so a repeat ballot is
detectable. It is **one-way**, so the voter stays anonymous. It is **scoped** by the election
id, so one voter's nullifiers in two elections look unrelated.

Two attempts, with a toy hash `H(a,b) = (7a + 13b) mod 101` to see the shape. (Real Poseidon
returns a 254-bit field element; the toy one is invertible, which is why nobody uses it.)
Priya's secret is 42 and the election id is 5.

1. `H(42,5) = (294 + 65) mod 101 = 56`. She submits `castVote(proof, 56, "B")`. The contract
   verifies the proof against root `9d`, sees `spent[56] == false`, sets it true, increments
   B's counter. The chain now records: someone from the committed roll voted B, and the
   number 56.
2. She clears her browser and uses a different wallet on a different network. Her secret is
   still 42 and the election is still 5, so the nullifier is still 56, `spent[56]` is true,
   and the transaction reverts.

Rahul, with secret 17, produces `H(17,5) = 83`. The spent set is `{56, 83}`: two ballots, two
numbers, no names.

She cannot simply send 57 instead. The circuit derives the nullifier from the same secret
whose commitment satisfied the membership check, so the derivation is part of what the proof
asserts. Without that binding a client would mint a fresh nullifier per ballot and vote as
often as it liked. Drop the scope and a voter has one lifelong nullifier, so an observer
links their ballots across every election. Make it reversible and an attacker runs it back to
the secret, then the commitment, then the registrar's record.

What this does **not** give you: within one election the nullifier is a stable pseudonym, so
anyone who learns yours can find your ballot, and a voter who hands over their secret hands
over the vote itself, because the buyer can compute the proof and the nullifier and cast
the ballot first. Uniqueness is one ballot per leaf, not one ballot per human: a registrar
that enrols 50 phantom leaves gets 50 valid ballots. The on-chain cap limits how many
ballots exist in total, since `castVote` refuses once spent nullifiers reach the published
roll size, but it cannot tell a phantom leaf from a student.

### 4. Gas, transactions and meta-transactions

A blockchain has no single server. Every full node re-executes your request and stores the
result permanently, so the network charges per unit of work instead of per month. That unit
is **gas**, and each EVM operation has a fixed gas cost set by the protocol: adding two
numbers is 3 gas, writing to a previously empty storage slot is about 20,000, and a pairing
check is roughly 200,000. Gas is the unit; the **gas price** is a per-unit bid that buys
inclusion; the **fee** is gas used times gas price, paid in the chain's native token, POL on
Amoy. Post-EIP-1559 the base fee is burned and only the priority tip reaches a validator. If
execution runs out of gas everything reverts and the gas is still spent.

Worked example against our own budget (parameter A1 caps `castVote` at 400,000 gas, of which
the pairing check is about half):

```
300,000 gas x 30 gwei = 9,000,000 gwei = 0.009 POL per ballot
```

which is the per-ballot figure used throughout the report, and a fraction of a rupee
(parameter A2 targets under INR 0.50).

The fee is taken from the account that signed and submitted the transaction, which in
Solidity is `msg.sender`. In the obvious design every voter installs a wallet, gets POL from
a faucet, and holds a balance. That is most of the turnout gone, and it makes acquiring
cryptocurrency a precondition for voting. The naive fix of sending each voter 0.01 POL first
is worse: the funding transfer is public, so it links the registrar's address to the address
that later casts a ballot, which is exactly the deanonymization the cryptography exists to
prevent.

**ERC-2771** separates who pays from who is speaking.

1. The voter builds the full call and signs an EIP-712 typed struct over it (`from`, `to`,
   `value`, `gas`, `nonce`, `deadline`, `data`). Signing is a local operation: no
   transaction, no gas, no balance moves.
2. The relayer submits `VoteForwarder.execute(request, signature)` from its own funded
   account and pays.
3. The forwarder recovers the signer, checks the nonce (no resubmission) and the deadline
   (not stale), then calls `Election.castVote(...)` with the signer's 20 bytes appended to
   the calldata.
4. `Election` inherits `ERC2771Context`, whose `_msgSender()` returns those trailing bytes
   when `msg.sender` is the one immutable trusted forwarder, and returns `msg.sender`
   unchanged otherwise.

Step 4's condition carries the security argument: without it, anyone could call the contract
directly, append any address, and act as that person.

One DVote-specific point worth having ready. The recovered signer is **never** checked
against the roll, because eligibility comes from the proof. So the signing key can be a
throwaway generated in the browser for that one ballot, which is why gasless and anonymous
compose instead of fighting. It also means ERC-2771 is not the thing that stops a relayer
tampering with a ballot; the proof is, because the signal is a public input bound into it.

What this does **not** give you: the cost did not vanish, it moved to the relayer, which
therefore verifies the proof off-chain before it spends anything, rate limits per nullifier
and runs a capped daily budget. A forwarded ballot costs slightly more gas than a direct
one. And the standard gives no censorship resistance by itself. This is where the design's
worst attack lives, so learn it as one sentence rather than two: the relayer reads the
candidate choice in the clear and decides what to forward, so it can drop only the ballots
for the candidate it dislikes, and nothing in the turnout figure shows that, because
turnout below roll size is the normal state of every election. Two things bound it. The
relayer returns a signed receipt for every ballot it accepts, so a dropped ballot is a
signed promise it did not keep. And the booth warns the voter and offers direct submission
if no transaction hash appears before a deadline. Both bound the attack; neither removes
it, and direct submission is only available to a voter who holds gas.

### 5. One ballot, end to end

The path below touches every component, which is why it is the thing to rehearse.

| Step | Where | What happens |
| :-- | :-- | :-- |
| 1 | Browser, at registration | Identity secret generated locally, commitment sent to the registrar |
| 2 | Registrar | Institute email OTP verifies eligibility; commitment stored in PostgreSQL |
| 3 | Registrar, at close of registration | Builds the Merkle tree, publishes the leaf set to IPFS, and writes the root, the roll size and the CID to `VoterRegistry` in one transaction |
| 4 | Ballot booth | Loads the secret, reads the root, roll size and CID from the chain, downloads the leaf set, rebuilds the tree in the browser, derives its own authentication path, and checks that the voter's commitment is in the set. The registrar is not contacted |
| 5 | Web Worker | Builds the Groth16 proof (hypothesis: 1 to 3 s, which B2 exists to measure), with nullifier and signal as public inputs |
| 6 | Ballot booth | Wraps `castVote` in an ERC-2771 request, signs it with EIP-712, posts it to the relayer |
| 7 | Relayer | Verifies the proof off-chain, checks the nullifier, sponsors the transaction from its own funded account, returns a signed receipt |
| 8 | `VoteForwarder` | Verifies signature, nonce and deadline, calls `Election` with the signer appended |
| 9 | `Election.castVote` | Requires `Voting` phase, verifies the proof against the frozen root, reverts if the nullifier is spent or if accepting would push the count of spent nullifiers past the published roll size, records the nullifier, increments the candidate through `TallyLib`, emits `VoteCast` |
| 10 | Indexer | Materializes `VoteCast` into PostgreSQL for fast dashboard reads (parameter B5, target under 3 s) |
| 11 | Audit dashboard | Reads the chain through a public RPC endpoint, never our backend, and recomputes the tally from raw logs |

Every check in step 9 is a revert rather than a status flag, so a ballot is either counted or
never existed. That is transaction atomicity doing real work: verify the proof, check the
count against the roll size, record the nullifier and increment the tally must succeed or
fail together, otherwise you get a spent nullifier with no counted vote, or a counted vote
that can be cast again.

Three things in that table are worth saying out loud in the viva. Step 4 is the one to be
ready to justify: the path is derived in the browser from the published leaf set, because a
path served by the registrar would name the leaf to the one party that knows which institute
email that leaf belongs to, seconds before the relayer in the same backend receives that
voter's choice. Deriving it locally keeps the registrar off the vote path entirely. Step 7's
signed receipt is the only thing that makes a dropped ballot provable, which is what bounds
the censorship attack. And step 11 is the property the whole design exists for: the result
path does not pass through anything we operate.

## The decisions we have to defend

Each row is a decision, the alternative that lost, and the reason in one sentence. Learn the
reason, not the row.

| Decision | Alternative rejected | Why |
| :-- | :-- | :-- |
| A public blockchain at all | A signed, append-only log on a server we run | A signed log still has an operator who decides what goes into it and can show two different logs to two readers; a chain agrees inclusion and ordering among parties who do not work for us, and enforces the acceptance rule at write time instead of auditing it afterwards |
| Polygon Amoy, chain id 80002, as the primary testbed | Ethereum Sepolia, Base Sepolia | Sepolia reaches end-of-life on 30 September 2026, seven weeks before the demonstration, and Base Sepolia settles to it; Amoy is the maintained Polygon PoS testnet with about 2 s blocks and an independent lifecycle |
| A3 as a desk calculation over one gas figure | Deploying to a second network and measuring it there | Gas is a function of the EVM and the bytecode, so an identical suite consumes identical gas on any EVM chain and a second deployment would measure a fee market rather than a property of the design. Sepolia is not a deployment target at all, because it reaches end-of-life on 30 September 2026 and the first deployable contract lands with M1 in October. A3 prices the single A1 gas figure under Ethereum mainnet, Polygon PoS mainnet and Amoy conditions, and reports a band across gas prices (see "The hard ones", item 8) |
| Anvil for gas and throughput | Measuring everything on Amoy | Gas is deterministic given the bytecode and the calldata, so local measurement is exact rather than approximate; and at 0.009 POL a ballot against about 0.1 POL a day from a faucet, a 200-ballot load run is not fundable |
| Semaphore v4 | Custom circom circuits | It is exactly the primitive we need, anonymous group membership with a scoped nullifier, audited and maintained; writing our own circuits would consume the project budget and put unaudited cryptography at the centre of a security project |
| Semaphore's circuits, verifier and nullifier scheme, but **not** its on-chain group management | Using Semaphore's group contracts | Their `addMember` inserts a leaf into contract storage, so registration would cost gas per voter and be linear in the electorate, which is the exact curve this design exists to flatten |
| Semaphore rather than MACI | MACI | MACI adds the coercion resistance we lack, but it needs a coordinator, encrypted messages and key rotation, and its coordinator is itself trusted for privacy, so it trades one trust assumption for another |
| Membership tree built off-chain, only the 32-byte root on-chain | Storing the roll on-chain | Registration becomes one storage write for a roll of any size, which is parameter C1; the price is that the tree is not reconstructible from chain data, so the registrar publishes the leaf set to IPFS and its CID goes on-chain beside the root. Publication serves the voter as well as the auditor: the booth rebuilds the tree from it to derive its own authentication path, which is what keeps the registrar off the vote path |
| EIP-1167 minimal proxy clones | A fresh `Election` deployment per election | A clone is a few dozen bytes delegating to one shared implementation, so deployment cost falls by an order of magnitude (parameter A5, target above 90% saving), and the shared implementation is immutable, so nobody can rewrite the rules mid-vote |
| A relayer sponsoring gas through ERC-2771 | The voter pays their own gas | A voter should not have to acquire cryptocurrency to vote (parameter E2). Do not reach for the line that direct submission makes censorship "an expense rather than a veto": it is only an expense for a voter who already holds gas, and E2 sets that holding to zero. The signed receipt and the client-side deadline are what make a drop provable, and they bound the attack rather than removing it |
| Foundry | Hardhat 3 | Tests are written in Solidity, so there is no language switch between a contract and its test, and `forge snapshot` emits per-function gas numbers as a side effect, which is parameters A1, A4, A5, C1 and C4 measured for free; the built-in fuzzer supplies the adversarial ballot tests D1 needs |
| OpenZeppelin Contracts 5.x | Hand-rolled access control, forwarder, Merkle proofs, clones | In a project whose subject is security, reimplementing an audited role check is hard to defend and harder to review |
| The audit dashboard reads a public RPC endpoint and never our backend | Serving the tally from our indexer | An audit routed through our own server verifies our claims rather than the chain, and would be worth nothing at the moment it mattered; this is what makes killing the backend mid-demonstration a meaningful test |
| The backend is a convenience and liveness layer only | A backend that holds any authority over the result | The registrar's only output is a root that then freezes, the relayer can neither forge, alter nor replay a ballot, and the indexer is a cache rebuildable from genesis. Do not shorten the middle clause to "the relayer only pays gas and can be bypassed": it can still drop the ballots for one candidate, and the bypass needs gas E2 says the voter does not hold |
| Tier 2 shipped before tier 3 | Building the anonymous version directly | The cost of anonymity is a difference and a difference needs two endpoints; a gas snapshot at M1 fixes one, the same snapshot after Phase 2 gives the other, and if tier 3 fails outright tier 2 is still a complete system to demonstrate |
| IPFS with the CID stored on-chain for metadata | Storing manifestos on-chain | A content identifier gives the same integrity guarantee for a fraction of the gas (parameter A4), accepting that availability now depends on somebody pinning the file |
| `TallyLib` as a separate library | Counting rules inside `Election` | The counting rule is published with the election and can be swapped for approval voting without touching lifecycle logic, so it is fixed before ballots exist rather than settled once they are in |

## What we deliberately do not do

State these confidently. A system whose limits are named can be reasoned about by the people
who rely on it; one whose limits are unstated is only one whose failures have not been found
yet. An examiner who finds a gap you already conceded scores it as understanding. An examiner
who finds one you claimed not to have scores it as overclaiming, and then doubts the claims
you did make.

The six in the report:

| Non-guarantee | Why out of scope | The one-line answer |
| :-- | :-- | :-- |
| **Coercion resistance** | The fix is MACI-style key rotation, which needs a coordinator and far more circuit work than eight weeks allows | "A voter who hands over their secret does not merely prove how they voted, they transfer the vote: the buyer computes the proof and the nullifier and casts the ballot, and the voter cannot override it. The receipt that gives individual verifiability is the same object that makes coercion possible, and we chose verifiability. On the vote-buying axis we are worse than the hosted system and worse than paper, and the honest scope is that DVote is the right trade against a dishonest operator and the wrong trade against a candidate with cash and a small electorate." |
| **Sybil resistance at the registrar** | Preventing it needs an identity source stronger than an institute email, which is a question about institutional process | "A dishonest registrar can enrol people who do not exist and no amount of zero-knowledge machinery stops that; the proof shows a leaf is in the committed set, not that the set is honest. We do not claim to detect it either, because the registrar chooses the roll size and registration is voluntary, so nobody independently knows the true figure. What we get is that the capacity to stuff is fixed and published before any ballot exists, and the contract refuses ballots beyond it." |
| **Roll correctness** | The remedy is to stop trusting one registrar, which is a change of structure rather than a feature we could add in eight weeks | "We guarantee nothing about whether the published roll is the right roll. Leaves can be added for people who do not exist and a real registration can be dropped, and recomputing the root catches neither, because it only proves the leaves match the root. Two cheap things bound it: the registrar signs a receipt over each accepted commitment, so an excluded voter holds evidence that contradicts the published leaf set, and the booth checks the voter's own commitment is in that set before they vote. The remedy we do not build is splitting the registrar across parties who each hold a share of the enrolment, or having candidate-appointed observers co-sign the leaf set before the root is frozen." |
| **Ballot secrecy against our own operator** | Removing it needs encrypted ballots or several independent relayers; one changes the tallying design, the other the deployment | "Against the chain, secrecy is unconditional. Against the operator it is conditional: the relayer reads the candidate choice in everything it forwards and sees the address it arrives from, so secrecy holds when the relayer is run separately from the registrar, or when the voter submits directly. And because the party that reads the choice is the party that decides what to forward, it can drop ballots for one candidate invisibly. The signed receipt makes a drop provable; it does not prevent one." |
| **Network-level anonymity** | A genuine fix means Tor or a mixnet, which is a networking project | "The relayer and the RPC provider see IP addresses. We strip what metadata we can and we do not claim to have solved it." |
| **Secrecy of the running tally** | Hiding it needs homomorphic or commit-reveal tallying, which adds a phase the lifecycle does not model | "Votes are counted on-chain as they arrive, so a partial result is visible while voting is open and can influence late voters. A sealed box does not leak that, so on this axis we are worse than paper and we say so." |

Three more to concede in the first sentence if they come up:

| Gap | The one-line answer |
| :-- | :-- |
| **Credential transfer and organised vote farming** | "The identity secret is a bearer credential with nothing binding it to a person, so it can be sold or generated in bulk by an operator registering on voters' behalf. Anonymity also removes the forensic trail a centralized system would leave, which is a genuine cost of the design." |
| **A lost identity secret** | "The secret lives in browser storage and the root freezes at the close of registration, so a cleared browser between registration and voting is permanent disenfranchisement. The standard fix is deriving the identity deterministically from a wallet signature so it is reproducible and never stored at rest, and E5 measures whether a voter enrolled in one browser profile can vote from another." |
| **Availability of the published leaf set** | "The CID is on-chain, so a registrar who publishes a leaf set that does not reproduce the root is caught immediately. One who publishes nothing, or unpins it later, is not caught by that check, and since the booth builds its authentication path from that file, withholding it blocks voting rather than only blocking audit. We expect observers to fetch and pin their own copy at publication time, and a non-empty CID is a precondition for opening the voting window." |

Three framings worth memorising. First: the verification path is decentralized while parts
of the participation path are not, and killing the backend on stage is our own
demonstration of exactly that distinction. Second: every one of these limitations has a
known remedy we did not have the schedule to build, and naming the remedy (key rotation, a
stronger identity source, encrypted ballots, anonymizing transport, a split registrar) is
what turns a gap into future work. Third, and this is the sentence to reach for when an
examiner asks what the project is worth: DVote removes the operator from the ballot box and
from the count, and leaves one party in control of the franchise.

## Question bank

Answers are written to be spoken in under a minute. Follow-ups and traps are the examiner's
next move, not part of the answer.

### Fundamentals

**When you say your election logic "is a smart contract", what is that thing actually, on the
machine? Where does it live, and when does it run?**

It is bytecode stored in an account at an address, with its own persistent storage. Nothing
runs in the background; there is no process. It executes only when a transaction calls it,
and then every node processing that block loads the same bytecode and runs it in the EVM
against the same prior state. Because execution is deterministic they all reach the same
result. So `castVote` is not a service we host and could quietly patch, it is code every
validator re-runs, which is why nobody including us can make it treat one voter differently.

> *Follow-up.* "Your lifecycle moves from Registration to Voting at a timestamp. If nothing
> runs on its own, who moves it?" Nobody automatically. The contract checks `block.timestamp`
> inside a transition function, but until someone sends a transaction the state variable
> still reads Registration. The timestamp gates whether the call succeeds; it does not fire
> the call.
>
> *Trap.* "A program running on the blockchain" or "an autonomous agent". There is no timer
> and no scheduler, and a student who believes otherwise cannot explain who advances their
> own lifecycle.

**What is gas, mechanically, and who actually pays it when a ballot is cast?**

Gas is a unit charged per EVM operation so that computation and storage on a shared machine
are not free. Each opcode has a fixed cost, storage writes are the expensive ones, and the
transaction carries a gas limit; exceeding it reverts everything but still spends the gas.
The fee is gas used times gas price, in POL on Amoy. In our system the voter pays nothing:
the ballot goes through an ERC-2771 forwarder and our relayer submits the transaction. A
voter who does hold POL can submit straight to the contract, which is our escape hatch, and
which is only available to a voter who already holds POL, so it bounds a censoring relayer
rather than defeating one.

> *Follow-up.* "Under the forwarder, inside `castVote`, what does `msg.sender` equal?" The
> forwarder's address. `ERC2771Context` recovers the real signer from the end of the
> calldata. It matters less for us than for most contracts, because we never authorize
> anyone by address.
>
> *Trap.* "Gas is the transaction fee" blurs units with price, and "the contract pays the
> gas" cannot happen: only an externally owned account can originate and fund a transaction,
> which is why a relayer account has to exist at all.

**Everyone says a blockchain is immutable. What stops the election authority going back and
deleting a ballot they do not like?**

Nothing about the data structure alone. Each block header carries the previous block's hash,
so altering an old transaction breaks every hash after it, but that only makes tampering
detectable. What makes it impractical is consensus: getting the altered chain accepted means
rebuilding every later block and out-weighing the honest chain under the fork-choice rule,
which on a proof-of-stake network means controlling a large fraction of stake and losing it
if you are caught. Our authority holds no stake on Amoy, which is precisely why we do not run
our own chain.

> *Follow-up.* "Would a private chain your group operates give the same guarantee?" No, and
> it would undo the project. The guarantee comes from the validator set not being controlled
> by a party to the election; if we ran the nodes we would be the trusted operator the design
> exists to remove.
>
> *Trap.* "It is cryptographically impossible to change." Hash linking gives tamper-evidence
> only. Distribution alone is not the answer either, since a replicated database controlled
> by one party is still controlled by one party.

**Walk me through what the EVM does when a ballot transaction calls `castVote`. Opcode
level.**

The EVM is a deterministic stack machine. The transaction names our `Election` address and
carries calldata whose first four bytes select the function. Execution runs opcodes over a
256-bit word stack, with scratch memory that dies when the call ends and storage in 32-byte
slots that survives, and every opcode subtracts from the gas budget. For `castVote` it runs
the Groth16 pairing check through the precompiles, reads the nullifier slot, compares the
ballot counter against the stored roll size, and if the slot is empty and the count is under
the roll size it writes the nullifier, bumps the counter and increments the candidate's
tally, three storage writes, then emits `VoteCast`. Every node ends at the same state root.

> *Follow-up.* "Which part is expensive?" The pairing check at roughly 200k gas and a cold
> storage write at about 20k. That is why A1 targets under 400k rather than some small
> number: verification is most of the budget before we write anything.
>
> *Trap.* Assuming the proof is checked off-chain and only the result submitted. If
> verification were off-chain the contract would be trusting our server and every security
> claim collapses. Also: `castVote` is atomic, so a revert rolls back the nullifier write and
> the tally increment together, which is what makes one-voter-one-ballot a single fact rather
> than three steps that can half-fail.

**Your audit dashboard rebuilds the tally from event logs. What is an event log at the
protocol level, and why should I believe it?**

An event is the LOG opcode. It writes topics and data into the transaction receipt, not into
contract storage, and receipts are hashed into a receipts root committed in the block header.
So a log sits under the same consensus and the same hash chain as state, and cannot be forged
after the fact without rewriting the block. Two consequences: logs are cheap, a few hundred
gas against twenty thousand for a storage write, and contracts cannot read logs, so nothing
on-chain depends on them. The dashboard replays `ElectionCreated`, `VoterRootPublished`,
`VoteCast` and `Finalized` and recomputes the totals itself.

> *Follow-up.* "The dashboard asks Alchemy for those logs. Have you not moved the trusted
> party?" Partly, yes. Alchemy could serve false logs. The mitigation is that anyone can
> point the dashboard at a different endpoint or their own node, so it is a substitutable
> dependency rather than a unique one. We do not run a light client in the browser, and that
> is a known gap.
>
> *Trap.* "Events are how a contract stores data cheaply." No contract can read back what it
> logged, so logs can never hold state the logic depends on.

**What consensus algorithm secures the chain you are deploying to, and why should you care?**

Polygon PoS, which Amoy is the testnet for, runs proof of stake in two layers: Heimdall, a
Tendermint-based validator layer that selects proposers and produces checkpoints, and Bor,
the EVM block producer with roughly two-second blocks. Checkpoints of the Bor chain are
periodically committed to Ethereum. We care because of finality: two-second blocks make the
demo responsive, but a freshly included block is not final and a short reorg can drop it.
That is why D9 is reorg safety, and why our B1 target of p95 under ten seconds is
confirmation time, not block time.

> *Follow-up.* "Your voter gets a receipt at one confirmation. What do you tell them?" That
> the ballot is included, not settled. We show a confirmation count and implement no
> finality-gadget check; the receipt is a pointer to a transaction, not a promise about
> permanence.
>
> *Trap.* "Proof of work" (Polygon PoS never was) or "whoever holds the most tokens controls
> it" (stake selects proposers and secures the fork choice; it does not let a wealthy party
> silently rewrite accepted blocks).

**Polygon PoS is usually filed under "Layer 2". Is it one?**

It is a sidechain, and calling it a Layer 2 is loose, so we do not. A rollup posts its
transaction data to Ethereum and inherits Ethereum's security, so anyone can reconstruct its
state from L1 data alone. Polygon PoS has its own validator set and its own security budget,
and it checkpoints state roots to Ethereum without posting the data needed to reconstruct
state. That wording matters for A3 as well: we do not present it as a Layer-1 against
Layer-2 result. Gas is identical across EVM chains, so a second deployment would only have
produced a second copy of the same number. A3 instead prices the one measured gas figure
under several fee regimes and reports a band.

> *Follow-up.* "Does the distinction matter for an election?" Yes. On a sidechain, that
> chain's validator set becomes a trust assumption for the election record. For a course
> project on a testnet that is acceptable and we say why; a production deployment belongs on
> a rollup or on L1, and that is future work rather than a security-neutral choice.
>
> *Trap.* "Layer 2 means built on top of Ethereum, so cheaper and faster." That sentence has
> the security question removed from it.

**Mid-demo a voter gets their receipt, and then the chain reorgs that block out. What happens
to their vote and to your dashboard?**

The transaction is no longer canonical, so the nullifier write and the tally increment are
gone from state. If it is still valid and sitting in a mempool it can be re-included later
and counts then; if not, the vote was not cast and the voter resubmits. Resubmitting is safe
precisely because the nullifier was never recorded, since our double-vote check reads state,
not receipts. The indexer has to detect the reorg through a parent-hash mismatch and roll
back the rows it materialized, which is D9, tested by forcing a reorg on Anvil.

> *Follow-up.* "How deep a reorg are you exposed to on Amoy?" Realistically a few blocks, and
> we plan to wait several confirmations before presenting a receipt as settled. We have not
> quantified it, and D9 tests that the indexer self-heals rather than measuring Amoy's real
> reorg distribution.
>
> *Trap.* "It is on the blockchain, so it cannot be lost" treats inclusion as finality.
> Worse: "our database still has the ballot, so we would replay it". The backend holds no
> authority to cast anyone's ballot, and a server-side replay would be the system forging a
> vote.

### Cryptography

**What is a Merkle tree, and why does putting one 32-byte root on-chain commit you to the
entire voter roll?**

Leaves are the voters' identity commitments, each parent is the hash of its two children, and
you keep hashing upward until one value is left. We use Poseidon because it is cheap inside a
SNARK circuit. The root commits to the whole set because the hash is collision resistant:
change, add or reorder one leaf and the change propagates to the root. So once the registrar
publishes the root they cannot quietly swap a voter in or out, and anyone holding the
published leaf set can recompute the root and check it against the chain.

> *Follow-up.* "How big is that root when the roll goes from 1,000 to 100,000?" 32 bytes
> either way. The tree gets deeper, roughly depth 10 to depth 17, but the root is one value
> and one storage write. That is parameter C1.
>
> *Trap.* "The root stores the roll." A hash is one-way; the root reveals nothing about any
> member, which is exactly why the leaf set has to be published separately.

**What exactly does the zero-knowledge proof prove? Give me the statement in one sentence,
then tell me what the chain sees.**

The statement is: I know a secret whose identity commitment is one of the leaves in the tree
with root R, and this nullifier is correctly derived from that same secret and this
election's identifier. That is all it says; it does not say which leaf. What lands on-chain
is the root, the scope, the nullifier, the signal encoding the candidate, and eight field
elements of Groth16 proof. The secret, the commitment and the path never appear. The contract
checks the proof against the root it stores, checks the nullifier is unseen, records it, and
increments the count.

> *Follow-up.* "Which of those public values could identify the voter?" None on its own. Root
> and scope are identical for everyone; the choice is public by design; the nullifier is a
> pseudorandom field element. The real linkage risk is at the network layer, which we list as
> a non-guarantee.
>
> *Trap.* "It proves the voter is eligible" drops half the statement. If the choice were not a
> public input the relayer could rewrite the ballot, and if the nullifier were not bound to
> the same secret a voter could mint a fresh one per ballot.

**Explain how you stop one person voting twice, without using the word nullifier until you
have said what it is.**

Each voter generates a secret on their own device and gives the registrar only a hash of it.
Those hashes are the leaves of a Merkle tree and one 32-byte root goes on-chain, then freezes.
To vote, the browser proves "I know a secret whose hash is one of the leaves under that root"
without saying which one, and publishes alongside it one number computed from the secret and
the election id. It is the same number every time that voter votes here and reveals nothing
about the secret. That number is the nullifier; the contract stores it and reverts on a
repeat.

> *Follow-up.* "So what stops me registering two secrets?" Nothing in the contract. The
> registrar is meant to accept one commitment per verified person, and Sybil resistance at
> the registrar is an explicit non-guarantee.
>
> *Trap.* "We check the voter's address has not already voted." The sender is the relayer for
> every ballot, and tracking voter addresses is exactly the link the design refuses to create.

**Suppose I am watching the chain and I already hold the full published list of identity
commitments. Convince me I cannot work out who cast a particular ballot.**

You have commitments, which are Poseidon hashes of public values. The nullifier is Poseidon
of the secret and the scope. There is no function taking a commitment to a nullifier, because
both need the secret and you do not have it. Your only attack is to guess a secret, compute
the nullifier and look for a match, and the secret is a random value in a field of about
2^254. The proof adds nothing for you, because Groth16 is zero-knowledge, so a thousand
ballots give you a thousand unrelated-looking field elements.

> *Follow-up.* "What if I am the registrar and I generated the secrets?" Then anonymity is
> gone, which is why the voter generates the identity in the browser and sends only the
> commitment, and why the booth builds its authentication path from the published leaf set
> rather than asking the registrar for it. The server-side proving contingency weakens
> this badly, because the secret would leave the device and land on the same host as the
> relayer, so it is a documented loss of privacy rather than a neutral substitution.
>
> *Trap.* "It is anonymous because the proof is zero-knowledge." Incomplete: the nullifier is
> a public output sitting outside the hidden part, and its safety comes from preimage
> resistance plus the entropy of the secret.

**List the circuit's public and private inputs, and for each private one say why it must be
private.**

Public: the Merkle root, the scope, the nullifier, and the message encoding the candidate
choice; the tree depth is public too. Private: the identity secret, and the Merkle proof,
meaning the sibling hash and the left-or-right index at each level. The secret must be private
or there is no anonymity and anyone holding it could impersonate the voter. The path must be
private because the sequence of indices is literally the position of your leaf in the tree;
publish it and you have named which registered voter you are, even without the secret.

> *Follow-up.* "Which public input stops the relayer changing my vote?" The message. The
> choice is baked into the proof, so altering it invalidates the proof. A relayer can refuse
> to forward a ballot; it cannot rewrite one.
>
> *Trap.* Listing the identity commitment as public. It is not, and must not be: the
> commitment plus the published leaf set identifies the voter immediately. The circuit
> rebuilds it internally.

**If a plain Merkle proof already proves eligibility in tier 2, what does the SNARK in tier 3
actually buy you?**

A plain Merkle proof is verified on-chain, so the leaf and the sibling path go into calldata
in the clear. The contract learns exactly which registered voter you are, and so does anyone
reading the transaction. It gives eligibility and nothing else. The SNARK moves the same
membership check inside a circuit, so the contract verifies that the check passed without
seeing the leaf, and the nullifier replaces address tracking for double-vote prevention. That
is what buys ballot secrecy, with the qualifier we always attach: unconditional against the
chain, and against our own operator conditional on the relayer being run separately from the
registrar, or on the voter submitting directly. Shipping tier 2 first is how the cost of it
gets measured instead of asserted.

> *Follow-up.* "What does tier 3 cost in gas compared with tier 2?" We do not know yet, and
> finding out is the point. A gas snapshot is committed at the M1 gate on 11 October.
> Expectation: Merkle path verification is a few thousand gas per level while Groth16
> verification is a flat couple of hundred thousand, so tier 3 costs more per ballot in
> absolute terms and stops growing with the roll.
>
> *Trap.* "The SNARK makes it cheaper." Almost certainly the opposite. It buys privacy and
> flatness, not a lower absolute number.

**Groth16 needs a trusted setup. Did you run a ceremony? If not, what are you trusting?**

We did not, and we should not on this schedule. We use Semaphore v4's published proving and
verification keys, from a phase-one Powers of Tau and a circuit-specific phase two run with
many contributors. What we trust is that at least one contributor destroyed their share. If
every participant colluded, whoever held the leftover secret could forge membership proofs
and vote without being on the roll, and we would not detect that from the proofs alone, since
a forged proof verifies exactly like an honest one. It would not let them deanonymize honest
ballots, because zero-knowledge holds regardless. Our practical obligation is to verify the
artifact hashes against the Semaphore repository, so we know we are running the published
keys, and the on-chain cap is the structural backstop: `castVote` refuses a ballot once spent
nullifiers reach the published roll size, so even forged proofs cannot push the count past a
number fixed before any ballot existed.

> *Follow-up.* "Define completeness, soundness and zero-knowledge on a ballot." Completeness:
> an honest registered voter can always produce an accepted proof, which protects the voter.
> Soundness: someone outside the root cannot, except with negligible probability, which
> protects the election. Zero-knowledge: the proof reveals nothing beyond the statement, which
> protects secrecy. A leaked setup breaks soundness, not zero-knowledge.
>
> *Trap.* "We do not need a trusted setup because we did not write the circuit." The
> requirement belongs to the proof system and that circuit. Using someone else's zkey means
> inheriting their ceremony's assumption, not escaping it.

**A voter's phone is compromised and their identity secret is copied a week before voting.
What can the attacker do, and what can your system do?**

The attacker can vote as that voter, because the secret is the only thing the circuit checks.
Whoever casts first burns the nullifier, and the honest voter is locked out with no way to
prove it was not them, since unlinkability is the whole point. The attacker can also prove
afterwards how that voter voted. What we can do is limited: the root freezes when registration
closes, so there is no revocation mid-election. If the compromise is known during
registration, the registrar publishes a tree without that leaf, and before voting opens the
authority can cancel. After voting opens, nothing.

> *Follow-up.* "Is that acceptable for a real election?" No, and the report says so. The real
> fix is MACI-style key rotation, where a new key invalidates earlier ballots, which needs a
> coordinator and much more infrastructure than the schedule allows.
>
> *Trap.* "The voter re-registers" or "the admin removes them from the roll". Neither exists.
> The root is immutable once voting opens, deliberately, because a mutable root would let the
> authority swap the electorate mid-vote.

**Same voter, two different elections on your system. Can an observer tell it is the same
person?**

Not from the nullifiers. The nullifier hashes the secret together with the scope, so one
secret produces two unrelated-looking values and linking them means inverting Poseidon. There
are two non-cryptographic leaks, though. If the voter reuses one identity, the same commitment
appears in both published leaf sets, so the registration is linkable even when the ballots are
not. And if the voter bypasses the relayer and submits directly, the paying address appears in
both transactions. We would advise a fresh identity per election.

> *Follow-up.* "Why put the scope in the nullifier at all?" Otherwise the nullifier is
> identical in every election, so one voter is trivially linkable across all of them and a
> nullifier spent once becomes a permanent public identifier. Binding it to the election makes
> it a per-election pseudonym.
>
> *Trap.* "No, because everything is anonymous." Too broad, and it skips the two real
> linkages. Anonymity here is scoped to the ballot, not to the whole system.

### Architecture and scale

**Exactly what goes on-chain when a voter registers, and exactly what goes on-chain when they
cast a ballot? Be specific about bytes.**

On registration, nothing per voter. The registrar collects commitments off-chain, builds the
tree in PostgreSQL, and writes one transaction to `VoterRegistry`: a 32-byte root, the roll
size, and an IPFS CID for the leaf set. One storage write for the whole roll at any size. On a
vote, the calldata is a Groth16 proof of eight field elements plus four public signals, call
it 400 bytes. The storage written is one nullifier slot, one tally increment and one ballot
counter increment, plus an event. The counter is what lets `castVote` refuse a ballot once
the spent nullifiers reach the published roll size, and its warm write is a cost A1 has to
carry. The Merkle path never touches the chain; it is a private witness inside the circuit.

> *Follow-up.* "What is the on-chain state growth for 100,000 ballots?" One 32-byte nullifier
> slot per ballot plus logs, so cumulative state is linear in turnout even though gas per
> ballot is flat. That is linear in people who actually vote, not in the size of the roll, and
> we should report both rather than only the flattering one.
>
> *Trap.* Saying registration writes each commitment, or that Semaphore's `addMember` is
> called per voter. That is the design we deliberately rejected.

**Your headline claim is that gas is constant in the size of the electorate. Constant in what,
exactly, and what is not constant?**

Constant in the size of the voter roll, per operation. Publishing a roll of ten and a roll of
a hundred thousand is the same single root write, and verifying a ballot costs the same either
way because the verifier only sees the root and a fixed-size proof. What is not constant:
total gas is linear in ballots cast, because each writes a nullifier; the registrar's work is
linear in the roll; the published leaf set is linear in the roll; and client-side proving is a
function of tree depth, which C2 measures separately. The precise claim is per-operation gas
against electorate size.

> *Follow-up.* "So is calling it O(1) in the report an overstatement?" Yes, if written bare.
> It should read as O(1) gas per operation in the size of the roll, with the linear terms named
> in the same sentence.
>
> *Trap.* "The whole system is O(1)." That conflates per-operation gas with total system cost
> and quietly drops the registrar's work, the IPFS publication and the per-ballot cost that
> scales with turnout.

**How big is one of these proofs, and what does verification cost? Numbers.**

Groth16 proofs are constant size regardless of tree depth: two G1 points and one G2 point,
eight 256-bit words, 256 bytes. With the four public signals, calldata for `castVote` is
around 400 bytes, roughly 6,000 gas at 16 gas per non-zero byte. Verification is one pairing
check through the precompiles, about 200,000 to 250,000 gas, which is the dominant term. A1
targets the whole of `castVote` under 400,000 knowing the pairing eats half the budget; the
rest is the nullifier write, the tally increment and the event. None of it is measured yet.

> *Follow-up.* "What if `castVote` comes in at 500,000?" We report it and explain it. The
> pairing cost is not negotiable with Groth16, so we would look at the nullifier storage
> layout and the event payload, and present the delta against the tier 2 baseline so the cost
> of anonymity is a measured number rather than an excuse.
>
> *Trap.* Saying the proof grows with the number of voters. That confuses the Groth16 proof
> with the Merkle inclusion proof, which does grow logarithmically but never reaches the
> chain.

**If the tree lives only off-chain, how do I as an outside auditor check that the on-chain root
corresponds to a legitimate roll?**

Two separate checks, and only the first is cryptographic. First, the root is on-chain and
frozen at the close of registration, the registrar publishes the leaf set to IPFS with the CID
recorded in the same write, and you fetch the leaves, rebuild the tree with the same hash and
ordering, and check the root matches. A registrar who publishes a mismatching set is caught
immediately. Second, and this is the honest part: that does not prove the leaves are real
people, and it does not prove the set is the set that should have been published. Recomputing
the root proves the leaves match the root and nothing more, so substituting one voter's
commitment for the registrar's own passes every check an auditor can run. Sybil resistance at
the registrar and roll correctness are both explicit non-guarantees. Do not say the roll size
makes stuffing detectable: the registrar chose that number. What the published number gives is
a capacity fixed before any ballot exists, which `castVote` then enforces.

> *Follow-up.* "What does the chain lose by keeping the tree off-chain?" Data availability. A
> chain-only auditor can verify every ballot proved membership under that root and that no
> nullifier repeated, but cannot see whose commitments are in the set. A non-empty CID is
> required before voting opens, so the registrar has to point at something; no on-chain
> mechanism can force that something to stay retrievable. Putting the leaves on-chain is
> exactly what we traded for the flat line, and enforcing availability would mean posting the
> leaf set as calldata or using a data availability layer.
>
> *Trap.* "Auditors can rebuild the tree from chain events." No leaf is ever written on-chain;
> that is the entire reason registration is one write.

**Does proof generation time grow with the size of the tree? What did you predict, and what if
the measurement disagrees?**

We predicted logarithmic and we are not certain that is what we will measure. In principle the
circuit computes one Poseidon hash per level, depth 17 for 100,000 against depth 4 for 10. But
Semaphore v4 compiles to a fixed maximum depth and pads shorter proofs, so the circuit may do
the same work regardless of the real roll size. If that is what we see, C2 comes out flat
rather than logarithmic and the correct report shows the flat line and explains why. What
genuinely grows on a real device is memory pressure and the proving key download, which is why
B2 is measured by device class.

> *Follow-up.* "If C2 comes out flat, is the parameter wasted?" No. The question a reader has
> is whether a bigger electorate makes voting slower for the individual voter, and flat is a
> stronger answer than logarithmic. We keep the parameter and change the claim.
>
> *Trap.* "Proving time is constant because zero-knowledge proofs are constant size." That
> confuses proof size and verification cost, which are constant, with proving time, which is a
> function of circuit size.

**Walk me through 100,000 voters. Where does this system break first? Name a component.**

Not the contract. Gas per ballot is flat, so chain cost at 100,000 is the same as at 10. Three
things break before it. The relayer signs from one address, so its nonce is a global lock and
transactions serialize behind it; that is the knee C3 should find, and the fix is a pool of
relayer keys with independent nonces. Then the RPC provider's rate limit, since we are on a
hosted tier. Then the chain: about 30 million gas per two-second block at 400,000 gas a ballot
is roughly 37 ballots a second if we owned the whole chain, which we do not. Registration is
fine, because the tree build is off-chain.

> *Follow-up.* "Thirty-seven a second sounds like plenty." It is about 45 minutes of
> continuous block space for the whole roll, assuming we own the chain. For a campus election
> that is comfortable; it stops being comfortable three orders of magnitude further up.
>
> *Trap.* Naming the contract or gas as the bottleneck. That is the one thing this design made
> flat, so naming it shows the scalability story was recited rather than reasoned about.

**It is election day and your relayer is down or its wallet is empty. What happens to a voter
holding no POL?**

Two things. The ballot is an ERC-2771 signed request, so it is not bound to our relayer:
anyone can submit it to the forwarder, because the signature and the proof are over the
payload, not over who pays. The request carries a deadline, so it is not replayable forever.
Second, a voter who holds POL can call `Election` directly and skip the forwarder. The honest
limitation is that this preserves censorship resistance, not usability: a voter with no POL
and no way to get it inside the voting window is stuck, and E2 claims the voter needs zero
cryptocurrency. For the demo we pre-fund audience wallets and keep a second relayer wallet.

> *Follow-up.* "So your zero-gas property has a liveness dependency on a server you operate."
> Yes, and the relayer is the only one on it. The registrar is not a second, because the booth
> builds its authentication path from the published leaf set rather than asking for it; a
> registrar that served nothing to one named voter would be a silent censor with no bypass at
> all, since direct submission bypasses the relayer and not the registrar. The relayer cannot
> forge, alter or replay a ballot; it can decline to pay for one, which the signed receipt and
> direct submission bound rather than remove.
>
> *Trap.* "The voter just pays their own gas", said casually. It breaks E2, and a voter
> recruited on the promise of needing no cryptocurrency cannot go and acquire POL mid-window.

**Your indexer caches chain events into PostgreSQL. How do you know that cache agrees with the
chain?**

The indexer is a cache and never a source of truth. The audit dashboard does not read it at
all; it reads the chain through an RPC endpoint, which is the property we demonstrate by
killing the backend. For the cache itself: every row is keyed on transaction hash plus log
index, so replaying a block is idempotent; we store each block's hash and check that every new
block's parent hash matches the last one stored, and a mismatch means a fork; and the whole
database is rebuildable from genesis, which Phase 3 demonstrates. B5 measures the lag, target
under three seconds, and D9 is the reorg test.

> *Follow-up.* "How do you know the rebuilt database equals the incrementally built one?"
> Rebuild into a second schema and diff the tables, and separately compare the tally against a
> direct read from the `Election` contract. The contract is the referee.
>
> *Trap.* "We poll every few seconds, it stays in sync." With no fork detection the divergence
> is silent, and it hands the operator the ability to publish a number nobody can check.

**Could this architecture run a national election? India, roughly 970 million registered
voters. I want the arithmetic.**

No. Polygon gives roughly 30 million gas per block at about two seconds, so 15 million gas a
second. At our 400,000 gas target that is about 37 ballots a second if we owned the entire
chain. India cast roughly 640 million votes in 2024, which is around 200 days of continuous
block space with nothing else running. So the design is right for elections of thousands, a
campus, a society, a shareholder vote, and it is off by about three orders of magnitude for a
country. The honest fix is aggregating many ballots into one proof, or settling on a rollup,
which is a different project.

> *Follow-up.* "What else fails at national scale?" The registrar, because Sybil resistance is
> an explicit non-guarantee and at that scale an off-chain eligibility check by one party is
> not acceptable. Also the public running tally, which at that scale is a real problem rather
> than a footnote, and the absence of coercion resistance.
>
> *Trap.* Answering yes with a wave at sharding or more servers. The arithmetic gives a
> negative answer, and volunteering it with the multiplication attached scores far better.

### Security and threat model

**I am a registered voter and I want to vote twice. What stops me, and name the piece of
state that does it.**

The proof I generate carries a nullifier, a hash of my identity secret and the election id. It
is deterministic, so both ballots produce the same value, and it reveals nothing because the
secret never leaves my browser. `castVote` checks a mapping from nullifier to bool: the first
ballot writes it and increments the count, the second reverts. We do not track addresses at
all, deliberately, because the voter is anonymous and every relayed ballot shares one sender
anyway. D1 replays a nullifier and asserts the revert, asserts the same for a ballot past the
roll size, and fuzzes over both.

> *Follow-up.* "Could you generate a second identity and vote again?" Only if the registrar
> puts a second commitment in the tree. The tree is the eligibility boundary, so that is a
> registrar question, not a contract one.
>
> *Trap.* "We keep a mapping of addresses that have voted." Wrong twice: the relayer is the
> sender for every ballot, and tracking voter addresses destroys the anonymity the design
> exists to provide.

**The Election Authority does not like how the vote is going halfway through. Can they stop
the count?**

Not in the way that matters. The tally is contract state and the only function that mutates it
is `castVote`, so every accepted ballot is already counted. Finalization does not compute the
result, it closes the state machine. If the authority refuses to call it, the tally is still
readable and anyone can recompute it from `VoteCast` logs. What the authority can do is cancel,
and only before voting opens; once Voting starts the machine has no path backwards and the
root is frozen. D6 tests that the admin cannot vote, cannot alter a frozen root, cannot stop
the count.

> *Follow-up.* "Can the authority stall forever by never opening voting?" No: transitions are
> permissionless once their timestamp has passed, so any observer can close voting and
> finalize, and the authority is restricted to configuration before registration opens and
> cancellation before voting opens. FR11 is written that way on purpose: an authority-only
> finalization would be a silent veto, because the time gate only stops a transition happening
> earlier than announced, never later.
>
> *Trap.* "AccessControl stops them." That answers a different question. The real reason is
> that the count is not a separate step anyone has to perform.

**I am sitting on your RPC endpoint watching every transaction. What do I learn about how you
voted?**

You see a transaction from the relayer to the forwarder, with calldata containing the proof,
the nullifier, the root and the signal, which is the candidate, in the clear. You see the
tally slot increment and the `VoteCast` log. What you never see is any identifier of the
voter. The secrecy is not encryption; it comes from the proof asserting only that the prover
knows a secret behind some leaf under that root, so the anonymity set is the roll. Two things
we say openly: the choice is public, and the relayer sees it first. So from the chain alone
you get a ballot with no author, and that is the unconditional half of our secrecy claim. The
conditional half is our own operator, which is a deployment question rather than a chain one.

> *Follow-up.* "How large is the anonymity set in your demo?" As large as the roll, which on
> demo day is the room. With a small roll and a live tally, correlating transaction timing
> against tally movement is a realistic deanonymization path, so we state the expected set
> size beside the claim, enrol the whole room, and pre-cast a batch of ballots before the live
> ones. A demonstration with three voters cannot show anonymity, and showing it badly is worse
> than not showing it.
>
> *Trap.* "The vote is encrypted." Flatly wrong here, and it is the most common error on this
> design. Anonymity is not confidentiality.

**Your registrar is corrupt and enrols two hundred voters who do not exist. What stops that?**

Nothing stops it, and we do not claim to detect it either. Sybil resistance at the registrar
and roll correctness are both explicit non-guarantees. Registration is voluntary, so nobody
independently knows how many people should have registered, and the registrar is the party
that chooses the number it publishes. What we get is narrower and worth stating precisely.
`VoterRegistry` stores the root, the roll size and the leaf-set CID before any ballot exists,
and `castVote` refuses a ballot once spent nullifiers reach that roll size, so the capacity to
stuff is fixed and enforced in advance and the number is public forever. A hosted system lets
rows be added at the close of poll, when the operator already knows the gap it needs to close.
That is a real difference and it is not detection.

> *Follow-up.* "So what would catch it?" Nothing in this design. The genuine remedy is to stop
> trusting one registrar: split the role across parties who each hold a share of the enrolment,
> or require candidate-appointed observers to co-sign the leaf set before the root is frozen.
> We record that as future work rather than claim it. Preventing it at source needs identity
> the chain can check, which for real use means Aadhaar-class verification.
>
> *Trap.* "The Merkle root prevents fake voters", and equally "the published roll size makes
> stuffing detectable". The root commits to whatever leaves the registrar chose, garbage leaves
> produce perfectly valid proofs, and the roll size is a number that same registrar typed.

**Your relayer is malicious. Give me the complete list of what it can do to me.**

Three things, and the first two combine into one attack, so give them as one. It reads my
candidate choice, because the payload it forwards is in the clear, and it decides whether to
forward, so it can drop only the ballots for the candidate it dislikes. That is
result-altering rather than merely annoying, and it is invisible, because turnout below roll
size is the normal state of every election. Third, it sees the address the request arrives
from. What it cannot do: forge a ballot, because it holds no secret in the tree; modify mine,
because the choice is the signal bound into the proof; or replay it, because the nullifier is
spent on first inclusion. We bound the censorship attack and do not remove it. The relayer
returns a signed receipt for every ballot it accepts, so a drop becomes a signed promise it
did not keep, and the booth warns and offers direct submission if no transaction hash appears
before a deadline.

> *Follow-up.* "Direct submission fixes it, then." Not for the voters we designed for. E2 sets
> the voter's holding to zero and E3 tests people who have never used a wallet, so the bypass
> is available to everyone except the target population. Removing the attack rather than
> bounding it needs encrypted ballots or several independent relayers, and we build neither.
>
> *Trap.* "The relayer cannot see anything, it is zero-knowledge." It has to read the calldata
> to sponsor it.

**I capture a ballot transaction off the wire. What can I do with it?**

Three surfaces. Same election: resubmit it and it reverts, because the nullifier is recorded.
Different election: the nullifier is scoped, so the same secret yields a different value there,
and the proof was built against that election's root anyway. The meta-transaction layer: the
forward request is EIP-712 signed with a nonce and a deadline over the target and calldata, so
the forwarder rejects a resubmission or an alteration, though the proof rather than the
signature is what makes an altered ballot worthless. The net result is that a captured ballot
buys you the right to pay gas for a vote that was going to land anyway, and our relayer's
transaction is the one that reverts.

> *Follow-up.* "Danger if two elections share a voter root?" They can share a root safely,
> because the scope is the election id. What we must not do is reuse a scope across two
> elections, and we will assert that in a test.
>
> *Trap.* "The signature prevents replay." Incomplete, and it credits the wrong mechanism
> twice. The signature only makes the forwarder reject an altered or resubmitted request; the
> proof is what makes an altered ballot unusable anywhere, because the candidate choice is a
> public input bound into it, and the nullifier is what stops the same voter voting twice from
> a fresh address with a fresh signature.

**I want to bankrupt your relayer before lunch. How, and what stops me?**

The cheap attack is flooding it with ballots that will revert so it pays gas for failures.
Before sponsoring, the relayer verifies the Groth16 proof off-chain, which is milliseconds of
CPU and needs no chain access, checks the nullifier, and simulates the call, so garbage costs
us CPU and not gas. Then a rate limit, one sponsorship per nullifier, and a hard daily gas cap
so the worst case is a number we chose in advance. Once off-chain verification is in place,
lifetime exposure is bounded by the roll size, because a valid proof needs an enrolled identity
and each identity yields one usable nullifier.

> *Follow-up.* "Rate limiting by IP, against deliberately anonymous voters?" Crude and wrong in
> both directions: it blocks a campus behind one NAT and a Tor user walks around it. The gas
> cap is the real control and per-nullifier limiting is the sound one.
>
> *Trap.* "BullMQ and rate limiting handle it." A durable queue controls throughput, not spend.
> Without the off-chain proof check, fresh random nullifiers with junk proofs pass the nullifier
> pre-check and we pay about 250k gas each for on-chain reverts, which is why the proof check
> comes before the spend rather than after it.

**Your ballot is sitting unconfirmed in the mempool. What is the worst a searcher can do?**

Copy the signed forwarder request and submit it themselves, paying the gas. My ballot lands
exactly as intended and our relayer's transaction then reverts on the spent nullifier, so the
cost lands on us. That is griefing, not an integrity break. They cannot change my candidate,
because the choice is bound into the proof, and they cannot spend my nullifier ahead of me,
because that needs my secret. The real leak is informational: the choice is visible before
inclusion.

> *Follow-up.* "Can a block producer censor selectively by content?" Yes. The choice is in the
> clear, so censorship by content is possible and we cannot prevent it on Amoy. Encrypted
> ballots with homomorphic tallying would remove it, and that is out of scope; it is a direct
> consequence of a plaintext signal and we should name it.
>
> *Trap.* "No front-running because the transaction is signed." A signature prevents tampering,
> not reordering, and does nothing to hide content from whoever builds the block.

**Your deployer's private key is on a laptop stolen the night before the election. What is the
blast radius?**

Contract code is safe. Elections are EIP-1167 clones of a fixed implementation with no proxy
admin and no upgrade path, so nobody can swap the logic under a running election. What the key
holds is the admin role on the factory, so an attacker can create elections, grant themselves
roles on those, and publish convincing fakes. That is the real damage: a voter pointed at the
wrong contract address is fully compromised whatever the cryptography says. Inside an election
that has already opened voting they can do very little, because the root is frozen and they
cannot cast a ballot or stop the count.

> *Follow-up.* "Could they repoint the trusted forwarder on a live election?" It should not be
> settable after deployment. The forwarder is set once in the implementation and shared by
> every clone; a mutable forwarder would hand an attacker exactly the power we claim the
> authority does not have, so it belongs in the D6 containment tests.
>
> *Trap.* "The contracts are immutable, so a stolen key does nothing." Immutability protects
> the code, not the role assignments, and phishing voters onto a fake election address defeats
> every on-chain guarantee at once.

### The skeptic's questions

**In one sentence: what does putting this on a blockchain buy you that a well-run server with a
signed, public, append-only log would not?**

A signed log still has an operator who decides what goes into it, and can show two different
logs to two different readers. The chain changes three things. Inclusion and ordering are
agreed by parties who do not work for us, so we cannot quietly drop a ballot. The counting rule
is contract code that runs the same way for everyone, so there is no separate counting step
anyone could perform differently. And the acceptance rule, one valid proof and one unused
nullifier, is enforced when the ballot is written rather than checked afterwards by an auditor
you also have to trust.

> *Follow-up.* "Use a certificate-transparency style log with independent witnesses." Fair
> alternative, and it gives tamper evidence. What it does not give is execution: someone still
> has to apply the eligibility rule and add up the totals. A chain merges the log and the
> executor into one thing, and a witness network is something we would have to recruit.
>
> *Trap.* "Blockchain is immutable, so records cannot be tampered with." A Merkle-signed
> append-only log is also tamper evident. An immutable record of a wrong tally is still a wrong
> tally.

**Half your architecture diagram is a Fastify server, PostgreSQL, Redis and a pinning service.
Convince me this is not a database with a blockchain bolted on for marks.**

The backend does four jobs and none is a source of truth. The registrar's only output is a root
that goes on-chain and freezes. The relayer pays gas and can neither forge, alter nor replay a
ballot. The indexer is a cache of chain events rebuildable from genesis, which we demonstrate.
The pinning service stores a file whose hash is already on-chain. The audit dashboard talks to
an RPC provider and never to our server, and step 5 of the demo kills the backend while the
dashboard still recomputes the tally. If any of those outputs were load-bearing, that step
would fail. Two places do carry real trust and I would rather raise them than be shown them:
the registrar controls the franchise, and the relayer reads the choice and decides whether to
carry it, which we bound with a signed receipt rather than remove.

> *Follow-up.* "You still read the chain through Alchemy." For convenience, and an auditor can
> point the same dashboard at any endpoint or their own node, so a lying RPC is detectable
> against consensus. A lying application server is not.
>
> *Trap.* "The backend is only there for speed." False, and it invites the examiner to point at
> the registrar and win. So does "the relayer only pays gas and can be bypassed", because the
> bypass needs gas E2 says the voter does not hold. The honest split is that the registrar
> carries real trust over the franchise, the relayer carries a censorship power we bound and do
> not remove, and only the indexer carries none.

**Your registrar decides who gets a leaf. You have not removed the trusted party, you have
renamed it.**

Partly yes, and the report says so in those terms: DVote removes the operator from the ballot
box and from the count, and leaves one party in control of the franchise. Deciding that a
particular human is entitled to vote is not a problem cryptography solves. What changed is the
scope. As the registrar it decides the roll and nothing else: it is not on the vote path at
all, because the booth builds its own authentication path; it cannot add a voter after the
root freezes, it cannot drop a ballot, and it cannot touch the count. A conventional operator
holds all four powers at once, so we went from four to one. The remaining one is fixed and
published in advance rather than audited afterwards, which is a smaller claim than auditable.

> *Follow-up.* "Somebody still has to check the published roll against real people, which is an
> audit, which your own introduction criticises." Correct, and that is the residual trust, and
> nobody can complete that check, because with voluntary registration there is no independent
> figure to check against. The difference is in the timing: the roll is frozen and published
> before voting opens, so the number of ballots that can ever exist is chosen before anyone
> knows which way the vote is going, rather than adjusted at the close of poll.
>
> *Trap.* "We could run the registrar as a multisig or a DAO." Splitting the role is the right
> direction and it is in our future work, either as shares of the enrolment held by several
> parties or as candidate-appointed observers co-signing the leaf set before the root freezes.
> What we must not do is claim we built it, and the next question is how those parties verify
> identity, which has the same problem one layer up.

**Your tally updates on-chain while voting is open. A sealed ballot box does not. Explain how
that is an improvement.**

It is not an improvement. It is worse on that axis and we list it as a non-guarantee. Votes are
counted as they arrive, so a partial result is visible and can influence late voters. Hiding it
needs homomorphic tallying, where the contract adds ciphertexts and the total is decrypted
after the close, or commit-reveal, where ballots go in encrypted and are opened later. Both are
projects of their own, and commit-reveal in particular adds a second transaction per voter and
a failure mode where voters never return to reveal, which breaks our usability targets.

> *Follow-up.* "Commit-reveal is not that hard. Why not in eight weeks?" It lands on top of
> Phase 2, which is already the riskiest phase because browser proving and the relayer arrive
> together, and the freeze is 8 November. We preferred one system that works to two that half
> work.
>
> *Trap.* "It does not matter because ballots are anonymous." Anonymity of individual ballots
> and secrecy of the aggregate are different properties.

**Can I sell my vote in your system? Yes or no, then the reasoning.**

Yes, and we do not defend against it. The identity secret lives on your device: you can hand it
to a buyer who then votes as you, or you can vote and show the nullifier and the transaction,
which proves what you chose. The nullifier guarantees one ballot, not an uncoerced one. Worse
than a screenshot, the buyer can verify delivery on-chain without ever meeting you again, so on
this axis we are worse than the hosted system and worse than paper. Real resistance means
MACI-style key rotation, which needs a coordinator and a much larger circuit budget.

> *Follow-up.* "Then this cannot be used for a real election. What is it for?" Elections that
> are already remote and already run by one person on one machine: a campus body, a society, a
> shareholders' vote. The baseline there is a form on somebody's laptop, and against that
> baseline we are strictly better on verifiability.
>
> *Trap.* "It is zero-knowledge, so nobody can prove how they voted." Zero-knowledge hides the
> link from third parties, not from the voter, who knows their own secret. Receipt-freeness is
> a strictly stronger property we do not have.

**Who actually runs the nodes your election depends on, and why should a voter trust them more
than the university IT department?**

On Amoy, a validator set we do not control and did not choose, which is the point: they have no
stake in our election. But I would not pretend it is the same as a large mainnet. Amoy is a
testnet, the validator set is small, and a reorg or a stall would hurt us. We picked it because
Sepolia reaches end-of-life on 30 September 2026, seven weeks before the demo, and building a
graded November demo on a network scheduled to die in September is the larger risk. A production
deployment is a deliberate decision about whose security you are buying.

> *Follow-up.* "So your integrity guarantee is only as strong as Amoy's validators. What happens
> on a reorg?" That is D9: we simulate a reorg on Anvil and check the indexer heals rather than
> serving a stale tally. A deep reorg on a small validator set is a real risk and we name it
> rather than claim a finality we do not have.
>
> *Trap.* "Blockchains are decentralized, so no one controls it." Wrong for a testnet
> specifically, where validator sets are small and often permissioned.

**Your registrar publishes a root and then publishes a leaf set that does not match it, or
publishes nothing. What happens, and who finds out?**

Two cases. A mismatching leaf set is caught immediately by anyone who recomputes the root,
because the on-chain root is the commitment and it is frozen. The harder case is withholding:
publish the root, publish nothing else, or unpin the file later. Since the booth builds its
authentication path from that file, withholding it stops the election rather than only
stopping the audit, which is why a non-empty CID is a precondition for entering the Voting
phase. Unpinning after publication is the case we cannot fix in this design: the count stays
auditable, eligibility becomes unauditable, and voters who have not already fetched the file
cannot build a proof. What reduces it is that the CID is on-chain, so any observer who fetched
the file at publication time can pin it and prove it is the published one.

> *Follow-up.* "Then why not put the leaves on-chain, or refuse the root until the data is
> published?" Putting leaves on-chain is precisely the linear gas cost the design exists to
> avoid. We do require the CID at publication, but a CID proves what the data is, not that
> anyone can still get it. A genuine fix is a data availability layer, which is out of scope.
>
> *Trap.* "It is on IPFS, so it is permanent and decentralized." IPFS is content addressed, not
> persistent. If the only party paying to pin is the registrar, availability of the roll is
> exactly as centralized as the registrar.

**Would an actual election commission deploy this? Straight answer.**

No, and I would not argue otherwise. Three blockers. It is not coercion resistant, which rules
out remote voting wherever a voter can be watched, and that is everywhere. Eligibility rests on
one registrar doing an off-chain identity check, and a national roll would need something like
Aadhaar or DigiLocker plus a dispute process. And it runs on a public testnet with a small
validator set, which is a convenience for a term project and not a security argument. Where it
fits is elections that are already remote and already administered by one person.

> *Follow-up.* "Name the one change that moves it closest to deployable." Coercion resistance,
> through MACI-style key rotation, because it is the limitation that rules out the entire remote
> voting case. Everything else is engineering effort or policy; that one is a missing property.
>
> *Trap.* "Yes, with a few small changes." None of the three blockers is small, and the answer
> invites the examiner to enumerate the gaps out loud.

### Evaluation methodology

**Twenty-nine parameters. If I let you keep one, which tells me whether the project
succeeded, and what does a bad result look like?**

C1, gas against voter-roll size at rolls of ten up to a hundred thousand, because it is the
contrast the whole architecture is about: registration flat against an on-chain enrolment
baseline that rises linearly, tier 2's ballot rising logarithmically with the path in calldata,
tier 3's ballot flat and higher. A bad result on the tier 3 line is any upward slope, which
would mean something in our path touches per-voter state. Be honest about the half that cannot
fail: the registration line is flat by construction, so its job is to catch an accidental O(n)
term rather than to discover anything. The parameters that can genuinely come out against us
are C2, proving time against tree depth, and C5, the off-chain cost, because both run on
devices we do not control.

> *Follow-up.* "Flat from ten to a hundred thousand. Do you claim it holds at ten million?" No.
> We measure four decades and state that extrapolation rests on the argument that the on-chain
> write is one storage slot regardless of n, plus a tree-depth term C2 measures separately. The
> off-chain side is linear and C5 measures it: registrar tree-build time, leaf-set size and the
> time to rebuild the tree and recompute the root in a browser, at the same roll sizes.
>
> *Trap.* "All of them matter", or naming a security property like D1, which is a unit test with
> a binary outcome. Also avoid selling the flat line as a cost win: tier 3 is expected to cost
> more per ballot than tier 2 at every roll size we can measure, and that is the price of
> anonymity rather than a saving.

**B1 says 95th percentile under ten seconds. Most people report an average. Why the tail?**

Because a voter experiences their own wait, not the mean. Confirmation latency is right-skewed:
most transactions land in one or two blocks and a small fraction wait on a repriced mempool or
a slow RPC. A mean of four seconds can hide one voter in twenty waiting forty seconds, and that
voter is the one who decides the site is broken. We report p50 alongside p95 so the shape is
visible.

> *Follow-up.* "Why not p99?" It needs a few hundred samples to mean anything and the faucet
> budget will not fund that on Amoy. We report the percentile our sample size supports and state
> the size.
>
> *Trap.* "The average is distorted by outliers we should discard." Those slow runs are not
> measurement errors, they are real voters waiting.

**E2's target is the word "zero". That is a design property. What experiment could ever return
something else?**

That is a fair hit, and as written E2 is a property rather than a measurement. The test is:
create a fresh wallet with a zero balance, do not fund it, complete a ballot end to end, and
assert the balance is still zero and the ballot is on-chain. It can fail three ways: a step
needs a native balance we did not anticipate, the relayer rejects and the interface quietly
falls back to asking the user to pay, or registration costs gas even though voting does not. So
the number reported is the POL a voter actually needed, across all ten E3 participants.

> *Follow-up.* "Where does the cost go?" To the relayer, as A2. Zero for the voter does not mean
> free; it means the cost moved to a named party running a capped daily budget, and that party is
> a liveness dependency.
>
> *Trap.* "It is zero because we use meta-transactions." That assumes the conclusion. The
> parameter exists to catch the case where the implementation silently breaks the property.

**Your methodology says at least thirty repetitions. Where does thirty come from, and is it
enough for a 95th percentile?**

Thirty is the usual rule of thumb for a stable median, and it is what the faucet budget allows
on Amoy. It is not enough for a tight p95: with thirty samples p95 is essentially the
second-worst observation and its confidence interval runs from roughly the 85th to the 99th
percentile of the true distribution. So we report p95 with the order statistic named, and we
raise n wherever sampling is free, since gas is deterministic and Anvil throughput and proving
time cost nothing. The thirty constraint binds only on Amoy latency.

> *Follow-up.* "Which numbers are the n equals thirty ones?" B1 end-to-end latency and B5
> indexer lag on Amoy, which are the only quantities that need a public network at all.
> Everything else is deterministic or local and runs higher.
>
> *Trap.* Citing the central limit theorem. It describes the sampling distribution of the mean,
> not of a percentile.

**You run the latency benchmark on Tuesday and Friday and get different numbers. What did you
record that lets you say whether your system changed or the world did?**

With every run: the commit SHA, the deployed contract addresses, the gas price set and the base
fee observed, start and end block numbers, the RPC provider, the client device and browser, the
network path, and the wall-clock timestamp. Gas price and base fee are the big confounders on
Amoy, since underpricing means slow inclusion for reasons unrelated to our contract. If two runs
differ, the SHA is identical and the base fee is comparable, we have a network effect and we
report it as one.

> *Follow-up.* "What is immune to all of that?" Gas. It is deterministic given the bytecode and
> the inputs, so A1, C1 and C4 are reproducible from a commit SHA alone. That is why gas carries
> the central claim and latency does not.
>
> *Trap.* Running it both days and taking the better number, or averaging across days. The first
> selects on the outcome and the second pools two populations.

**Your gas comes from a local simulator, your throughput from Anvil, and your latency from Amoy.
Justify putting those in one report.**

They are three different kinds of quantity. Gas is a property of the EVM and the bytecode, so
the same call costs identical gas on Anvil and on Amoy, which makes local measurement exact
rather than a shortcut. Anvil throughput is not an Amoy number and we do not present it as one:
it measures our own stack's ceiling, the relayer and the queue, with network variance removed,
which is how it locates our bottleneck. Latency is intrinsically a network property. Every table
states its environment in the caption.

> *Follow-up.* "Then what is your honest statement about throughput on Amoy?" Bounded above by
> block space divided by gas per ballot, which we can compute but did not measure under load,
> because funding two hundred ballots from faucets is not possible. We give the Anvil ceiling and
> the arithmetic bound as two separate statements.
>
> *Trap.* Saying Anvil results "approximate" real-network performance. Anvil mines on demand with
> no peers, no mempool contention and no fee market.

**A2 claims under fifty paise per ballot. On a testnet the token is free. What exactly are you
claiming?**

It is a projection, not a measurement, and the report should label it as one. What we measure is
gas, which is deterministic. Turning gas into rupees needs two prices we do not control: a gas
price in gwei and a POL to INR rate. So gas is the primary number, and underneath it we give a
small table of cost across a range of gas prices at a stated token price on a stated date, so a
reader can substitute their own assumptions. A single rupee figure with no date and no gas-price
assumption is not a result.

> *Follow-up.* "What is the honest headline cost result?" Gas per ballot, which is measured, and
> then A3: that one gas figure priced under Ethereum mainnet, Polygon PoS mainnet and Amoy
> conditions, reported as a band across gas prices. The band survives the price assumptions in a
> way a single rupee figure does not, and it is a comparison of fee markets rather than a claim
> about the design.
>
> *Trap.* Quoting one rupee figure as measured. It buries two volatile assumptions inside a
> number that reads as empirical.

**C1 measures gas at roll sizes from ten to a hundred thousand, but you store one 32-byte root
whatever n is. What can that experiment find, and is it capable of showing you are wrong?**

You are right that the registration write is flat by construction, and saying so is the honest
answer. It can still fail in four places. Registration: if our path ever writes per-voter state,
gas grows and C1 catches it. Tree depth: Semaphore fixes a depth per circuit, so a larger roll
can force a deeper circuit, which changes calldata and the verification key selected. Our own
code: an unnoticed loop or array push in `castVote` shows as a slope. And the cost did not
vanish, it moved to the registrar and the client, which is what C2 measures. The honest claim is
narrower than "gas is constant".

> *Follow-up.* "What do you do if it is not flat on 10 November?" Bisect the graph by call,
> snapshotting registration, root publication and `castVote` separately across roll sizes. If
> `castVote` grows, that is our bug and a day's work. If registration grows, we wrote per-voter
> state, which is the exact mistake the off-chain tree exists to avoid. If it is genuinely linear
> and unremovable, we report the measured slope and name the cause, because feature freeze is 8
> November and there is time to diagnose but not to redesign.
>
> *Trap.* "The line will be flat because we only store the root." That is the hypothesis
> restated, and it moves the per-voter cost off the graph instead of accounting for where it
> went.

**D3 demonstrates ballot secrecy by showing that no chain data links an address to a ballot. How
do you measure the absence of a link, and how big is the anonymity set?**

You cannot prove a negative, so we define an adversary and run named attacks. The adversary holds
all chain data, our event logs and the published leaf set. Attack one, matching sender addresses
to voters, fails for relayed ballots because the sender is the relayer every time. Attack two,
timing correlation between tally increments and anything the adversary observed off-chain,
partly works at small roll sizes and we say so. Attack three, a voter who bypasses the relayer
links their address by construction. The quantity we report is the anonymity set size, which is
the roll reduced by whatever timing analysis excludes, not a pass mark. Note the scope: D3 is
the chain-only adversary, which is the half of the claim that is unconditional.

> *Follow-up.* "That test excludes the party best placed to break it." Correct, and the honest
> answer is that secrecy against our own operator is conditional rather than proven by D3. The
> relayer learns the candidate choice in every ballot it forwards and the address it arrives
> from, so it holds a choice without an author; the registrar holds an identity without a
> choice. The condition is that those two are not the same party with the same logs, or that
> the voter submits directly. The booth asks the registrar for nothing at vote time, which is
> what makes separating the two deployments sufficient.
>
> *Trap.* Saying ballots are anonymous because the proof is zero-knowledge. Anonymity is a
> property of the whole transaction, and the sender address, the timing and the IP sit outside
> the proof.

**Ten participants, and you want to report over eighty percent unaided completion. What can you
claim from ten people?**

Not a rate. If eight of ten succeed, the 95 percent confidence interval runs roughly from 44 to
97 percent, which cannot support "over 80 percent" as a finding. What ten participants are good
for is surfacing usability defects, and each failure is a concrete fixable thing. So we report a
defect list, the raw count out of ten with the interval stated, and the exact step at which each
failure happened. We also state that they were BITS students, a convenience sample, so we do not
generalize.

> *Follow-up.* "How do you stop the study being biased by the people who built it?" A fixed
> written task, no coaching, recorded time and stopping point, and an observer who did not build
> the frontend. It is still not blind and we say so rather than implying a controlled study.
>
> *Trap.* Reporting eight out of ten as "we achieved 80 percent task success".

## The hard ones

These are the strongest attacks against the design, written as the questions an examiner
would ask. Each is answered either with the mechanism that handles it or with the limitation
we accept, and the shape of every answer is the same: concede in the first sentence, then
give the mechanism.

One rule for this section. Do not be clever and do not hedge. Each of these is a place where
the design has a sharp edge, and conceding a limitation cleanly is scored as understanding,
while defending more than the design actually claims is scored as overclaiming, after which
the examiner doubts the claims that were true.

### 1. The registrar knows the leaves and the relayer receives the ballot

**The question.** "Your registrar built the tree, so it knows which leaf belongs to which
person, and your relayer receives the ballot with the choice in the clear. They are the same
server. Why does that not deanonymize every single voter?"

**Why it bites.** It is the place where correct cryptography is most easily defeated by
plumbing. If the booth had to ask the registrar for an authentication path, that path would
identify the leaf, the registrar knows which institute email the leaf belongs to, and seconds
later the same backend would receive a ballot carrying the candidate choice in the clear from
the same source address. Joining those two requests needs no cryptanalysis, only two log
lines, and it would be visible from the architecture diagram alone.

**The answer.** "The booth does not ask the registrar for anything at vote time. At the close
of registration the registrar publishes the whole leaf set to IPFS, and the content identifier
goes on-chain in the same transaction as the root, so the booth downloads that set, rebuilds
the tree in the browser and derives its own authentication path. The backend is never told
which leaf is voting. What remains is the network address the ballot arrives from, which is a
stated non-guarantee, so secrecy against our own operator is conditional: it holds when the
relayer is run separately from the registrar, or when the voter submits directly. Against the
chain it is unconditional, because no on-chain data links an address or an identity to a
ballot."

> **The design.** Step 4 of the ballot flow builds the path locally. Publication of the leaf
> set serves two purposes, auditor root recomputation and voter path construction, and it also
> keeps a second liveness dependency off the vote path: a registrar that served nothing to one
> named voter would be a silent censor with no bypass, because direct submission bypasses the
> relayer, not the registrar.

### 2. The relayer reads the choice and decides what to forward

**The question.** "Your relayer reads the candidate choice and chooses what to forward. What
stops it dropping only the ballots for the candidate it dislikes, and how would anybody
notice?"

**Why it bites.** Listed separately, reading the choice and choosing what to forward each
look like a mild cost. Together they are result-altering, and invisible, because turnout below
roll size is the normal state of every election. The bypass is unavailable to exactly the
people we designed for: E2 sets the voter's holding to zero and E3 tests people who have never
used a wallet, and the Phase 5 plan pre-funds two or three audience wallets, which concedes
that ordinary voters cannot use it.

**The answer.** "That combination is the strongest attack on our design, and we state it as
one attack rather than as two costs. A relayer that reads the choice and chooses what to
forward can bias the result, and it does not show up in the turnout figure. We bound it and we
do not remove it. The relayer returns a signed receipt for every ballot it accepts, so a
dropped ballot becomes a signed promise it did not keep, and the booth warns the voter and
offers direct submission if no transaction hash appears before a deadline. Removing the attack
needs encrypted ballots or several independent relayers, and we build neither. The one thing
that does hold is that the relayer cannot target a person, only a candidate, because nothing
in the payload says who the voter is."

> **The design.** One attack, stated plainly, with the receipt and the deadline as mitigations
> that bound it. Do not describe direct submission as removing the privacy cost: it trades a
> relayer that sees a choice it cannot attribute from the payload alone for a funded address on
> a permanent public ledger, and the funding trail to that address can be the stronger
> identifier.

### 3. The roll-size bound, and who detects stuffing

**The question.** "Which line of contract code stops accepted ballots outnumbering the roll you
declared? And if your registrar enrols two hundred people who do not exist, who finds out?"

**Why it bites.** Two easy sentences are both wrong. "Accepted ballots cannot outnumber the
roll" does not follow from the cryptography, because a Merkle root does not commit to a leaf
count: the root and the roll size are two independent values written by the same registrar,
and without a check in the contract the statement has no code behind it. And "publishing the
roll size makes stuffing detectable" is close to vacuous, because the registrar picks that
number, registration is voluntary, and nobody independently knows what the true figure was.

**The answer.** "One mechanism and one concession. The bound is enforced in the contract:
`VoterRegistry` stores the roll size beside the root, and `castVote` requires that the count
of spent nullifiers never exceeds it. That is one comparison against a value already in
storage, and it turns an observation into an invariant the contract holds. Detection is the
concession, and we do not claim it, because the quantity any such check compares against is
supplied by the party the check is meant to catch. What we actually get is weaker and worth
saying precisely: the capacity to stuff is fixed and published before any ballot exists, so a
dishonest registrar has to commit to a number before it knows which way the vote is going, and
that number is public forever. A hosted system lets rows be added at the close of poll,
knowing the gap. That is a real difference and it is not detection. Roll correctness is a
stated non-guarantee. The genuine remedy is to stop trusting one registrar: split the role
across parties who each hold a share of the enrolment, or require candidate-appointed
observers to co-sign the leaf set
before the root is frozen. We did not build either, and it is recorded as future work."

> **The design.** The on-chain cap is in `castVote`, its counter write is declared in A1,
> and a non-empty leaf-set CID is a precondition for entering the Voting phase. The honest
> summary of the whole project sits here: DVote removes the operator from the ballot box and
> from the count, and leaves one party in control of the franchise.

### 4. A dropped registration leaves the voter with no evidence

**The question.** "A voter registers, the registrar drops their commitment, and they find out
at vote time when the root is already frozen. What evidence do they have that they ever
registered?"

**Why it bites.** Section 2 levels exactly this charge at the hosted system, in those words: a
deleted voter observes only that the system will not let them in, and the remedy offered is a
support ticket to the party that deleted them. Selective exclusion is also the cheaper attack:
dropping fifty commitments from one hostel is quieter than fabricating two hundred.

**The answer.** "That is the same failure we accuse the hosted system of, and the two answers
to it cost nothing. The registrar signs a receipt over the accepted
commitment and the election id, so an excluded voter holds transferable evidence and can point
at a published leaf set that does not contain it, which turns a support ticket into a public
accusation anyone can check. And the booth already downloads the leaf set to build its path,
so it checks that the voter's own commitment is in that set and warns them if it is not. The
leaf set is published when registration closes and voting opens later, so there is a window in
which that check is useful, and cancellation is available to the authority until voting opens,
so an exclusion found in that window can still be fixed by re-running registration."

> **The design.** Roll correctness is a non-guarantee in its own right, and the receipt and
> the check-your-own-commitment step are part of the registration and ballot flows.

### 5. Groth16 needs a trusted setup

**The question.** "Who ran the trusted setup for the Semaphore circuit you are using, and what
happens if somebody kept the toxic waste?"

**Why it bites.** The entire eligibility guarantee rests on an assumption that is invisible in
the contract code and in the proof itself, and in a project whose subject is security an
unnamed assumption is worse than a named limitation. The requirement belongs to the proof
system and the circuit, not to whoever wrote the circuit, so using somebody else's artifacts
inherits the assumption rather than escaping it.

**The answer.** "The eligibility guarantee rests on the Semaphore circuit's phase-two ceremony,
over the perpetual Powers of Tau, with many independent contributors. We use the published
ceremony artifacts and verify their hashes against the Semaphore repository rather than
running our own ceremony, which we could not do credibly on this schedule. If every
contributor to that ceremony colluded, forged membership proofs would verify and we would not
detect them from the proofs alone. Ballots already cast would not become linkable, because
zero-knowledge does not depend on the setup. That assumption is also part of why the on-chain
ballot cap matters: a forged proof still cannot push the count past a number fixed before any
ballot existed."

> **The design.** The ceremony, the assumption and the artifact hash pinning are named in the
> design section, and the cap in `castVote` is presented as the structural answer to a broken
> setup.

### 6. C1 is flat by construction, and tier 2's ballot line is not flat

**The question.** "What measured result would falsify C1? You write one 32-byte root whether
the tree has ten leaves or a hundred thousand."

**Why it bites.** Two blows from one question. The registration half cannot come out any other
way, so that line is arithmetic rather than an experiment, and it needs a baseline beside it to
mean anything at all. Sharper: a blanket flat prediction does not survive contact with tier 2's
ballot, which carries a log2(n) authentication path in calldata, so at roughly 500 to 600 gas
per level it rises by seven to eight thousand gas from depth 4 to depth 17. Our own Phase 1
snapshot would refute a bare claim that gas does not grow with the electorate.

**The answer.** "Concede the first half: the registration line is flat by construction, and its
real job is to catch an implementation that accidentally introduced an O(n) term, such as
storing commitments on-chain or emitting the leaf array in an event. Its refutation condition is
strict for that reason, exact equality across all five roll sizes. Then take the stronger claim,
which is true and more interesting: tier 2's ballot cost is logarithmic in the roll because the
path travels in calldata, and tier 3's is flat because the path becomes a private witness inside
a proof whose size is fixed at every depth. So the anonymity layer is what removes the
logarithmic factor from the ballot, at a higher constant. C1 is three predictions, not one:
registration flat, the tier 3 ballot flat to within one percent, the tier 2 ballot rising with
log2(n). Beside the registration line sits the on-chain enrolment baseline it is measured
against, one leaf insertion per voter at roughly 22,100 gas, rising linearly; that line comes
either from a throwaway registration contract kept purely as a measurement artifact or from the
per-voter storage cost, and C1 records which of the two produced it."

> **The position.** Say in advance that tier 3 is expected to cost more per ballot in absolute
> terms at every roll size we can measure, so the graph is not read as a cost claim we never
> made. The off-chain side is measured too, as C5: registrar tree-build time, leaf-set size and
> the time to rebuild the tree and recompute the root in a browser are where the cost actually
> went.

### 7. The relayer can be drained with junk proofs

**The question.** "I send you ten thousand ballots with fresh random nullifiers and garbage
proofs from a few hundred addresses. What happens to your relayer's balance?"

**Why it bites.** The obvious defences are not defences. A nullifier pre-check plus rate
limiting plus a capped daily budget leaves every junk ballot passing the nullifier check,
getting sponsored, running the pairing check on-chain and reverting, at roughly 250k gas each.
The daily cap does not save the relayer; it sets the price of shutting down the gasless path on
the morning of the demonstration.

**The answer.** "The defence is cheap and complete: the relayer verifies the Groth16 proof
off-chain before it spends anything. Verification with snarkjs is milliseconds, needs no chain
access, and checks the root, the scope and the signal at the same time. Once that is in place
the relayer's worst-case lifetime exposure is bounded by the roll size, because a valid proof
requires an enrolled identity and each identity yields one usable nullifier per election. That
bound is a genuinely good property and we state it."

> **The design.** Off-chain proof verification comes before sponsorship, with per-nullifier
> rate limiting and the daily cap behind it rather than in front of it.

### 8. A3 prices gas, and does not measure a second network

**The question.** "A cost comparison needs a second network. Sepolia reaches end of life on
30 September and your first working contract is M1 on 11 October, so on which day would a
deployable contract and a live Sepolia both exist?"

**Why it bites.** There is no such day, and it is arithmetic between two sections of our own
report, so there is nothing to argue. The deeper point is worse for any parameter built as a
two-network measurement: gas is a function of the EVM and the bytecode, so an identical suite
consumes identical gas on Sepolia and on Amoy. The only difference is gas price times token
price, and both are worthless testnet tokens, so any rupee figure has to be imported from
mainnet feeds anyway.

**The answer.** "Concede the schedule collision outright: Sepolia is not a deployment target
at all, and no measurement in the plan depends on it. Then take the parameter for what it is.
Gas is identical across EVM chains, so the entire difference between networks is a fee market,
and deploying twice would have measured a fee market rather than a property of the design. A3
is cost per ballot computed from the single A1 gas figure, priced under Ethereum mainnet,
Polygon PoS mainnet and Amoy conditions, reported as a band across gas prices rather than a
single number. We do not call it Layer 1 against Layer 2 either, because Polygon PoS is a
checkpointed sidechain and not a rollup, so what is set side by side is two fee markets over
chains that execute the same bytecode."

> **The position.** A3 is a price model over one measured gas figure, and everything it reports
> is a band. If a live measurement on a second network is wanted in November, it names a
> maintained testnet rather than one with a published shutdown date.

### 9. The anonymity set is the roll, and the demonstration is the oracle

**The question.** "How large is the anonymity set for the first ballot cast in your
demonstration?"

**Why it bites.** One, for the first ballot. Ballot secrecy here is an anonymity-set property,
and it is easy to state the guarantee without that bound attached. Every `VoteCast` carries the
choice in the clear and increments a public counter, so the content of each ballot is public
and only its author is hidden, and the
hiding is worth exactly the number of plausible authors at that moment. An examiner who
watched someone press the button at 14:03 and sees candidate B increment at 14:03 has
deanonymized them using our own demonstration.

**The answer.** "Secrecy here is anonymity within the roll, not secrecy of ballot content, and
we state the guarantee with that bound attached. It degrades with the number of ballots in the
same window, and for the first or the last ballot of a very small election it gives nothing.
In the demonstration we enrol the whole room and pre-cast a batch of ballots before the live
ones, so the live voters are not the only candidates for any tally increment. A demonstration
with three voters cannot show anonymity, and showing it badly is worse than not showing it."

> **The position.** The bound is stated with the guarantee, and the expected set size for the
> demonstration is stated beside it. Keep this separate from the operator condition in item 1:
> one is about how many people could have cast a ballot, the other is about who gets to watch
> the request arrive.

### 10. The identity secret is a bearer credential

**The question.** "I pay a hundred rupees for your identity secret. What exactly have I
bought?"

**Why it bites.** More than "you can prove how you voted" admits. A buyer who obtains the
secret does not merely learn how you voted afterwards: they compute the proof and the
nullifier themselves and cast
the ballot, and because the nullifier is deterministic and there is no key rotation, the real
voter can never cast a competing one. Selling the secret sells the vote irrevocably,
verifiably and remotely, at scale, from one laptop. We chose student body and hostel elections
as the domain, which is exactly where organised pressure and vote buying are easiest to
enforce.

**The answer.** "You have bought the vote, not evidence about it, which is worse than it
sounds. The secret is a bearer credential with nothing binding it to a person, so credential
transfer and organised vote farming are a non-guarantee of their own rather than a footnote
under coercion. Anonymity also costs us the after-the-fact forensic trail that a
centralized system would leave for an investigator, which is one axis where the system we
criticise is better, and we say that rather than hide it. MACI answers exactly this with key
rotation, using a key the coercer does not hold, and it is the top item in our future work."

> **The position.** Coercion resistance and individual verifiability are the same object seen
> from two sides. The scope statement to give: DVote is the right trade where the threat is an
> operator who controls the roll, the box and the count, and the wrong trade where the threat
> is a candidate with cash and a small electorate.

### 11. A lost secret disenfranchises permanently

**The question.** "I registered in October, cleared my browser, and came back to vote in
November. What happens?"

**Why it bites.** Nothing can be done. The secret is gone, the commitment in the frozen tree is
unusable, and re-enrolment would mean changing a root we froze on purpose. Private browsing, a
new phone, a reinstalled browser, storage eviction and a shared lab machine all produce the
same outcome, and registration is deliberately days ahead of voting. E1 to E4 all measure a
clean first run on a single device, which is the run least likely to fail, and that is exactly
why E5 exists.

**The answer.** "This is a genuine gap, not a scope decision we made. The standard fix is one
line of design: derive the identity deterministically from a wallet signature over a fixed
message that includes the election id, which is what Semaphore deployments normally do, so the
secret is reproducible on any device and never has to be stored at rest. That costs us the
assumption that the voter still has their wallet, which is weaker than assuming they still
have the same browser profile. Without it, the cheap mitigation is an exportable recovery
phrase shown at registration, and the honest boundary is that re-registration is possible
while registration is open and impossible after the root freezes."

> **The position.** The recovery story and the re-registration boundary are stated rather than
> left implicit, and returning on a second device is parameter E5, which measures whether a
> voter enrolled in one browser profile can vote from another and what that path costs in steps.

### 12. The go/no-go is conditional on M1, not on the calendar

**The question.** "What is your plan if M1 lands on 18 October instead of 11 October?"

**Why it bites.** A gate anchored to the calendar decides nothing here, because the thing it
decides, whether in-browser proving works on a phone, cannot be assessed until M1 exists, since
Phase 2 is built on tier 2. M1 is due 11 October with seven days of margin, and Phase 1 is not a
prototype: in fourteen days it demands the state machine, the factory with clones, `castVote`
with Merkle verification, a Foundry suite above 80 percent, a TypeScript and Solidity tree
builder agreeing bit for bit, a Fastify service, a schema, an indexer, wallet connect, the
admin console and a ballot screen. A gate that fires on a day when no ZK work has started
evaluates nothing.

**The answer.** "A dated gate would decide nothing, so the gate is conditional: it fires one
week after M1 actually lands, or immediately if M1 has not landed by 18 October, because at
that point the decision is the schedule's rather than the technology's. Behind it sits a second
fallback with a date of its own. Tier 2 is a complete working voting system, not a half-built
tier 3, so the worst case is a demonstration without anonymity rather than no demonstration,
and that decision is taken on 1 November, a week before the freeze, rather than discovered at
the freeze. Server-side proving covers only one of the ways Phase 2 can fail, since it does
nothing for the relayer or the contract-side proof wiring, and it would move the identity
secret onto our server, which is a privacy loss we document rather than ship quietly. The
relayer risk has its own answer: the demonstration can run with direct submission from
pre-funded wallets, which costs us parameter E2 and not the election."

> **On the hours.** If the examiner asks whether eight weeks is realistic, do not claim it is
> free time. The phase budget assumes the hours available alongside other coursework, and the
> feature freeze on 8 November exists partly to absorb examination periods. Do not volunteer a
> split of the work in the room, and do not put one in the report.

### 13. Smaller points, stated rather than defended

| Point | The position |
| :-- | :-- |
| Who is allowed to finalize an election | Permissionless is the design. Every transition whose timestamp has passed is callable by anyone, the authority is restricted to pre-registration configuration and to cancellation before voting opens, and D6 tests an observer finalizing over the authority's objection |
| Crediting the EIP-712 signature with stopping a relayer altering a ballot | The proof stops that, because the signal is a public input. ERC-2771 is not a security boundary here; it is kept for the request deadline, for one code path shared with direct submission, and for an audited implementation, and if A1 comes in over budget, dropping the forwarder is the first saving to take |
| Listing OpenZeppelin `MerkleProof` and Semaphore as if tier 3 upgraded tier 2's tree | They are different trees: keccak over sorted pairs versus Poseidon in a LeanIMT, and a keccak root is not a valid circuit input because it is not constrained below the field modulus. Phase 2 replaces the tree builder and the registry's notion of a root. Verification uses the standalone Semaphore verifier called with our own root, with the tree depth pinned in the contract rather than taken from the caller |
| Extrapolating to ten crore voters at INR 5 crore | Throughput binds long before cost: about 37 ballots a second is roughly a month of exclusive block space. One lakh is the figure to quote; a ten crore figure is not, because it also contradicts the scope set in Section 2 |
| Proving time of roughly one to three seconds | It is an expectation from published desktop benchmarks and reads as a hypothesis, with B2 measuring it. The failure mode that would actually trigger the fallback is a mobile memory ceiling or the artifact download, and both belong in the risk table |
| Whether E4 should include wallet installation | The voting path needs no wallet, because eligibility is the proof and the signing key can be created in the browser. E4 measures the no-wallet path and reports the wallet install separately as the fallback cost |
| "An observer can verify the tally even if every service we operate is lying" | Too broad; narrow it: no privileged access is needed and an auditor can use any provider or their own node. We do not run a light client in the browser, so a reader who trusts nobody has to run a node |
| A relayer accepting a ballot near the close of voting and submitting it after | The ERC-2771 deadline expires before the voting window closes, relayed submission is refused in the last few minutes, and a receipt is shown only once a confirmed transaction hash exists |

### Where each of these lives in the report

If you need the full wording for one of them, this is where to find it. An examiner quoting a
sentence at you that contradicts this table is quoting something other than the submitted
report, and the answer is to give the position below.

| # | The position in the report | Where |
| :-- | :-- | :-- |
| 1 | The ballot booth reconstructs the authentication path from the published leaf set rather than fetching it from the registrar; secrecy against our own operator stated as conditional; one liveness dependency on the vote path, not two | Sections 3, 4, 6 |
| 2 | The relayer reading the choice and refusing to forward stated as one attack, bounded by signed receipts and a client deadline; direct submission described as a trade rather than a privacy improvement | Section 3 |
| 3 | The ballot count capped on-chain against the stored roll size; no detection claim; roll correctness stated as a non-guarantee; a split registrar or observer co-signing recorded as future work | Sections 3, 4 |
| 4 | Signed registration receipt and a check-your-own-commitment step before voting | Sections 3, 4 |
| 5 | The trusted setup named, with the ceremony and the artifact hash pinning | Section 4 |
| 6 | C1 stated as three predictions against an on-chain enrolment baseline, tier 2's ballot line predicted logarithmic, off-chain cost measured as C5 | Sections 4, 5 |
| 7 | The relayer verifies the proof off-chain before sponsoring | Sections 3, 4, 6 |
| 8 | A3 defined as a price model over one gas figure, with no second deployment; Polygon PoS named as a checkpointed sidechain | Section 5 |
| 9 | Ballot secrecy bounded by anonymity set size, with the demonstration sized so the set is not one | Sections 3, 4 |
| 10 | Coercion stated as a non-goal; credential transfer as a non-guarantee of its own; the regression against a hosted system conceded in the domain section | Sections 2, 3 |
| 11 | Identity recovery and the re-registration boundary stated; returning on a second device measured as E5 | Sections 3, 4, 5 |
| 12 | The go/no-go conditional on M1; tier 2 as the second fallback, decided on 1 November; the phase budget stated as hours available alongside other coursework | Section 6 |
| 13 | Permissionless transitions throughout; ERC-2771 credited correctly; tier 2 and tier 3 trees described as a replacement; proving time written as a hypothesis; E4 measuring the no-wallet path | Sections 3, 4, 5, 6 |

## Cheat sheet

**Contracts.** `ElectionFactory` (EIP-1167 clones, also the registry of genuine elections),
`Election` (lifecycle, roster, spent nullifiers, ballot counter, tallies), `VoterRegistry` (root,
roll size, leaf set CID per election), `TallyLib` (counting rules, plurality first),
`VoteForwarder` (OpenZeppelin `ERC2771Forwarder`). `castVote` refuses a ballot once the count of
spent nullifiers reaches the roll size stored beside the root.

**Lifecycle.** Created, Registration, Voting, Tallying, Finalized, plus Cancelled reachable only
from Created or Registration and only before voting opens. Every transition is gated on
`block.timestamp` and needs an explicit call, and no transition leads backwards.

**Events.** `ElectionCreated`, `VoterRootPublished`, `VoteCast`, `Finalized`. These four are what
the audit dashboard replays.

**Evaluation parameter families.** A1 to A5 cost, B1 to B5 performance, C1 to C5 scalability, D1
to D9 security and correctness, E1 to E5 usability. **C1 is gas against voter-roll size at rolls of
10, 10^2, 10^3, 10^4, 10^5, and it makes three predictions: registration flat, the tier 3 ballot
flat to within one percent, the tier 2 ballot rising with log2(n) because the path travels in
calldata. The line it is measured against is on-chain enrolment, one leaf insertion per voter at
roughly 22,100 gas, which rises linearly. Say before the graph that tier 3 is expected to cost
more per ballot in absolute terms at every roll size we can measure. The registration line is flat
by construction, so the parameters that can genuinely fail are C2, proving time against tree
depth, and C5, the off-chain cost.**

| Number | Value |
| :-- | :-- |
| `castVote` gas budget (A1) | under 400,000, of which the Groth16 pairing check is about 200k to 250k, plus the ballot counter's warm write for the roll-size check |
| Groth16 proof | 8 field elements, 256 bytes, constant at every tree depth |
| Cost per ballot | about 0.009 POL, target under INR 0.50 (A2) |
| Cold storage write | about 20,000 gas |
| Merkle depth | 4 for a roll of 10, 17 for a roll of 100,000 |
| Tally latency targets | B1 p95 under 10 s end to end, B2 p95 under 5 s proving on a mid-range phone, B5 indexer lag under 3 s |
| Repetitions | n at least 30 per data point, report median and p95 |
| Faucet reality | about 0.1 POL per claim per day, so a 200-ballot load run on Amoy is not fundable |
| Usability targets | E1 at most 4 steps, E2 zero POL held, E3 over 80 percent of 10 users unaided, E4 under 5 minutes, E5 a working path for a voter returning on a second device |
| Clone saving (A5) | target above 90 percent against a fresh deployment |

| Date | What |
| :-- | :-- |
| 25/26 Sep 2026 | Evaluation 1: report, presentation, questions. No code required |
| 28 Sep to 11 Oct | Phase 1, M1: tier 2 working end to end locally, first gas snapshot committed |
| 12 to 25 Oct | Phase 2, M2: tier 3, anonymous and gasless on Amoy |
| **M1 plus one week** | **Go/no-go on in-browser proving, conditional on M1 rather than on the calendar: one week after M1 actually lands, or immediately if M1 has not landed by 18 October. Fallback is server-side proving, with the privacy loss documented** |
| 26 Oct to 8 Nov | Phase 3, M3: feature freeze on 8 November |
| **1 Nov** | **Second gate, a week before the freeze: if an anonymous ballot has not been cast on Amoy by then, tier 2 is what we demonstrate. Tier 2 is a complete voting system on its own, so the worst case is a demonstration without anonymity** |
| 9 to 15 Nov | Phase 4: the measurement campaign, C1 graph built first |
| 16 to 19 Nov | Phase 5: three timed rehearsals, pre-funded wallets, recorded fallback video |
| 20/21 Nov 2026 | Evaluation 2: live demo, complete code, final report |
| **30 Sep 2026** | **Ethereum Sepolia end-of-life, seven weeks before the demo, which is why the primary testbed is Polygon Amoy, chain id 80002 and why nothing in the plan deploys to Sepolia at all** |

**Testbeds.** Anvil local for gas and throughput (deterministic, free). Polygon Amoy, chain id
80002, for latency and the live demo. Gas is identical across EVM chains, so A3 is a price model
over one gas figure rather than a second measurement campaign on another network.

**Schedule honesty.** The phase budget assumes the hours available alongside other coursework,
and the feature freeze on 8 November exists partly to absorb examination periods. Say that if
asked; do not claim the eight weeks are free time, and do not offer a split of the work.

**Six sentences worth having word-perfect.**

1. "The membership tree is built off-chain and only its 32-byte root is written on-chain, so
   registering a roll of ten and a roll of a hundred thousand is the same single storage write."
2. "The nullifier is a hash of the voter's identity secret and the election id: deterministic, so
   a second ballot reverts; one-way, so it says nothing about the voter; scoped, so two elections
   cannot be linked."
3. "The proof says I know a secret whose commitment is one of the leaves under root R, and it does
   not say which leaf, so the anonymity set is the roll, which is as small as the roll is."
4. "Against the chain, ballot secrecy is unconditional; against our own operator it is conditional
   on the relayer being run separately from the registrar, or on the voter submitting directly."
5. "The audit dashboard reads the chain through a public RPC endpoint and never our backend, which
   is why we can switch the backend off on stage and the tally still verifies."
6. "DVote removes the operator from the ballot box and from the count, and leaves one party in
   control of the franchise."

And the one about cost, which is a sentence rather than a slogan: gas is constant per operation in
the size of the electorate; total gas is linear in ballots cast, the registrar's work is linear in
the roll, and proving time depends on tree depth.

**Five things never to say.** "The vote is encrypted" (the choice is public). "Ballot secrecy",
unqualified (say what it holds against and under what condition). "Publishing the roll size makes
stuffing detectable" (the registrar chose that number, and with voluntary registration nobody knows
the true one). "It is immutable, so it cannot be tampered with" (hash linking gives tamper
evidence; consensus gives tamper resistance). "It is decentralized because it is on a blockchain"
(name the six centralized pieces: registrar, relayer, authority, RPC provider, pinning service,
frontend host).

## Glossary

| Term | One line |
| :-- | :-- |
| **Anonymity set** | The set of people who could plausibly have cast a given ballot; here, the roll, reduced by timing and metadata leaks |
| **Anvil** | Foundry's local EVM node: instant, free, deterministic, no peers or fee market |
| **Authentication path** | The sibling hashes and left/right indices from a leaf to the Merkle root; private witness data in our circuit, derived in the browser from the published leaf set rather than fetched from the registrar |
| **BullMQ** | Redis-backed job queue used by the relayer so a ballot is not lost if a worker dies |
| **Bor / Heimdall** | Polygon PoS's two layers: Bor produces EVM blocks, Heimdall is the Tendermint-based validator and checkpoint layer |
| **Calldata** | The input bytes of a transaction, charged per byte, where the proof and public signals travel |
| **CID** | IPFS content identifier: a hash of a file, so it proves what the data is but not that anyone still serves it |
| **Commitment** | A hash published in place of a secret: hiding (reveals nothing) and binding (cannot be reopened differently) |
| **EIP-712** | Typed structured data signing, used for the forwarding request the voter signs |
| **EIP-1167** | Minimal proxy standard: a few dozen bytes delegating every call to one shared implementation |
| **EIP-1559** | Fee mechanism where the base fee is burned and only the priority tip reaches the validator |
| **ERC-2771** | Meta-transaction standard separating who pays gas from who is speaking, via a trusted forwarder and `_msgSender()` |
| **EVM** | The deterministic stack machine every node re-executes contract bytecode on |
| **Field element** | A number modulo the curve's field prime, about 2^254 for BN254; the unit a circuit computes in |
| **Finality** | The point after which a block will not be reorganized out; inclusion is not finality |
| **Foundry** | Solidity-native toolchain (forge, cast, anvil); `forge snapshot` emits per-function gas |
| **Gas** | The unit of EVM work; fee equals gas used times gas price |
| **Groth16** | The zk-SNARK scheme Semaphore v4 uses: constant proof size, one pairing check to verify, needs a circuit-specific trusted setup |
| **Identity commitment** | The Poseidon hash of a voter's identity value, published as a leaf in the tree |
| **Identity secret** | The random value held on the voter's device; the only thing that authenticates a voter |
| **Indexer** | The service that tails chain events into PostgreSQL for fast dashboard reads; a cache, never a source of truth |
| **Leaf set** | The full list of identity commitments, published to IPFS at the close of registration with its CID on-chain beside the root; auditors recompute the root from it and the booth rebuilds the tree from it to derive its own authentication path |
| **LeanIMT** | The incremental Merkle tree Semaphore v4 uses, with dynamic depth, over Poseidon |
| **MACI** | Minimal Anti-Collusion Infrastructure: coercion resistance through key rotation, with a coordinator; out of scope here |
| **Meta-transaction** | A call the user signs but somebody else submits and pays for |
| **Merkle root** | The single 32-byte value at the top of the tree; the commitment to the whole voter roll |
| **Nullifier** | `H(identitySecret, electionId)`; one number per voter per election that makes a second ballot revert without identifying anyone |
| **Pairing check** | The elliptic-curve operation that verifies a Groth16 proof, run through EVM precompiles at roughly 200k gas |
| **POL** | The native token of Polygon PoS, used to pay gas on Amoy |
| **Poseidon** | A hash function designed to be cheap inside a zk circuit, used for commitments, the tree and the nullifier |
| **Powers of Tau** | The universal phase-one ceremony a Groth16 circuit's phase-two setup builds on |
| **Precompile** | A built-in contract at a fixed address implementing an expensive primitive natively, such as the pairing check |
| **Public input / private witness** | Circuit inputs everyone sees versus inputs only the prover sees |
| **Receipts root** | The commitment to transaction receipts in the block header, which is why event logs are as trustworthy as state |
| **Relayer** | Our service that pays gas for a voter's ballot; the only liveness trust assumption on the vote path, and the party that can censor by content |
| **Reorg** | A chain reorganization that replaces recently included blocks, undoing their state changes |
| **Roll size** | The enrolment figure the registrar publishes beside the root; `castVote` will not accept more ballots than this, and nothing proves the figure honest |
| **Rollup** | An L2 that posts its data to L1 and inherits its security, unlike a sidechain such as Polygon PoS |
| **Scope** | The election identifier mixed into the nullifier so ballots cannot be linked across elections |
| **Semaphore v4** | The audited anonymous-group-membership protocol supplying our circuit, verifier and nullifier scheme |
| **Signal** | The public input carrying the candidate choice, bound into the proof so it cannot be altered in transit |
| **Slither** | Static analyser for Solidity; findings by severity are reported as parameter D7 |
| **Soundness** | The property that a prover without a valid witness cannot produce an accepted proof |
| **SSTORE** | The EVM opcode that writes a storage slot; about 20,000 gas when the slot was empty |
| **Sybil resistance** | Resistance to one person enrolling as many; explicitly not guaranteed at our registrar |
| **Trusted forwarder** | The one contract address `Election` will accept an appended sender from |
| **Trusted setup** | The circuit-specific ceremony Groth16 needs; leftover randomness would allow forged proofs |
| **Zero-knowledge** | The property that a proof reveals nothing beyond the truth of its statement |
| **zk-SNARK** | A succinct non-interactive proof: short, constant-time to verify, revealing nothing about the witness |
