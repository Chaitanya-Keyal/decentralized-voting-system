# Viva Preparation: DVote

This is the study guide for the Evaluation 1 viva (25/26 September 2026). The examiners have
the report and will not ask us to read it out. They will ask how the mechanisms work, where
the cost goes, and what the design does not do. Nothing is built yet, so every number in the
report is a target. Say so clearly. It is the right answer, not an excuse.

Seven claims matter most, and examiners will push hardest on them, because each is easy to
get wrong with a careless sentence. They are in "The seven claims to state exactly". Use that
wording in the room.

How to use this guide in the three days before:

- **Day 1.** Read "The seven claims to state exactly", then "The project in one page" and
  "How it works, from first principles", until you can draw the Merkle tree and explain the
  nullifier without notes. Everything else builds on those two.
- **Day 2.** Read "The decisions we have to defend" and "What we deliberately do not do".
  Examiners score these most, because they show real design choices. Learn the
  non-guarantees too: naming a limitation before you are asked earns more than defending it
  afterwards.
- **Day 3.** Practise the question bank out loud, in pairs, one person as examiner. Silent
  reading does not prepare you to speak. Read "The hard ones" last, so the toughest questions
  are fresh.

Three rules for the room. Answer in under a minute, then stop; long answers invite
follow-ups on topics you did not pick. If the honest answer is "we chose not to solve that,
here is why", say it: every such choice has a written reason. If you do not know, say "we
have not measured that yet, here is how we would", and never make up a number.

## The seven claims to state exactly

Seven statements, worded the way you should say them. Each is covered in full in "The hard
ones".

1. **The ballot booth builds its own authentication path.** The registrar is not contacted
   at vote time. When registration closes, it publishes the full leaf set to IPFS, and the
   CID (the IPFS file identifier) goes on-chain in the same transaction as the root. The
   booth downloads the leaf set, rebuilds the tree in the browser and works out its own path.
   The backend never learns which leaf is voting.
2. **Ballot secrecy is conditional, and we always say so.** Against the chain it is
   unconditional: no on-chain data links an address or identity to a ballot. Against the
   operator it is conditional, because the relayer reads the candidate choice and sees the
   network address it comes from. It holds when the relayer is run separately from the
   registrar, or when the voter submits directly.
3. **Roll correctness is a stated non-guarantee, and stuffing cannot be detected.** The
   registrar sets the roll size, and with voluntary registration nobody else knows the true
   figure. What we get is weaker: the most ballots that could be stuffed is fixed and
   published before any ballot exists, and stays public forever. The real fix, which we do
   not build, is to stop trusting a single registrar.
4. **The ballot count is capped on-chain.** `VoterRegistry` stores the roll size next to the
   root, and `castVote` requires that spent nullifiers never exceed it. A Merkle root does not
   record how many leaves it has, so root and roll size are two separate values written by
   the same registrar. This check links them.
5. **Eligibility depends on a trusted setup we did not run.** Groth16 needs a setup for each
   circuit, and ours is the Semaphore circuit's phase-two ceremony. We use the published files
   and check their hashes against the Semaphore repository instead of running our own
   ceremony. If every contributor colluded, fake membership proofs would pass.
6. **Relayer censorship is one attack, and it is the strongest one against this design.** A
   relayer that reads the choice and decides what to forward can quietly drop only the
   ballots for one candidate. We limit it with a signed receipt per accepted ballot and a
   client-side deadline. We do not eliminate it.
7. **The go/no-go depends on M1, not on the calendar.** It happens one week after M1 is
   actually done, or immediately if M1 is not done by 18 October. A second fallback is
   decided on 1 November: tier 2 is a complete working voting system by itself, so the worst
   case is a demo without anonymity, not no demo.

## The project in one page

DVote is a decentralized voting application: smart contracts on a public blockchain testbed
run the election, not an administrator. The target is the institutional election (student
body or senate, departmental association, club committee, shareholder resolution) with a few
hundred to a few tens of thousands of voters, a roll from an existing membership database,
and a result expected within hours. The usual alternative is a hosted web app one person
sets up in an afternoon, who then controls the roll, the ballot box, the count and the audit
log all at once.

The actors are the Election Authority (starts the election, sets candidates and time
windows), the Registrar (checks eligibility off-chain and commits the roll), the Voter, the
Candidate, the Auditor or Observer (anyone can be one), and the Relayer (pays gas for the
voter). Registration puts one 32-byte Merkle root on-chain instead of a voter list, with the
roll size and the IPFS identifier of the leaf set, in one transaction. Auditors use the leaf
set to recompute the root; voters use it to rebuild the tree in the browser. A ballot is a
zero-knowledge proof that the voter knows a secret behind one leaf under that root, plus a
nullifier that blocks a second ballot from the same voter without revealing who they are.
The contract rejects ballots once spent nullifiers would pass the published roll size, so it
enforces the declared capacity instead of us just promising it. Tallies are contract state
that only the ballot-acceptance function can increase. A relayer pays gas through an
ERC-2771 forwarder, so voters need no cryptocurrency, and a voter with gas can skip the
relayer.

**The one sentence.** It is not a database with extra steps, because a database still has an
operator who decides what goes in and can show different logs to different people. Here,
parties who do not work for us agree on inclusion and ordering, the counting rule is contract
code that runs the same for everyone, and eligibility is checked when the ballot is written,
not audited later by someone you also have to trust.

The test is step 5 of the Evaluation 2 demo: shut down the backend on stage, and the audit
dashboard still recomputes the correct tally from chain logs alone. If the result depended
on our server, that step would fail.

The part that decides the outcome is truly decentralized: ballot acceptance, the rules and
the count. Part of the participation path is not, and we say so: the registrar decides who
is enrolled, and the relayer decides whether to pay for a ballot. If asked "what did you
actually achieve", say: DVote removes the operator from the ballot box and the count, but
one party still controls who gets to vote.

**Secrecy, stated correctly, every time.** Use the wording of claim 2: unconditional against
the chain, conditional against our own operator, because the relayer reads every choice it
forwards and sees the network address. It holds if the relayer is run separately from the
registrar, or if the voter submits directly. Saying "ballot secrecy" without this condition
is the easiest way to lose marks. The condition is in the report, and the examiner has read
it.

## How it works, from first principles

Each subsection only uses ideas from the ones before it. Learn them in order.

### 1. Hashes, commitments and Merkle trees

A **hash function** takes any input and returns a fixed 32 bytes. It is deterministic (same
input, same output), one-way (you cannot get the input back from the output) and collision
resistant (nobody can find two inputs with the same output). We use **Poseidon** because it
is cheap inside a zero-knowledge circuit. Keccak-256 has the same properties outside one.

A **commitment** is a hash you publish instead of the secret. A voter picks a random
**identity secret**, keeps it on their device, and gives the registrar only
`commitment = H(secret)`. One-way means the commitment reveals nothing about the secret (it
is *hiding*). Collision resistant means the voter cannot later claim a different secret
produced it (it is *binding*). Think of a sealed envelope: fixed contents nobody can read.

A **Merkle tree** combines many commitments into one value. Take four voters with
commitments `a1`, `b2`, `c3`, `d4`. Hash them in pairs, then hash the results:

```
              root = H(7e, 2f) = 9d
             /                     \
      H(a1,b2) = 7e            H(c3,d4) = 2f
       /      \                 /       \
      a1      b2               c3       d4
```

`9d` is the **root**, a single 32-byte value, and the only thing written on-chain. Change,
add or reorder any leaf and the root changes.

An **inclusion proof** (or authentication path) shows one leaf is under the root. To prove
`c3` is in the set, send `c3` plus its siblings `d4` and `7e`. Anyone computes
`H(c3,d4) = 2f`, then `H(7e,2f) = 9d`, and compares with the published root. Nothing about
`a1` or `b2` is revealed, and faking the proof would need a hash collision.

Why this matters is cost. The path length is log2 of the number of leaves. Four voters need
two hashes. A hundred thousand voters fit a tree of depth 17 (2^17 = 131,072): 17 hashes and
about 544 bytes of path. The root stays 32 bytes, so one storage word stands in for the whole
roll. This is the idea behind parameter C1. Storing the roll on-chain would cost one storage
slot per voter, roughly 20,000 gas each, so registration cost would grow linearly with the
electorate.

What this does **not** give you: the root says nothing about who the leaves are. It proves
which roll the registrar chose, not that the roll is honest. You also cannot list voters from
a hash, so the registrar publishes the leaf set to IPFS, with its CID on-chain in the same
transaction as the root. Auditors recompute the root from it, and each voter's browser
rebuilds the tree from it, so the path is never requested from the party that knows which
leaf belongs to whom.

### 2. Zero-knowledge proofs and zk-SNARKs

A plain inclusion proof names your leaf. Shown on-chain, it proves eligibility but destroys
ballot secrecy, because the registrar knows which leaf is which person. The fix is to run
the same check privately and prove it passed.

A **circuit** is that check written as a program. Its inputs are **public inputs**, which
everyone sees, and a **private witness**, which only the prover sees. A **zk-SNARK** is a
short proof that the circuit ran correctly on some witness. *Zero-knowledge* means it reveals
nothing else about the witness. *Succinct* means checking it takes fixed work. Groth16, the
scheme Semaphore v4 uses, gives a proof of eight field elements (two G1 points and one G2
point, 256 bytes). Verifying it on-chain costs roughly 200,000 to 250,000 gas, mostly the pairing check,
whether the tree has 4 leaves or 100,000.

Our statement, in one sentence: *I know a secret whose commitment is one of the leaves under
root R, this nullifier is correctly derived from that same secret and this election, and I am
casting this exact signal.*

| | Value | Why it is on this side |
| :-- | :-- | :-- |
| Public | Merkle root `R` | The contract already stores it and checks the proof against it |
| Public | Scope (election id) | Same for every voter in the election |
| Public | Nullifier | The contract must store and compare it |
| Public | Signal (candidate choice) | Including it stops a relayer changing the vote |
| Private | Identity secret | Revealing it allows impersonation and ends anonymity |
| Private | Authentication path and leaf indices | The left/right indices *are* your position in the tree |

The identity commitment is **not** a public input, and must not be: with the published leaf
set it identifies the voter at once. The circuit recomputes it from the secret and checks it
against the private path up to the public root.

Three standard properties, applied here. **Completeness**: an honest voter with a registered
secret can always make a proof the contract accepts (protects the voter). **Soundness**:
someone without a secret under the published root cannot make an accepted proof, except
with negligible probability (protects the election). **Zero-knowledge**: the proof reveals
only that the statement is true (protects ballot secrecy). Soundness here is computational
and depends on the trusted setup and pairing assumptions; zero-knowledge does not depend on
the setup.

**Trusted setup.** Groth16 needs a circuit-specific setup, and anyone who kept its leftover
random values could forge proofs. We did not run a ceremony, and should not on this
schedule. We use Semaphore v4's published files, from a phase-one Powers of Tau and a
circuit-specific phase two with many independent contributors, and check their hashes against
the Semaphore repository so we know the keys are real. If every contributor colluded, the
holder of the leftover secret could forge membership proofs with any nullifiers, and the
proofs alone would not show it. Ballots already cast would still not become linkable, because
zero-knowledge holds whatever the setup was. This is one reason `castVote` caps accepted
ballots at the published roll size: a forged proof still cannot push the count past a number
fixed before any ballot existed.

What this does **not** give you: it does not prove a voter is a real, separate person, it
does not hide the candidate choice (the signal is public), and it does not resist coercion,
because anyone with the secret can prove how you voted.

### 3. Nullifiers

The obvious code is `mapping(address => bool) hasVoted`. It works, but we cannot use it,
because the key is the voter's identity. The chain is public, so `hasVoted[0xAb3f...] = true`
next to a `VoteCast` event naming a candidate is a permanent public record of how that
person voted. We want the same one-vote check with a key that is not a person.

A **nullifier** is one number:

```
nullifier = H(identitySecret, electionId)
```

The contract keeps `mapping(uint256 => bool) spent`, keyed by nullifier instead of address.
It is **deterministic**, so a repeat ballot is caught; **one-way**, so the voter stays
anonymous; and **scoped** by the election id, so one voter's nullifiers in two elections look
unrelated.

Two attempts, with a toy hash `H(a,b) = (7a + 13b) mod 101`. (Real Poseidon returns a
254-bit field element; the toy one can be reversed, which is why nobody uses it.) Priya's
secret is 42 and the election id is 5.

1. `H(42,5) = (294 + 65) mod 101 = 56`. She submits `castVote(proof, 56, "B")`. The contract
   verifies the proof against root `9d`, sees `spent[56] == false`, sets it true and
   increases B's counter. The chain now records: someone on the committed roll voted B, and
   the number 56.
2. She clears her browser and uses a different wallet on a different network. Her secret is
   still 42 and the election still 5, so the nullifier is still 56, `spent[56]` is true, and
   the transaction reverts.

Rahul, with secret 17, gets `H(17,5) = 83`. The spent set is `{56, 83}`: two ballots, two
numbers, no names.

She cannot just send 57. The circuit derives the nullifier from the same secret whose
commitment passed the membership check, so the proof covers the derivation. Without that, a
client could make a new nullifier per ballot and vote as often as it liked. Without the
scope, a voter has one lifelong nullifier that links their ballots across every election. If
the hash were reversible, an attacker could work back to the secret, then the commitment,
then the registrar's record.

What this does **not** give you: within one election the nullifier is a fixed pseudonym, so
anyone who learns yours can find your ballot. A voter who hands over their secret hands over
their vote, because the buyer can compute the proof and nullifier and vote first. The rule is
one ballot per leaf, not per human: a registrar that enrols 50 fake leaves gets 50 valid
ballots. The on-chain cap limits the total, since `castVote` refuses once spent nullifiers
reach the published roll size, but it cannot tell a fake leaf from a real student.

### 4. Gas, transactions and meta-transactions

A blockchain has no single server. Every full node re-runs your request and stores the result
permanently, so the network charges per unit of work. That unit is **gas**. Each EVM
operation has a fixed gas cost: adding two numbers is 3 gas, writing to an empty storage slot
about 20,000, a pairing check roughly 200,000. The **gas price** is a per-unit bid that gets
you included. The **fee** is gas used times gas price, paid in the chain's native token (ETH
on Ethereum). Since EIP-1559 the base fee is burned and only the priority tip goes to a
validator. If execution runs out of gas, everything reverts and the gas is still spent.

Worked example with our own budget (parameter A1 caps `castVote` at 400,000 gas, about half
of it the pairing check):

```
300,000 gas x 30 gwei = 9,000,000 gwei = 0.009 ETH per ballot
```

At Ethereum mainnet prices 0.009 ETH is real money, not a fraction of a rupee. So gas
(parameter A1) is the engineering measure, and any fiat figure is just an illustration at a
stated price, not a target. A large real election would use a cheaper execution layer, which
is future work.

The fee is paid by the account that signed and sent the transaction (`msg.sender` in
Solidity). In the obvious design every voter installs a wallet, gets ETH from a faucet and
keeps a balance. That loses most of the turnout and makes owning cryptocurrency a condition
for voting. Sending each voter a little ETH first is worse: the public transfer links the
registrar's address to the address that later votes, which is exactly what the cryptography
is meant to prevent.

**ERC-2771** separates who pays from who is speaking.

1. The voter builds the full call and signs an EIP-712 typed struct over it (`from`, `to`,
   `value`, `gas`, `nonce`, `deadline`, `data`). Signing is local: no transaction, no gas,
   no money moves.
2. The relayer sends `VoteForwarder.execute(request, signature)` from its own funded account
   and pays.
3. The forwarder recovers the signer, checks the nonce (no resubmission) and the deadline
   (not expired), then calls `Election.castVote(...)` with the signer's 20 bytes added to the
   end of the calldata.
4. `Election` inherits `ERC2771Context`, whose `_msgSender()` returns those last bytes when
   `msg.sender` is the one fixed trusted forwarder, and returns `msg.sender` unchanged
   otherwise.

The condition in step 4 is what makes it secure. Without it, anyone could call the contract
directly, add any address to the end, and act as that person.

One DVote-specific point. The recovered signer is **never** checked against the roll, because
eligibility comes from the proof. So the signing key can be a throwaway made in the browser
for one ballot, which is why gasless and anonymous voting work together. It also means
ERC-2771 does not stop a relayer tampering with a ballot. The proof does, because the signal
is a public input included in it.

What this does **not** give you: the cost moved to the relayer, it did not disappear. So the
relayer verifies the proof off-chain before spending anything, rate-limits per nullifier and
has a capped daily budget. A forwarded ballot costs slightly more gas than a direct one. The
standard gives no censorship resistance by itself, and this is the design's worst attack.
Learn it as one sentence: the relayer reads the candidate choice in plain text, so it can
drop only the ballots for a candidate it dislikes, and turnout will not show it, because
turnout below roll size is normal in every election. Two things limit it. The relayer returns
a signed receipt for every ballot it accepts, so a dropped ballot is a signed promise it
broke. And the booth warns the voter and offers direct submission if no transaction hash
appears before a deadline. Neither removes the attack, and direct submission only works for a
voter who has gas.

### 5. One ballot, end to end

This path touches every component, so it is the thing to rehearse.

| Step | Where | What happens |
| :-- | :-- | :-- |
| 1 | Browser, at registration | Identity secret created locally, commitment sent to the registrar |
| 2 | Registrar | Institute email OTP confirms eligibility; commitment stored in PostgreSQL |
| 3 | Registrar, at close of registration | Builds the Merkle tree, publishes the leaf set to IPFS, writes the root, roll size and CID to `VoterRegistry` in one transaction |
| 4 | Ballot booth | Loads the secret, reads root, roll size and CID from the chain, downloads the leaf set, rebuilds the tree in the browser, works out its own authentication path, checks the voter's commitment is in the set. The registrar is not contacted |
| 5 | Web Worker | Builds the Groth16 proof (hypothesis: 1 to 3 s, which B2 exists to measure), with nullifier and signal as public inputs |
| 6 | Ballot booth | Wraps `castVote` in an ERC-2771 request, signs it with EIP-712, sends it to the relayer |
| 7 | Relayer | Verifies the proof off-chain, checks the nullifier, pays for the transaction from its own funded account, returns a signed receipt |
| 8 | `VoteForwarder` | Checks signature, nonce and deadline, calls `Election` with the signer added |
| 9 | `Election.castVote` | Requires the `Voting` phase, verifies the proof against the frozen root, reverts if the nullifier is spent or if accepting would push spent nullifiers past the published roll size, records the nullifier, increases the candidate's count through `TallyLib`, emits `VoteCast` |
| 10 | Indexer | Copies `VoteCast` into PostgreSQL for fast dashboard reads; lag is on the Phase 3 checklist, not a reported parameter |
| 11 | Audit dashboard | Reads the chain through a public RPC endpoint, never our backend, and recomputes the tally from raw logs |

Every check in step 9 is a revert, not a status flag, so a ballot is either counted or never
existed. This is transaction atomicity: verifying the proof, checking the count against the
roll size, recording the nullifier and increasing the tally all succeed or all fail.
Otherwise you could get a spent nullifier with no counted vote, or a counted vote that can be
cast again.

Three steps are worth saying out loud. Be ready to justify step 4: a path sent by the
registrar would reveal the leaf to the one party that knows which institute email it belongs
to, seconds before the relayer in the same backend gets that voter's choice. Building it in
the browser keeps the registrar off the vote path entirely. Step 7's signed receipt is the
only thing that makes a dropped ballot provable, which is what limits the censorship attack.
Step 11 is what the whole design exists for: the result never passes through anything we
run.

## The decisions we have to defend

Each row gives a decision, the option we rejected, and why. Learn the reason, not the row.

| Decision | Alternative rejected | Why |
| :-- | :-- | :-- |
| A public blockchain at all | A signed, append-only log on a server we run | A signed log still has an operator who picks what goes in and can show different readers different logs. On a chain, parties who do not work for us agree on what was included and in what order, and the acceptance rule is enforced at write time, not audited later |
| Ethereum Sepolia as the testbed | Other testnets | It is the Ethereum Foundation's recommended testnet for app and contract development, has the best faucet and tooling support, and executes exactly like mainnet |
| A local Foundry node for gas and throughput | Measuring everything on the testnet | Gas depends only on bytecode and calldata, so local numbers are exact. A sweep over roll sizes from ten to a hundred thousand is instant and free locally; on a testnet it would drain the faucets |
| Semaphore v4 | Custom circom circuits | It is exactly what we need (anonymous group membership with a per-election nullifier), audited and maintained. Our own circuits would eat the project time and put unaudited cryptography at the centre of a security project |
| Semaphore's circuits, verifier and nullifier scheme, but **not** its on-chain group management | Using Semaphore's group contracts | Their `addMember` stores each leaf on-chain, so registration would cost gas per voter and grow with the electorate, the exact cost this design avoids |
| Semaphore rather than MACI | MACI | MACI adds coercion resistance, but needs a coordinator, encrypted messages and key rotation, and the coordinator must be trusted for privacy. That swaps one trust assumption for another |
| Membership tree built off-chain, only the 32-byte root on-chain | Storing the roll on-chain | Registration is one storage write for any roll size (parameter C1). The tree cannot be rebuilt from chain data, so the registrar publishes the leaf set to IPFS and puts its CID (content identifier) on-chain next to the root. The booth also rebuilds the tree from it to get its own authentication path, so the registrar is not needed at voting time |
| EIP-1167 minimal proxy clones | A fresh `Election` deployment per election | A clone is a few dozen bytes forwarding to one shared implementation, so elections are much cheaper to create. The implementation cannot be changed, so nobody can rewrite the rules mid-vote |
| A relayer sponsoring gas through ERC-2771 | The voter pays their own gas | Voters should not need to buy cryptocurrency to vote (parameter E2). Do not say direct submission makes censorship "just a cost": that only helps a voter who already holds gas, and E2 assumes none. The signed receipt and client-side deadline make a dropped ballot provable. They limit the attack, not remove it |
| Foundry | Hardhat 3 | Tests are in Solidity, so no language switch. `forge snapshot` gives per-function gas, measuring A1 and C1 for free, and the built-in fuzzer gives the adversarial ballot tests D1 needs |
| OpenZeppelin Contracts 5.x | Hand-rolled access control, forwarder, Merkle proofs, clones | In a security project, rewriting an audited role check is hard to justify and harder to review |
| The audit dashboard reads a public RPC endpoint and never our backend | Serving the tally from our indexer | An audit through our server checks our claims, not the chain, and is useless exactly when it matters. That is why shutting down the backend mid-demo is a real test |
| The backend is a convenience and liveness layer only | A backend that holds any authority over the result | The registrar only outputs a root, which then freezes. The relayer cannot forge, change or replay a ballot. The indexer is a cache rebuildable from the first block. Do not shorten this to "the relayer only pays gas and can be bypassed": it can still drop every ballot for one candidate, and bypassing it needs gas E2 says the voter lacks |
| Tier 2 shipped before tier 3 | Building the anonymous version directly | The cost of anonymity is a difference, so it needs two measurements: a gas snapshot at M1 and again after Phase 2. If tier 3 fails, tier 2 is still a complete system to demo |
| IPFS with the CID stored on-chain for metadata | Storing manifestos on-chain | Same integrity guarantee for much less gas; the file is only available while someone pins it |
| `TallyLib` as a separate library | Counting rules inside `Election` | The counting rule is published with the election and can be swapped for approval voting without touching lifecycle code, so it is fixed before any ballots exist |

## What we deliberately do not do

Say these confidently. If an examiner finds a gap you already admitted, it counts as
understanding. If they find one you denied, it counts as overclaiming and they start doubting
everything else.

The report lists seven. The first six:

| Non-guarantee | Why out of scope | The one-line answer |
| :-- | :-- | :-- |
| **Coercion resistance** | The fix is MACI-style key rotation, which needs a coordinator and far more circuit work than eight weeks allows | "A voter who hands over their secret hands over the vote: the buyer computes the proof and nullifier and casts the ballot, and the voter cannot undo it. The receipt that lets voters check their vote is what makes coercion possible, and we chose verifiability. On vote buying we are worse than the hosted system and worse than paper. DVote is the right trade-off against a dishonest operator and the wrong one against a candidate with cash and a small electorate." |
| **Sybil resistance at the registrar** | Stopping fake voters needs an identity source stronger than an institute email, an institutional process question | "A dishonest registrar can enrol people who do not exist, and zero-knowledge cannot stop that: the proof shows a leaf is in the set, not that the set is honest. We cannot detect it either, since the registrar sets the roll size and registration is voluntary, so nobody else knows the true number. But the maximum number of ballots is fixed and published before voting, and the contract rejects anything beyond it." |
| **Roll correctness** | The fix is to stop trusting one registrar, a structural change, not a feature for eight weeks | "We guarantee nothing about whether the roll is right. Fake leaves can be added and real registrations dropped, and recomputing the root catches neither. Two cheap checks help: the registrar signs a receipt for each accepted commitment, so an excluded voter can prove it, and the booth checks the voter's commitment is in the set before they vote. The fix we do not build is splitting the registrar across several parties, or having candidate-appointed observers co-sign the leaf set before the root freezes." |
| **Ballot secrecy against our own operator** | Needs encrypted ballots (a new tallying design) or several independent relayers (a new deployment) | "Against the chain, secrecy is unconditional. Against the operator it is conditional: the relayer sees the choice and the sender's address, so secrecy holds only if the relayer is run separately from the registrar or the voter submits directly. Since it sees the choice and decides what to forward, it can quietly drop ballots for one candidate. The signed receipt makes a drop provable, not impossible." |
| **Network-level anonymity** | A real fix needs Tor or a mixnet, a networking project | "The relayer and the RPC provider see IP addresses. We strip what metadata we can and do not claim to have solved it." |
| **Secrecy of the running tally** | Needs homomorphic or commit-reveal tallying, adding a phase our lifecycle lacks | "Votes are counted on-chain as they arrive, so partial results are visible during voting and can sway late voters. A sealed ballot box does not leak this, so here we are worse than paper, and we say so." |

Three more to admit straight away if they come up:

| Gap | The one-line answer |
| :-- | :-- |
| **Credential transfer and organised vote farming** | "The identity secret works like a password: whoever holds it can use it, and nothing ties it to a person. So it can be sold, or created in bulk by someone registering for voters. Anonymity also removes the evidence trail a centralized system would leave, a real cost." |
| **A lost identity secret** (the seventh in the report) | "The secret is in browser storage and the root freezes when registration closes, so clearing the browser before voting loses that vote for good. The standard fix is deriving the identity from a wallet signature, so it can be recreated and is never stored. Voting from a different browser profile than the one used to enrol is a known gap." |
| **Availability of the published leaf set** | "The CID is on-chain, so a leaf set that does not match the root is caught at once. Publishing nothing, or unpinning later, is not, and since the booth builds its authentication path from that file, withholding it blocks voting, not just auditing. Observers should pin their own copy on publication, and voting cannot open without a non-empty CID." |

Three points to memorise. First: checking the result is decentralized, but parts of taking
part are not, and shutting down the backend on stage shows exactly that. Second: every
limitation has a known fix we lacked time to build (key rotation, a stronger identity source,
encrypted ballots, anonymous networking, a split registrar), and naming it turns the gap into
future work. Third, if asked what the project is worth: DVote takes the operator out of the
ballot box and the count, but one party still controls who may vote.

## Question bank

Each answer should take under a minute to say. Follow-ups and traps are the examiner's next
move, not part of the answer.

### Fundamentals

**When you say your election logic "is a smart contract", what is that thing actually, on the
machine? Where does it live, and when does it run?**

It is bytecode stored at an address, with its own storage. There is no background process. It
runs only when a transaction calls it, and then every node processing that block runs the same
bytecode in the EVM on the same state and gets the same result. So `castVote` is not a
service we host and could quietly patch. Every validator re-runs it, so nobody, including us,
can make it treat one voter differently.

> *Follow-up.* "Your lifecycle moves from Registration to Voting at a timestamp. If nothing
> runs on its own, who moves it?" Nobody, automatically. A transition function checks
> `block.timestamp`, but until someone sends a transaction the state stays Registration. The
> timestamp decides whether the call succeeds; it does not trigger it.
>
> *Trap.* "A program running on the blockchain" or "an autonomous agent". There is no timer
> or scheduler, and believing otherwise means you cannot say who moves your lifecycle.

**What is gas, mechanically, and who actually pays it when a ballot is cast?**

Gas is a unit charged per EVM operation, so shared computation and storage are not free. Each
opcode has a fixed cost; storage writes are the expensive ones. A transaction sets a gas
limit, and going over reverts everything but still spends the gas. The fee is gas used times
gas price, in ETH. Our voter pays nothing: the ballot goes through an ERC-2771 forwarder and
our relayer sends it. A voter who already holds ETH can send directly as a fallback, so this
limits a censoring relayer rather than defeating it.

> *Follow-up.* "Under the forwarder, inside `castVote`, what does `msg.sender` equal?" The
> forwarder's address. `ERC2771Context` recovers the real signer from the end of the calldata.
> It matters less for us, since we never authorize anyone by address.
>
> *Trap.* "Gas is the transaction fee" mixes up units and price. "The contract pays the gas"
> is impossible: only an externally owned account can start and pay for a transaction, which
> is why a relayer account exists at all.

**Everyone says a blockchain is immutable. What stops the election authority going back and
deleting a ballot they do not like?**

Not the data structure alone. Each block header holds the previous block's hash, so changing
an old transaction breaks every later hash, but that only makes tampering detectable.
Consensus makes it impractical: you would have to rebuild every later block and outweigh the
honest chain under the fork-choice rule, which on proof of stake means controlling a large
share of stake and losing it if caught. Our authority holds no stake in the validator set,
which is exactly why we do not run our own chain.

> *Follow-up.* "Would a private chain your group operates give the same guarantee?" No, and it
> would defeat the project. The guarantee comes from validators not being controlled by anyone
> in the election. If we ran the nodes, we would be the trusted operator the design removes.
>
> *Trap.* "It is cryptographically impossible to change." Hash linking only makes tampering
> visible. "It is distributed" is not enough either: a copied database controlled by one party
> is still controlled by one party.

**Walk me through what the EVM does when a ballot transaction calls `castVote`. Opcode
level.**

The EVM is a deterministic stack machine. The transaction targets our `Election` address, and
the first four bytes of calldata pick the function. Opcodes work on a stack of 256-bit words,
with temporary memory and persistent storage in 32-byte slots, and each one uses gas.
`castVote` runs the Groth16 pairing check using the precompiles, reads the nullifier slot, and
compares the ballot counter with the stored roll size. If the slot is empty and the count is
below the roll size, it writes the nullifier, bumps the counter and adds one to the
candidate's tally (three storage writes), then emits `VoteCast`. Every node ends with the same
state root.

> *Follow-up.* "Which part is expensive?" The pairing check at roughly 200k gas and a cold
> storage write at about 20k. That is why A1 targets under 400k: verification uses most of the
> budget before we write anything.
>
> *Trap.* Assuming the proof is checked off-chain and only the result sent. Then the contract
> trusts our server and every security claim fails. Also, `castVote` is atomic: a revert undoes
> the nullifier write and tally increase together, so one-voter-one-ballot cannot half-fail.

**Your audit dashboard rebuilds the tally from event logs. What is an event log at the
protocol level, and why should I believe it?**

An event is the LOG opcode. It writes topics and data into the transaction receipt, not
storage. Receipts are hashed into a receipts root in the block header, so logs have the same
consensus and hash-chain protection as state and cannot be faked without rewriting the block.
Logs are cheap (a few hundred gas, against twenty thousand for a storage write), and
contracts cannot read them, so nothing on-chain depends on them. The dashboard replays
`ElectionCreated`, `VoterRootPublished`, `VoteCast` and `Finalized` and recalculates the
totals itself.

> *Follow-up.* "The dashboard asks Alchemy for those logs. Have you not moved the trusted
> party?" Partly, yes: Alchemy could return false logs. But anyone can point the dashboard at
> another endpoint or their own node, so Alchemy is replaceable. We do not run a light client
> in the browser, and that is a known gap.
>
> *Trap.* "Events are how a contract stores data cheaply." A contract cannot read what it
> logged, so logs can never hold state the logic depends on.

**What consensus algorithm secures the chain you are deploying to, and why should you care?**

Sepolia uses Ethereum's own proof of stake. Validators propose and attest to blocks in
twelve-second slots, and a block is finalized once two epochs have attested to it, after
about thirteen minutes. A newly included block is not final, and a short reorg (the chain
switching to a different recent history) can drop it. That is why reorg handling is on the
Phase 3 checklist, and why our B1 target of p95 under thirty seconds measures inclusion, not
settlement.

> *Follow-up.* "Your voter gets a receipt at one confirmation. What do you tell them?" The
> ballot is included, not yet finalized. We show a confirmation count; the receipt points to a
> transaction and does not promise permanence.
>
> *Trap.* "Proof of work" (Ethereum moved to proof of stake at the Merge), or "whoever holds
> the most tokens controls it" (stake picks proposers and secures the fork choice; it does not
> let a rich party quietly rewrite finalized blocks).

**Mid-demo a voter gets their receipt, and then the chain reorgs that block out. What happens
to their vote and to your dashboard?**

The transaction is no longer on the main chain, so the nullifier write and tally increase are
gone. If it is still valid and in a mempool, it can be included again and count then.
Otherwise the vote was not cast and the voter resubmits, which is safe because the nullifier
was never recorded and our double-vote check reads state, not receipts. The indexer must spot
the reorg through a parent-hash mismatch and roll back its rows, which Phase 3 tests by
forcing a reorg on Anvil.

> *Follow-up.* "How deep a reorg are you exposed to on Sepolia?" Only recent unfinalized
> blocks, so a few in practice, and we wait several confirmations before showing a receipt as
> settled. Phase 3 tests that the indexer recovers on its own, not how deep real reorgs get.
>
> *Trap.* "It is on the blockchain, so it cannot be lost" confuses inclusion with finality.
> Worse: "our database still has the ballot, so we would replay it". The backend has no
> authority to cast anyone's ballot, and a server-side replay would be the system forging a
> vote.

### Cryptography

**What is a Merkle tree, and why does putting one 32-byte root on-chain commit you to the
entire voter roll?**

The leaves are voters' identity commitments, each parent is the hash of its two children, and
you hash upward until one value is left. We use Poseidon because it is cheap inside a SNARK
circuit. The hash is collision resistant, so changing, adding or reordering any leaf changes
the root. Once the root is published the registrar cannot quietly add or remove a voter, and
anyone with the leaf set can recompute the root and compare it with the chain.

> *Follow-up.* "How big is that root when the roll goes from 1,000 to 100,000?" 32 bytes
> either way. The tree goes from roughly depth 10 to depth 17, but the root is still one value
> and one storage write. That is parameter C1.
>
> *Trap.* "The root stores the roll." A hash is one-way and reveals nothing about any member,
> which is why the leaf set must be published separately.

**What exactly does the zero-knowledge proof prove? Give me the statement in one sentence,
then tell me what the chain sees.**

The statement: I know a secret whose identity commitment is a leaf in the tree with root R,
and this nullifier is correctly computed from that secret and this election's identifier. It
does not say which leaf. The chain sees the root, the scope, the nullifier, the signal
encoding the candidate, and eight field elements of Groth16 proof, never the secret,
commitment or path. The contract checks the proof against its stored root, checks the
nullifier is new, records it, and adds to the count.

> *Follow-up.* "Which of those public values could identify the voter?" None on its own. Root
> and scope are the same for everyone, the choice is public by design, and the nullifier looks
> random. The real linking risk is at the network layer, a listed non-guarantee.
>
> *Trap.* "It proves the voter is eligible" misses half the statement. If the choice were not
> a public input the relayer could rewrite the ballot, and if the nullifier were not tied to
> the same secret a voter could make a new one per ballot.

**Explain how you stop one person voting twice, without using the word nullifier until you
have said what it is.**

Each voter creates a secret on their device and gives the registrar only its hash. The hashes
are the leaves of a Merkle tree whose 32-byte root goes on-chain and freezes. To vote, the
browser proves "I know a secret whose hash is a leaf under that root" without saying which,
and publishes one number computed from the secret and the election id. It is the same every
time that voter votes in this election and reveals nothing about the secret. That number is
the nullifier. The contract stores it and reverts on a repeat.

> *Follow-up.* "So what stops me registering two secrets?" Nothing in the contract. The
> registrar should accept one commitment per verified person, and Sybil resistance at the
> registrar is an explicit non-guarantee.
>
> *Trap.* "We check the voter's address has not already voted." The sender is the relayer for
> every ballot, and tracking voter addresses creates exactly the link the design avoids.

**Suppose I am watching the chain and I already hold the full published list of identity
commitments. Convince me I cannot work out who cast a particular ballot.**

The commitments are public Poseidon hashes. The nullifier is the Poseidon hash of the secret
and the scope. You cannot get from one to the other without the secret. Your only option is
to guess a secret and look for a matching nullifier, and the secret is random in a field of
about 2^254. The proof does not help, because Groth16 is zero-knowledge: a thousand ballots
give you a thousand unrelated-looking field elements.

> *Follow-up.* "What if I am the registrar and I generated the secrets?" Then anonymity is
> gone. That is why the voter creates the identity in the browser and sends only the
> commitment, and why the booth builds its authentication path from the published leaf set,
> not by asking the registrar. Our backup plan of proving on the server weakens this badly:
> the secret would leave the device and sit on the same host as the relayer, a documented
> loss of privacy, not a harmless swap.
>
> *Trap.* "It is anonymous because the proof is zero-knowledge." Incomplete. The nullifier is
> a public output outside the hidden part. It is safe because the hash cannot be reversed and
> the secret is too random to guess.

**List the circuit's public and private inputs, and for each private one say why it must be
private.**

Public: the Merkle root, the scope, the nullifier, and the message encoding the candidate.
The tree depth is not an input: it picks which circuit and verification key are used, since
Semaphore v4 has one per depth. Private: the identity secret and the Merkle proof (the sibling
hash and left-or-right index at each level). The secret must be private or there is no
anonymity, and anyone holding it could vote as that voter. The path must be private because
the indices are your leaf's position in the tree, so publishing them reveals which voter you
are, even without the secret.

> *Follow-up.* "Which public input stops the relayer changing my vote?" The message. The choice
> is built into the proof, so changing it invalidates the proof. A relayer can refuse to
> forward a ballot but cannot rewrite one.
>
> *Trap.* Listing the identity commitment as public. It must not be: with the published leaf
> set it identifies the voter immediately. The circuit recomputes it internally.

**If a plain Merkle proof already proves eligibility in tier 2, what does the SNARK in tier 3
actually buy you?**

A plain Merkle proof is checked on-chain, so the leaf and sibling path sit in calldata in
plain view, and anyone reading the transaction learns which voter you are. It proves
eligibility and nothing more. The SNARK moves that check inside a circuit, so the contract
confirms it passed without seeing the leaf, and the nullifier replaces address tracking for
double votes. That gives ballot secrecy: unconditional against the chain, and against our own
operator only if the relayer is run separately from the registrar or the voter submits
directly. Shipping tier 2 first lets us measure the cost, not guess it.

> *Follow-up.* "What does tier 3 cost in gas compared with tier 2?" We do not know yet;
> finding out is the point. A gas snapshot is committed at the M1 gate on 11 October. We
> expect Merkle path verification at a few thousand gas per level and Groth16 at a flat couple
> of hundred thousand, so tier 3 costs more per ballot but stops growing with the roll.
>
> *Trap.* "The SNARK makes it cheaper." Almost certainly the opposite. It buys privacy and a
> flat cost, not a lower number.

**Groth16 needs a trusted setup. Did you run a ceremony? If not, what are you trusting?**

No, and we should not on this schedule. We use Semaphore v4's published proving and
verification keys, from a phase-one Powers of Tau and a circuit-specific phase two, both with
many contributors. We trust that at least one contributor destroyed their secret share. If
all colluded, whoever held the leftover secret could forge membership proofs and vote without
being on the roll, and we could not tell, because a forged proof verifies like an honest one.
They still could not deanonymize honest ballots, since zero-knowledge holds regardless. We
check the key file hashes against the Semaphore repository. The on-chain cap is the backup:
`castVote` rejects ballots once used nullifiers reach the published roll size, so forged
proofs cannot push the count past a number fixed before voting.

> *Follow-up.* "Define completeness, soundness and zero-knowledge on a ballot." Completeness:
> an honest registered voter can always make an accepted proof (protects the voter).
> Soundness: someone not under the root cannot, except with negligible probability (protects
> the election). Zero-knowledge: the proof reveals nothing beyond the statement (protects
> secrecy). A leaked setup breaks soundness, not zero-knowledge.
>
> *Trap.* "We do not need a trusted setup because we did not write the circuit." The setup
> belongs to the proof system and that circuit. Using someone else's zkey means taking on
> their ceremony's assumption.

**A voter's phone is compromised and their identity secret is copied a week before voting.
What can the attacker do, and what can your system do?**

The attacker can vote as that voter, because the secret is all the circuit checks. Whoever
votes first uses up the nullifier, and the real voter is locked out with no way to prove it
was not them, since unlinkability is the whole point. The attacker can also later prove how
that voter voted. We can do little. The root freezes when registration closes, so there is no
revoking mid-election. If the compromise is known during registration, the registrar publishes
a tree without that leaf, and before voting opens the authority can cancel. After that,
nothing.

> *Follow-up.* "Is that acceptable for a real election?" No, and the report says so. The real
> fix is MACI-style key rotation, where a new key cancels earlier ballots, which needs a
> coordinator and far more infrastructure than the schedule allows.
>
> *Trap.* "The voter re-registers" or "the admin removes them from the roll". Neither exists.
> The root is fixed once voting opens, on purpose, so the authority cannot swap the electorate
> mid-vote.

**Same voter, two different elections on your system. Can an observer tell it is the same
person?**

Not from the nullifiers. The nullifier hashes the secret with the scope, so one secret gives
two unrelated-looking values, and linking them means reversing Poseidon. But there are two
non-cryptographic leaks. A reused identity puts the same commitment in both leaf sets, so the
registrations can be linked even if the ballots cannot. And a voter who skips the relayer
shows the same paying address in both transactions. We would advise a new identity per
election.

> *Follow-up.* "Why put the scope in the nullifier at all?" Otherwise the nullifier is the
> same in every election, so a voter is linked across all of them and a used nullifier becomes
> a permanent public ID. Tying it to the election makes it a one-election pseudonym.
>
> *Trap.* "No, because everything is anonymous." Too broad, and it ignores the two real links.
> Anonymity here covers the ballot, not the whole system.

### Architecture and scale

**Exactly what goes on-chain when a voter registers, and exactly what goes on-chain when they
cast a ballot? Be specific about bytes.**

Registration writes nothing per voter. The registrar collects commitments off-chain, builds the
tree in PostgreSQL, and sends one transaction to `VoterRegistry`: a 32-byte root, the roll size,
and an IPFS CID for the leaf set. One storage write for any roll size. A vote sends a Groth16
proof of eight field elements plus four public signals, about 400 bytes of calldata. It writes
one nullifier slot, one tally increment, one ballot counter increment, and an event. The counter
lets `castVote` reject ballots once used nullifiers reach the roll size, and A1 has to pay for
it. The Merkle path never goes on-chain; it is a private input to the circuit.

> *Follow-up.* "What is the on-chain state growth for 100,000 ballots?" One 32-byte nullifier
> slot per ballot plus logs. Gas per ballot is flat, but total state grows with the people who
> vote, not with roll size. We should report both.
>
> *Trap.* Saying registration writes each commitment, or calls Semaphore's `addMember` per
> voter. That is the design we rejected.

**Your headline claim is that gas is constant in the size of the electorate. Constant in what,
exactly, and what is not constant?**

Gas per operation does not change with roll size. A roll of ten or a hundred thousand is the
same single root write, and verifying a ballot costs the same because the verifier sees only the
root and a fixed-size proof. What grows: total gas with ballots cast (one nullifier each); the
registrar's work and the published leaf set with the roll; client proving time with tree depth,
which C2 measures separately.

> *Follow-up.* "So is calling it O(1) in the report an overstatement?" Yes, on its own. It should
> say O(1) gas per operation in roll size, with the linear costs named in the same sentence.
>
> *Trap.* "The whole system is O(1)." That confuses per-operation gas with total cost and drops
> the registrar's work, the IPFS publishing and the per-ballot cost that grows with turnout.

**How big is one of these proofs, and what does verification cost? Numbers.**

A Groth16 proof is the same size at any depth: two G1 points and one G2 point, eight 256-bit
words, 256 bytes. With four public signals, `castVote` calldata is about 400 bytes, roughly
6,000 gas at 16 gas per non-zero byte. Verification runs through the elliptic-curve
precompiles, about 200,000 to 250,000 gas, the biggest cost. A1 targets all of `castVote` under
400,000, so verification is about half. The rest is the nullifier write, tally increment and
event. None of this is measured yet.

> *Follow-up.* "What if `castVote` comes in at 500,000?" We report and explain it. The pairing
> cost is fixed with Groth16, so we would look at the nullifier storage layout and the event
> payload, and show the difference against the tier 2 baseline so the cost of anonymity is a
> measured number, not an excuse.
>
> *Trap.* Saying the proof grows with the number of voters. That confuses the Groth16 proof with
> the Merkle inclusion proof, which grows logarithmically but never goes on-chain.

**If the tree lives only off-chain, how do I as an outside auditor check that the on-chain root
corresponds to a legitimate roll?**

Two checks; only the first is cryptographic. First, the root is on-chain and frozen when
registration closes, and the leaf set's IPFS CID is recorded in the same write. You fetch the
leaves, rebuild the tree with the same hash and ordering, and check the root matches. A
mismatching set is caught at once. Second, honestly: that only proves the leaves match the root.
It does not prove they are real people or the right set. A registrar who swaps a voter's
commitment for its own passes every check. Sybil resistance (stopping fake identities) and roll
correctness are listed non-guarantees. Do not say the roll size makes stuffing detectable; the
registrar chose it. It gives a capacity fixed before any ballot, which `castVote` enforces.

> *Follow-up.* "What does the chain lose by keeping the tree off-chain?" Data availability. A
> chain-only auditor can check every ballot proved membership and no nullifier repeated, but not
> whose commitments are in the set. A non-empty CID is required before voting opens, but nothing
> on-chain keeps that data downloadable. That is the price of flat gas. Enforcing it would mean
> posting the leaf set as calldata or using a data availability layer.
>
> *Trap.* "Auditors can rebuild the tree from chain events." No leaf is ever on-chain. That is
> why registration is one write.

**Does proof generation time grow with the size of the tree? What did you predict, and what if
the measurement disagrees?**

We predict it grows slowly, and only with depth. Semaphore v4 has a separate circuit and proving
key for each depth from 1 to 32. A deeper tree adds one Poseidon hash per level: depth 17 for
100,000 voters, depth 4 for 10. What grows with the roll itself is the tree rebuild in the booth,
which is linear, so C2 times the two separately. On real devices, memory and the proving key
download also matter, so B2 is measured per device class.

> *Follow-up.* "So what limits the roll size for a voter on a phone?" The rebuild, not the proof.
> That is why C2 targets ten thousand voters and only reports a hundred thousand.
>
> *Trap.* "Proving time is constant because zero-knowledge proofs are constant size." Proof size
> and verification cost are constant. Proving time depends on circuit size.

**Walk me through 100,000 voters. Where does this system break first? Name a component.**

Not the contract: gas per ballot is flat. Three things break first. The relayer signs from one
address, so its nonce is a global lock and transactions queue behind it. C3 should find that
limit; the fix is a pool of relayer keys with separate nonces. Next, the hosted RPC provider's
rate limit. Then the chain: Sepolia allows 60 million gas per twelve-second block, so at 400,000 gas a
ballot that is about 12 ballots a second if we had the whole chain, which we do not. Registration is fine,
since the tree is built off-chain.

> *Follow-up.* "Twelve a second sounds low." A hundred thousand voters is about two hours of full block
> space, if we had the chain. Fine for a campus; not fine several orders of magnitude higher.
>
> *Trap.* Naming the contract or gas as the bottleneck. That is the one thing this design made
> flat, so it shows the scaling story was memorised, not understood.

**It is election day and your relayer is down or its wallet is empty. What happens to a voter
holding no ETH?**

First, the ballot is an ERC-2771 signed request, not tied to our relayer. Anyone can submit it
to the forwarder, since the signature and proof cover the payload, not who pays, and a deadline
stops endless replay. Second, a voter with ETH can call `Election` directly. The honest limit:
this keeps censorship resistance, not usability. A voter with no ETH and no way to get it during
voting is stuck, and E2 claims voters need zero cryptocurrency. For the demo we pre-fund audience
wallets and keep a second relayer wallet.

> *Follow-up.* "So your zero-gas property depends on a server you operate." Yes, only the
> relayer. The registrar is not a second, because the booth builds its Merkle path from the
> published leaf set instead of asking for it. Otherwise a registrar could silently ignore one
> voter with no bypass, since direct submission skips the relayer, not the registrar. The relayer
> cannot forge, change or replay a ballot. It can refuse to pay; the signed receipt and direct
> submission limit that but do not remove it.
>
> *Trap.* Casually saying "the voter just pays their own gas". It breaks E2, and a voter promised
> no cryptocurrency cannot get ETH mid-vote.

**Your indexer caches chain events into PostgreSQL. How do you know that cache agrees with the
chain?**

The indexer is only a cache. The audit dashboard never reads it; it reads the chain through an
RPC endpoint, which we show by shutting down the backend. In the cache, every row is keyed on
transaction hash plus log index, so replaying a block is harmless. We store each block's hash
and check that each new block's parent hash matches; a mismatch means a fork. The database can
be rebuilt from genesis, as Phase 3 shows. Indexer lag and reorg recovery are Phase 3 checklist
items, not reported parameters.

> *Follow-up.* "How do you know the rebuilt database equals the incrementally built one?" Rebuild
> into a second schema and diff the tables, and compare the tally with a direct read from the
> `Election` contract. The contract decides.
>
> *Trap.* "We poll every few seconds, it stays in sync." Without fork detection the cache drifts
> silently, and the operator can publish a number nobody can check.

**Could this architecture run a national election? India, roughly 970 million registered
voters. I want the arithmetic.**

No. Sepolia allows 60 million gas per twelve-second block, about 5 million gas a second.
At 400,000 gas a ballot that is about 12 ballots a second with the whole chain to ourselves. India
cast about 640 million votes in 2024: well over a year of full block space with nothing else
running. So the design fits elections of thousands (a campus, a society, a shareholder vote) and
is about three orders of magnitude short for a country. The fix is combining many ballots into
one proof, or settling on a rollup, which is a different project.

> *Follow-up.* "What else fails at national scale?" The registrar: Sybil resistance is a listed
> non-guarantee, and one party checking eligibility off-chain is unacceptable at that scale. Also
> the public running tally, which becomes a real problem, and the lack of coercion resistance.
>
> *Trap.* Saying yes and pointing at sharding or more servers. The arithmetic says no, and giving
> that answer with the numbers scores far better.

### Security and threat model

**I am a registered voter and I want to vote twice. What stops me, and name the piece of
state that does it.**

My proof carries a nullifier, a hash of my identity secret and the election id. It is
deterministic, so both ballots give the same value, and it reveals nothing because the secret
stays in my browser. `castVote` checks a mapping from nullifier to bool: the first ballot sets it
and increases the count, the second reverts. We deliberately do not track addresses: voters are
anonymous, and every relayed ballot has the same sender. D1 replays a nullifier and checks the
revert, does the same for a ballot past the roll size, and fuzzes both.

> *Follow-up.* "Could you generate a second identity and vote again?" Only if the registrar adds
> a second commitment. The tree decides eligibility, so that is a registrar question.
>
> *Trap.* "We keep a mapping of addresses that have voted." Wrong twice: the relayer sends every
> ballot, and tracking voter addresses destroys the anonymity the design is for.

**The Election Authority does not like how the vote is going halfway through. Can they stop
the count?**

Not in any way that matters. Only `castVote` changes the tally, so every accepted ballot is
already counted. Finalization does not compute the result; it just closes the state machine. If
the authority never calls it, the tally is still readable and anyone can recompute it from
`VoteCast` logs. The authority can cancel only before voting opens. Once Voting starts there is
no way back and the root is frozen. D5 tests that the admin cannot vote, change a frozen root, or
stop the count.

> *Follow-up.* "Can the authority stall forever by never opening voting?" No. Once a
> transition's time has passed, anyone can trigger it, so any observer can close voting and
> finalize. The authority only configures before registration opens and cancels before voting
> opens. FR4 is written this way on purpose: authority-only finalization would be a silent veto,
> because the time check stops a transition happening too early, never too late.
>
> *Trap.* "AccessControl stops them." Different question. The real reason is that counting is not
> a separate step anyone has to perform.

**I am sitting on your RPC endpoint watching every transaction. What do I learn about how you
voted?**

A transaction from the relayer to the forwarder, with the proof, nullifier, root and signal (the
candidate) in plain text, plus the tally increase and the `VoteCast` log. Nothing identifies the
voter. The secrecy is not encryption: the proof only says the prover knows a secret behind some
leaf under that root, so the anonymity set is the roll. We say openly that the choice is public
and the relayer sees it first. From the chain alone you get a ballot with no author; that is the
unconditional part of our secrecy claim. The conditional part is our own operator, a deployment
question.

> *Follow-up.* "How large is the anonymity set in your demo?" The roll, which on demo day is the
> room. With a small roll and a live tally, matching transaction timing to tally changes can
> identify voters. So we state the expected set size, enrol the whole room, and cast a batch of
> ballots before the live ones. A three-voter demo cannot show anonymity, and showing it badly is
> worse than not showing it.
>
> *Trap.* "The vote is encrypted." Plainly wrong, and the most common mistake about this design.
> Anonymity is not confidentiality.

**Your registrar is corrupt and enrols two hundred voters who do not exist. What stops that?**

Nothing, and we do not claim to detect it. Sybil resistance at the registrar and roll
correctness are listed non-guarantees. Registration is voluntary, so nobody else knows how many
should have registered, and the registrar picks the published number. What we get is narrower.
`VoterRegistry` stores the root, roll size and leaf-set CID before any ballot, and `castVote`
rejects ballots once used nullifiers reach the roll size. So the room to stuff is fixed in
advance, enforced, and public forever. A hosted system can add rows at poll close, when the
operator knows the gap to fill. That is a real difference, but not detection.

> *Follow-up.* "So what would catch it?" Nothing here. The fix is to stop trusting one registrar:
> split enrolment across parties who each hold a share, or have candidate-appointed observers
> co-sign the leaf set before the root is frozen. That is future work, not a claim. Preventing it
> at source needs identity the chain can check, which for real use means Aadhaar-level
> verification.
>
> *Trap.* "The Merkle root prevents fake voters", or "the published roll size makes stuffing
> detectable". The root commits to whatever leaves the registrar chose, fake leaves give valid
> proofs, and the roll size is a number the same registrar typed.

**Your relayer is malicious. Give me the complete list of what it can do to me.**

Three things, and the first two form one attack. It reads my candidate, since the payload is
plain text, and it decides whether to forward, so it can drop only ballots for a candidate it
dislikes. That changes the result, and nobody notices, because turnout below roll size is normal.
Third, it sees the address the request comes from. It cannot forge a ballot (it has no secret in
the tree), change mine (the choice is bound into the proof), or replay it (the nullifier is spent
on first inclusion). We limit the censorship, not remove it: the relayer signs a receipt for each
accepted ballot, so a drop is a broken signed promise, and the booth warns and offers direct
submission if no transaction hash appears before a deadline.

> *Follow-up.* "Direct submission fixes it, then." Not for our voters. E2 means they hold no
> cryptocurrency and E3 tests people who have never used a wallet, so the bypass works for
> everyone except them. Removing the attack needs encrypted ballots or several independent
> relayers, and we build neither.
>
> *Trap.* "The relayer cannot see anything, it is zero-knowledge." It has to read the calldata to
> pay for it.

**I capture a ballot transaction off the wire. What can I do with it?**

Same election: resubmitting reverts, since the nullifier is recorded. Different election: the
nullifier is scoped to the election, so the same secret gives a different value, and the proof
was built against this election's root anyway. Meta-transaction layer: the forward request is
EIP-712 signed with a nonce and deadline over the target and calldata, so the forwarder rejects
a resubmitted or altered request, though it is the proof that makes an altered ballot useless.
So you can only pay gas for a vote that was landing anyway, and our relayer's transaction is the
one that reverts.

> *Follow-up.* "Danger if two elections share a voter root?" None, because the scope is the
> election id. We must never reuse a scope across elections, and we will test that.
>
> *Trap.* "The signature prevents replay." Incomplete, and it credits the wrong thing twice. The
> signature only makes the forwarder reject an altered or resubmitted request. The proof makes an
> altered ballot unusable anywhere, because the candidate is a public input bound into it. The
> nullifier stops the same voter voting again from a new address with a new signature.

**I want to bankrupt your relayer before lunch. How, and what stops me?**

Flood it with ballots that will revert, so it pays gas for failures. Before paying, the relayer
verifies the Groth16 proof off-chain (milliseconds of CPU, no chain access), checks the
nullifier, and simulates the call, so garbage costs CPU, not gas. Then a rate limit, one
sponsorship per nullifier, and a hard daily gas cap, so the worst case is a number we set in
advance. With off-chain verification, total exposure is bounded by the roll size: a valid proof
needs an enrolled identity, and each identity gives one usable nullifier.

> *Follow-up.* "Rate limiting by IP, against deliberately anonymous voters?" Crude and wrong both
> ways: it blocks a campus behind one NAT, and a Tor user avoids it. The gas cap is the real
> control; per-nullifier limiting is the sound one.
>
> *Trap.* "BullMQ and rate limiting handle it." A queue controls throughput, not spending.
> Without the off-chain proof check, random nullifiers with junk proofs pass the nullifier
> pre-check and we pay about 250k gas each for on-chain reverts. So the proof check comes before
> spending.

**Your ballot is sitting unconfirmed in the mempool. What is the worst a searcher can do?**

Copy the signed forwarder request and submit it, paying the gas. My ballot lands as intended,
then our relayer's transaction reverts on the spent nullifier, so we pay. That is griefing
(wasting our money), not an integrity break. They cannot change my candidate (bound into the
proof) or spend my nullifier first (needs my secret). The real leak is that the choice is
visible before inclusion.

> *Follow-up.* "Can a block producer censor selectively by content?" Yes. The choice is plain
> text, so we cannot prevent it. Encrypted ballots with homomorphic tallying would fix it, but
> that is out of scope. It follows directly from a plaintext signal, and we should say so.
>
> *Trap.* "No front-running because the transaction is signed." A signature stops tampering, not
> reordering, and does not hide content from whoever builds the block.

**Your deployer's private key is on a laptop stolen the night before the election. What is the
blast radius?**

Contract code is safe. Elections are EIP-1167 clones of a fixed implementation with no proxy
admin and no upgrade path, so nobody can swap a running election's logic. The key holds the
factory's admin role, so an attacker can create elections, give themselves roles on them, and
publish convincing fakes. That is the real damage: a voter sent to the wrong contract address is
fully compromised whatever the cryptography says. In an election already in voting they can do
very little: the root is frozen and they cannot vote or stop the count.

> *Follow-up.* "Could they repoint the trusted forwarder on a live election?" It should not be
> changeable after deployment. It is set once in the implementation and shared by every clone. A
> changeable forwarder would give an attacker the power we say the authority lacks, so it belongs
> in the D5 containment tests.
>
> *Trap.* "The contracts are immutable, so a stolen key does nothing." Immutability protects the
> code, not role assignments, and luring voters to a fake election address defeats every on-chain
> guarantee at once.

### The skeptic's questions

**In one sentence: what does putting this on a blockchain buy you that a well-run server with a
signed, public, append-only log would not?**

A signed log still has an operator who decides what goes in and could show different readers
different logs. The chain changes three things. Outside parties decide what is included and in
what order, so we cannot quietly drop a ballot. The counting rule is contract code that runs the
same for everyone. And the acceptance rule (one valid proof, one unused nullifier) is checked
when the ballot is written, not later by an auditor you must also trust.

> *Follow-up.* "Use a certificate-transparency style log with independent witnesses." A fair
> alternative that shows tampering. But someone still has to apply the eligibility rule and add
> up totals. A chain is the log and the program together, and witnesses we would have to recruit.
>
> *Trap.* "Blockchain is immutable, so records cannot be tampered with." A Merkle-signed
> append-only log also shows tampering. A permanent wrong tally is still wrong.

**Half your architecture diagram is a Fastify server, PostgreSQL, Redis and a pinning service.
Convince me this is not a database with a blockchain bolted on for marks.**

The backend does four jobs and none is the source of truth. The registrar only outputs a root
that goes on-chain and freezes. The relayer pays gas but cannot forge, change or replay a
ballot. The indexer caches chain events and can be rebuilt from the first block, which we show.
The pinning service stores a file whose hash is on-chain. The audit dashboard talks to an RPC
provider, never our server, and step 5 of the demo kills the backend while the dashboard still
recomputes the tally. That step would fail if we depended on the backend. Two places do hold
real trust, and I would rather say so first: the registrar decides who may vote, and the relayer
sees the choice and decides whether to forward it. A signed receipt limits the relayer but does
not remove it.

> *Follow-up.* "You still read the chain through Alchemy." For convenience. An auditor can point
> the dashboard at any endpoint or their own node, so a lying RPC gets caught. A lying
> application server would not.
>
> *Trap.* "The backend is only there for speed." False, and the examiner points at the
> registrar. "The relayer can be bypassed" is also weak: bypassing needs gas, and E2 says the
> voter has none. Accurate version: the registrar holds real trust over who may vote, the relayer
> has a censorship power we limit, and only the indexer holds none.

**Your registrar decides who gets a leaf. You have not removed the trusted party, you have
renamed it.**

Partly yes, and the report says so: DVote takes the operator out of the ballot box and the
count, but one party still controls who may vote. Cryptography cannot decide that a person is
entitled to vote. What changed is scope. The registrar decides the roll and nothing else. It is
not on the voting path, because the booth builds its own authentication path. It cannot add a
voter after the root freezes, drop a ballot, or touch the count. A normal operator has all four
powers; we went from four to one. That one is fixed and published in advance rather than audited
afterwards, a smaller claim than "auditable".

> *Follow-up.* "Somebody still has to check the roll against real people, which is an audit,
> which your introduction criticises." Correct, that is the remaining trust, and nobody can fully
> do it, since voluntary registration gives no independent number to compare against. The
> difference is timing: the roll is frozen before voting opens, so the number of possible ballots
> is fixed before anyone knows how the vote is going.
>
> *Trap.* "We could run the registrar as a multisig or a DAO." The right direction, and in our
> future work: several parties each holding part of the enrolment, or candidate-appointed
> observers co-signing the leaf set before the root freezes. But we must not claim we built it,
> and those parties still need to check identity, the same problem one level up.

**Your tally updates on-chain while voting is open. A sealed ballot box does not. Explain how
that is an improvement.**

It is not. It is worse here, and we list it as a non-guarantee. Votes are counted as they
arrive, so a partial result is visible and can influence late voters. Hiding it needs
homomorphic tallying (the contract adds encrypted votes, decrypted after the close) or
commit-reveal (ballots go in encrypted and are opened later). Both are projects of their own.
Commit-reveal also adds a second transaction per voter, and voters who never return to reveal
break our usability targets.

> *Follow-up.* "Commit-reveal is not that hard. Why not in eight weeks?" It would land on Phase
> 2, already the riskiest phase since browser proving and the relayer arrive together, and the
> freeze is 8 November. One working system beats two half-working ones.
>
> *Trap.* "It does not matter because ballots are anonymous." Hiding who cast a ballot and hiding
> the running total are different properties.

**Can I sell my vote in your system? Yes or no, then the reasoning.**

Yes, and we do not defend against it. The identity secret is on your device. You can give it to
a buyer who votes as you, or vote and show the nullifier and transaction, which proves your
choice. The nullifier guarantees one ballot, not a free one. The buyer can even check delivery
on-chain without meeting you again, so here we are worse than the hosted system and worse than
paper. Real protection needs MACI-style key rotation, which needs a coordinator and a much larger
circuit budget.

> *Follow-up.* "Then this cannot be used for a real election. What is it for?" Elections already
> remote and run by one person on one machine: a campus body, a society, a shareholders' vote.
> There the current option is a form on someone's laptop, and we clearly beat it on
> verifiability.
>
> *Trap.* "It is zero-knowledge, so nobody can prove how they voted." Zero-knowledge hides the
> link from others, not from the voter, who knows their own secret. Receipt-freeness (being
> unable to prove your vote) is a stronger property we do not have.

**Who actually runs the nodes your election depends on, and why should a voter trust them more
than the university IT department?**

On Sepolia, a validator set we do not control or choose, so they have nothing to gain in our
election. But a testnet is not mainnet. Sepolia's validator set is permissioned and smaller, and
a reorg or stall would hurt us. Fine for a graded course project, and we say so. A real
deployment must choose whose security to rely on, on mainnet or a well-secured layer: future
work.

> *Follow-up.* "So your integrity is only as strong as Sepolia's validators. What happens on a
> reorg?" Phase 3 covers it: we simulate a reorg locally and check the indexer recovers instead
> of showing an old tally. A deep reorg on a small validator set is a real risk we name, not
> finality we claim.
>
> *Trap.* "Blockchains are decentralized, so no one controls it." Wrong for a testnet, where
> validator sets are small and often permissioned.

**Your registrar publishes a root and then publishes a leaf set that does not match it, or
publishes nothing. What happens, and who finds out?**

Two cases. A mismatched leaf set is caught at once by anyone who recomputes the root, since the
on-chain root is frozen. The harder case is withholding: publishing only the root, or unpinning
the file later. The booth builds its authentication path from that file, so withholding it stops
the election, not just the audit. That is why a non-empty CID is required before the Voting
phase. Unpinning after publication is what this design cannot fix: the count stays auditable,
eligibility does not, and voters without the file cannot build a proof. Because the CID is
on-chain, anyone who fetched the file at publication can pin it and prove it is the right one.

> *Follow-up.* "Why not put the leaves on-chain, or refuse the root until the data is
> published?" Leaves on-chain is exactly the linear gas cost the design avoids. We do require the
> CID, but a CID proves what the data is, not that anyone can still get it. The real fix is a
> data availability layer, out of scope.
>
> *Trap.* "It is on IPFS, so it is permanent and decentralized." IPFS finds files by content
> hash but does not keep them. If only the registrar pins, the roll is as centralized as the
> registrar.

**Would an actual election commission deploy this? Straight answer.**

No. Three blockers. It does not resist coercion, which rules out remote voting wherever a voter
can be watched, which is everywhere. Eligibility rests on one registrar's off-chain identity
check; a national roll would need something like Aadhaar or DigiLocker plus a dispute process.
And it runs on a public testnet with a small validator set, which is convenient for a term
project, not a security argument. It fits elections already remote and run by one person.

> *Follow-up.* "Name the one change that moves it closest to deployable." Coercion resistance,
> through MACI-style key rotation, because that gap rules out all remote voting. The rest is
> engineering or policy; that one is a missing property.
>
> *Trap.* "Yes, with a few small changes." None of the three is small, and the examiner will
> list the gaps out loud.

### Evaluation methodology

**Fourteen parameters. If I let you keep one, which tells me whether the project
succeeded, and what does a bad result look like?**

C1, gas against voter-roll size from ten to a hundred thousand, because it shows the design's
main contrast: registration flat, tier 2's
ballot rising logarithmically with the path in calldata, tier 3's ballot flat and higher. A bad
result is any upward slope on tier 3, meaning something touches per-voter state. To be fair, the
registration line is flat by design, so it only catches an accidental O(n) term. The one that can
really go against us is C2, the tree rebuild and proving time on a phone for a large roll,
since it runs on devices we do not control.

> *Follow-up.* "Flat to a hundred thousand. Does it hold at ten million?" We do not claim that.
> We measure four orders of magnitude. Beyond that rests on the on-chain write being one storage
> slot whatever n is, plus a tree-depth term C2 measures. The off-chain side is linear: registrar
> tree-build time, leaf-set size, and browser time to rebuild the tree and recompute the root, at
> the same roll sizes.
>
> *Trap.* "All of them matter", or picking a security property like D1, a pass/fail unit test.
> And do not sell the flat line as a saving: tier 3 should cost more per ballot than tier 2 at
> every roll size we can measure. That is the price of anonymity.

**B1 says 95th percentile under thirty seconds. Most people report an average. Why the tail, and why thirty?**

Each voter feels their own wait, not the average. Confirmation times are skewed: most
transactions land in one or two blocks, a few wait on a repriced mempool or slow RPC. A fifteen
second average can hide one voter in twenty waiting a minute, and that voter decides the site is
broken. We report p50 next to p95 to show the shape. Thirty comes from the chain: Sepolia makes a
block every twelve seconds, so waiting for the next block alone averages about six seconds and
about eleven at p95, before proving and relaying.

> *Follow-up.* "Why not p99?" It needs a few hundred samples, which the testnet faucet budget
> cannot fund. We report what our sample size supports and state the size.
>
> *Trap.* "The average is distorted by outliers we should discard." Those are real voters
> waiting, not measurement errors.

**E2's target is the word "zero". That is a design property. What experiment could ever return
something else?**

Fair: as written, E2 is a property, not a measurement. The test: create a new zero-balance
wallet, do not fund it, complete a ballot end to end, and check the balance is still zero and the
ballot is on-chain. It fails if a step needs a native balance we did not expect, if the relayer
rejects and the interface quietly asks the user to pay, or if registration costs gas even though
voting does not. We report the ETH each voter actually needed, across all ten E3 participants.

> *Follow-up.* "Where does the cost go?" To the relayer. Zero for the voter is not free; the cost
> moved to a named party with a capped daily budget, and the election depends on it staying up.
>
> *Trap.* "It is zero because we use meta-transactions." That assumes the answer. The parameter
> exists to catch the code quietly breaking the property.

**Your methodology says at least thirty repetitions. Where does thirty come from, and is it
enough for a 95th percentile?**

Thirty is the usual rule of thumb for a stable median, and what the faucet budget allows on
Sepolia. It is not enough for a precise p95: with thirty samples p95 is basically the
second-worst result, with a confidence interval from about the 85th to the 99th percentile of
the true distribution. So we name which ranked sample p95 is, and use more runs wherever sampling
is free: gas is deterministic, and Anvil throughput and proving time cost nothing. The limit of
thirty only binds Sepolia latency.

> *Follow-up.* "Which numbers are the n equals thirty ones?" B1 end-to-end latency and B2
> indexer lag on Sepolia, the only ones needing a public network. Everything else is
> deterministic or local and uses more runs.
>
> *Trap.* Citing the central limit theorem. It is about the mean, not a percentile.

**You run the latency benchmark on Tuesday and Friday and get different numbers. What did you
record that lets you say whether your system changed or the world did?**

Per run: commit SHA, deployed contract addresses, gas price set and base fee seen, start and end
block numbers, RPC provider, client device and browser, network path, and timestamp. Gas price
and base fee matter most on Sepolia, since a low gas price means slow inclusion unrelated to our
contract. If two runs differ but the SHA matches and the base fee is similar, the network caused
it, and we report that.

> *Follow-up.* "What is immune to all of that?" Gas. It depends only on bytecode and inputs, so
> A1 and C1 are reproducible from a commit SHA alone. That is why our main claim rests on gas,
> not latency.
>
> *Trap.* Keeping the better day's number, or averaging both days. The first picks the result
> you like; the second mixes two different conditions.

**Your gas comes from a local node, your throughput from a local node, and your latency from
Sepolia. Justify putting those in one report.**

They measure different things. Gas depends on the EVM and the bytecode, so a call costs the same
locally and on Sepolia; local measurement is exact, not a shortcut. Local throughput is not a
Sepolia number and we do not present it as one. It measures our own stack's limit (relayer and
queue) without network noise, to find our bottleneck. Latency is a network property by nature.
Every table caption says where it was measured.

> *Follow-up.* "What can you say about throughput on Sepolia?" It is capped by block space
> divided by gas per ballot. We calculate that but did not measure it under load, since faucets
> cannot fund two hundred ballots. The local limit and the calculated cap are separate
> statements.
>
> *Trap.* Saying Anvil results "approximate" real-network performance. Anvil mines on demand,
> with no peers, no mempool competition and no fee market.

**What does a ballot cost, and what are you actually claiming?**

Gas is the real claim, because it is deterministic: about 300,000 to 400,000 gas per ballot,
measured with `forge snapshot`. Rupees need two prices we do not control, the gas price in gwei
and the ETH-to-INR rate, so a rupee figure is an estimate, not a measurement, and is labelled so.
At Ethereum mainnet prices a ballot costs real money, not paise, so gas is the headline and we
price it at a stated rate as an example readers can redo with their own numbers.

> *Follow-up.* "So it is expensive on Ethereum?" At L1 mainnet prices, yes, so a large real
> electorate would use a cheaper execution layer. That is future work; this project measures the
> design and its gas cost.
>
> *Trap.* Quoting one rupee figure as measured. It hides two changing assumptions in a number
> that looks like data.

**C1 measures gas at roll sizes from ten to a hundred thousand, but you store one 32-byte root
whatever n is. What can that experiment find, and is it capable of showing you are wrong?**

Yes, the registration write is flat by design. The experiment still catches four things.
Registration: if our code ever writes per-voter state, gas grows. Tree depth: a bigger roll uses a deeper
Semaphore circuit and a different verification key, but the on-chain check does the same work,
so tier 3 should stay flat; C1 confirms it. Our code: a hidden loop or array push in `castVote` shows as a slope. And
the cost did not vanish; it moved to the registrar and the client, which C2 measures. The real
claim is narrower than "gas is constant".

> *Follow-up.* "What if it is not flat on 10 November?" Split the graph by call, snapshotting
> registration, root publication and `castVote` separately across roll sizes. If `castVote`
> grows, it is our bug and a day's work. If registration grows, we wrote per-voter state, exactly
> what the off-chain tree avoids. If it is truly linear and unavoidable, we report the slope and
> name the cause. Feature freeze is 8 November: time to diagnose, not to redesign.
>
> *Trap.* "The line will be flat because we only store the root." That repeats the hypothesis
> and hides the per-voter cost instead of showing where it went.

**D3 demonstrates ballot secrecy by showing that no chain data links an address to a ballot. How
do you measure the absence of a link, and how big is the anonymity set?**

You cannot prove a negative, so we define an attacker and run named attacks. The attacker has all
chain data, our event logs and the published leaf set. Attack one, matching sender addresses to
voters, fails for relayed ballots, since the sender is always the relayer. Attack two, matching
the timing of tally changes to off-chain observations, partly works at small roll sizes, and we
say so. Attack three: a voter who skips the relayer links their own address. We report the
anonymity set size (the roll minus whoever timing rules out), not a pass mark. D3 only covers an
attacker who sees the chain, the part of the claim that holds unconditionally.

> *Follow-up.* "That test leaves out the party best placed to break it." Correct. Secrecy
> against our own operator is conditional, not proven by D3. The relayer sees the choice in
> every ballot it forwards and the sending address: a choice but no name. The registrar has a
> name but no choice. The condition is that they are not the same party sharing logs, or that the
> voter submits directly. The booth asks the registrar for nothing at voting time, so running the
> two separately is enough.
>
> *Trap.* Saying ballots are anonymous because the proof is zero-knowledge. Anonymity covers the
> whole transaction; sender address, timing and IP address are outside the proof.

**Ten participants, and you want to report over eighty percent unaided completion. What can you
claim from ten people?**

Not a rate. If eight of ten succeed, the 95 percent confidence interval is roughly 44 to 97
percent, which cannot support "over 80 percent". Ten people are good for finding usability
problems, each one fixable. So we report a problem list, the raw count out of ten with the
interval, and the step where each failure happened. They were BITS students, a convenience
sample, so we do not generalize.

> *Follow-up.* "How do you stop the builders biasing the study?" A fixed written task, no
> coaching, recorded time and stopping point, and an observer who did not build the frontend. It
> is still not blind, and we say so rather than call it a controlled study.
>
> *Trap.* Reporting eight out of ten as "we achieved 80 percent task success".

## The hard ones

These are the strongest attacks on the design, phrased as an examiner would ask them. Every
answer has the same shape: admit the problem in the first sentence, then give the mechanism or
the limitation we accept.

Do not be clever and do not hedge. Admitting a limitation clearly shows understanding.
Claiming more than the design does makes the examiner doubt the claims that were true.

### 1. The registrar knows the leaves and the relayer receives the ballot

**The question.** "Your registrar built the tree, so it knows which leaf belongs to which
person, and your relayer receives the ballot with the choice in the clear. They are the same
server. Why does that not deanonymize every single voter?"

**Why it bites.** If the booth asked the registrar for its authentication path (the sibling hashes from a leaf up to the root), that
request would identify the leaf, and the registrar knows whose email owns it. Seconds later the
same backend would get a ballot, choice in the clear, from the same network address. Linking
the two takes two log lines, not cryptanalysis.

**The answer.** "The booth asks the registrar for nothing at vote time. When registration
closes, the registrar publishes the whole leaf set to IPFS, and its content identifier goes
on-chain in the same transaction as the root. The booth downloads the set, rebuilds the tree in
the browser and works out its own path, so the backend never learns which leaf is voting. What
is left is the network address the ballot comes from, which is a stated non-guarantee. So
secrecy against our own operator is conditional: it holds if the relayer is run separately from
the registrar, or if the voter submits directly. Against the chain it is unconditional, because
no on-chain data links an address or identity to a ballot."

> **The design.** Step 4 of the ballot flow builds the path locally. The published leaf set
> lets auditors recompute the root and voters build their paths. It also keeps a second point
> of failure off the vote path: a registrar that refused to serve one voter would be a silent
> censor, because direct submission bypasses the relayer, not the registrar.

### 2. The relayer reads the choice and decides what to forward

**The question.** "Your relayer reads the candidate choice and chooses what to forward. What
stops it dropping only the ballots for the candidate it dislikes, and how would anybody
notice?"

**Why it bites.** Separately, reading the choice and choosing what to forward look like small
costs. Together they can change the result unseen, because turnout below roll size is normal.
The workaround, direct submission, does not suit the people we designed for: E2 sets the
voter's holding to zero, E3 tests people who have never used a wallet, and the Phase 5 plan
pre-funds only two or three audience wallets.

**The answer.** "That is the strongest attack on our design, and we state it as one attack.
A relayer that reads the choice and picks what to forward can bias the result without it
showing in turnout. We limit it; we do not remove it. The relayer signs a receipt for every
ballot it accepts, so a dropped ballot is a broken signed promise. If no transaction hash
appears before a deadline, the booth warns the voter and offers direct submission. Removing the
attack needs encrypted ballots or several independent relayers, and we build neither. What does
hold is that the relayer can target a candidate but not a person, because nothing in the ballot
says who the voter is."

> **The design.** One attack, with the receipt and deadline as limits. Do not say direct
> submission removes the privacy cost. It swaps a relayer that sees an unattributed choice for
> a funded address on a permanent public ledger, and whoever funded that address can identify
> the voter even more easily.

### 3. The roll-size bound, and who detects stuffing

**The question.** "Which line of contract code stops accepted ballots outnumbering the roll you
declared? And if your registrar enrols two hundred people who do not exist, who finds out?"

**Why it bites.** Two easy answers are both wrong. "Ballots cannot outnumber the roll" does not
follow from the cryptography: a Merkle root does not include a leaf count, and the root and roll
size are two separate values set by the same registrar. Without a contract check, nothing
enforces it. And "publishing the roll size makes stuffing detectable" means almost nothing,
because the registrar picks that number, registration is voluntary, and nobody knows the true
figure.

**The answer.** "One mechanism and one admission. The contract enforces the bound:
`VoterRegistry` stores the roll size next to the root, and `castVote` requires that spent
nullifiers never exceed it. That is one comparison against a stored value, and it makes the
bound a rule, not an observation. We do not claim detection, because any check compares against
a number supplied by the party it should catch. What we get is weaker: the room for fake voters
is fixed and public before any ballot exists, so a dishonest registrar must pick its number
before knowing how the vote is going, and that number stays public forever. A hosted system can
add rows at close of poll, knowing the gap. Roll
correctness is a stated non-guarantee. The real fix is to stop trusting one registrar: split the
role across several parties, or have observers appointed by the candidates co-sign the leaf set
before the root is frozen. We built neither; it is future work."

> **The design.** The cap is in `castVote`, its counter write is declared in A1, and a
> non-empty leaf-set CID is required before entering the Voting phase. The honest summary of the
> project: DVote removes the operator from the ballot box and the count, but one party still
> controls who is allowed to vote.

### 4. A dropped registration leaves the voter with no evidence

**The question.** "A voter registers, the registrar drops their commitment, and they find out
at vote time when the root is already frozen. What evidence do they have that they ever
registered?"

**Why it bites.** Section 2 makes exactly this complaint about the hosted system: a deleted
voter only sees that they cannot get in, and can only file a support ticket with the party that
deleted them. Exclusion is also the cheaper attack: dropping fifty commitments from one hostel
is quieter than inventing two hundred voters.

**The answer.** "That is the failure we blame the hosted system for, and the two fixes cost
almost nothing. First, the registrar signs a receipt over the commitment and election id, so an
excluded voter has evidence anyone can check against the published leaf set. A support ticket
becomes a public accusation. Second, the booth already downloads the leaf set, so it checks that
the voter's own commitment is there and warns them if not. The set is published when
registration closes and voting opens later, so the check has a window to be useful. The
authority can cancel until voting opens, so an exclusion found then can be fixed by running
registration again."

> **The design.** Roll correctness is its own non-guarantee. The receipt and the
> check-your-own-commitment step are part of the registration and ballot flows.

### 5. Groth16 needs a trusted setup

**The question.** "Who ran the trusted setup for the Semaphore circuit you are using, and what
happens if somebody kept the toxic waste?"

**Why it bites.** The whole eligibility guarantee rests on an assumption you cannot see in the
contract or the proof. In a security project, an unnamed assumption is worse than a named
limitation. The setup is required by the proof system and circuit, so using someone else's
files inherits the assumption rather than avoiding it.

**The answer.** "Eligibility rests on the Semaphore circuit's phase-two ceremony, built on the
perpetual Powers of Tau, with many independent contributors. We use the published ceremony files
and check their hashes against the Semaphore repository, since we could not run a credible
ceremony on this schedule. If every contributor colluded, fake membership proofs would verify
and we could not tell from the proofs alone. Cast ballots would not become linkable, because
zero-knowledge does not depend on the setup. This is also why the on-chain cap matters: a fake
proof still cannot push the count past a number fixed before voting."

> **The design.** The design section names the ceremony, the assumption and the hash check, and
> presents the cap in `castVote` as the built-in answer to a broken setup.

### 6. C1 is flat by construction, and tier 2's ballot line is not flat

**The question.** "What measured result would falsify C1? You write one 32-byte root whether
the tree has ten leaves or a hundred thousand."

**Why it bites.** Two points. The registration result cannot come out any other way, so it is
arithmetic, not an experiment, and needs a baseline next to it to mean anything. Worse, a
blanket "flat" prediction is wrong for tier 2's ballot, which sends a log2(n) authentication
path in calldata: at roughly 500 to 600 gas per level it rises by seven to eight thousand gas
from depth 4 to depth 17. Our own Phase 1 snapshot would disprove a plain "gas does not grow" claim.

**The answer.** "Yes, the registration line is flat by design. Its real job is to catch a bug
that adds an O(n) cost, like storing commitments on-chain or emitting the leaf array in an
event, so its failure condition is strict: exact equality across all five roll sizes. The more
interesting claim: tier 2's ballot cost grows with the log of the roll because the path goes in
calldata, while tier 3's is flat because the path becomes a private input to a proof whose size
never changes. So the anonymity layer removes the log factor, at a higher fixed cost. C1 is
three predictions: registration flat, the tier 3 ballot flat to within one percent, the tier 2
ballot rising with log2(n). Next to the registration line is its baseline, on-chain enrolment:
one leaf insertion per voter at roughly 22,100 gas, rising linearly. That line comes from either
a throwaway registration contract kept only for measurement or the per-voter storage cost, and
C1 records which."

> **The position.** Say up front that tier 3 is expected to cost more per ballot at every roll
> size we can measure, so the graph is not read as a cost claim. The off-chain side grows too:
> registrar tree-build time, leaf-set size, and browser time to rebuild the tree and recompute
> the root are where the cost moved.

### 7. The relayer can be drained with junk proofs

**The question.** "I send you ten thousand ballots with fresh random nullifiers and garbage
proofs from a few hundred addresses. What happens to your relayer's balance?"

**Why it bites.** The obvious defences fail. With only a nullifier pre-check, rate limiting and
a daily cap, every junk ballot passes the nullifier check, gets sponsored, runs the pairing check
on-chain and reverts, at roughly 250k gas each. The daily cap just sets the price of shutting
down gasless voting on demo morning.

**The answer.** "The defence is cheap and complete: the relayer verifies the Groth16 proof
off-chain before spending anything. snarkjs does it in milliseconds, with no chain access, and
checks the root, scope and signal at once. After that, the relayer's total possible loss is
limited by the roll size, because a valid proof needs an enrolled identity and each identity
gives one usable nullifier per election."

> **The design.** Off-chain proof verification comes before sponsorship, with per-nullifier rate
> limiting and the daily cap behind it, not in front.

### 8. The anonymity set is the roll, and the demonstration is the oracle

**The question.** "How large is the anonymity set for the first ballot cast in your
demonstration?"

**Why it bites.** One. Ballot secrecy here depends on the anonymity set (the people who could
have cast a ballot), and it is easy to state the guarantee without that limit. Every `VoteCast`
shows the choice and bumps a public counter, so what each ballot says is public and only who
cast it is hidden. That is only as strong as the number of possible voters at that moment. An
examiner who sees someone press the button at 14:03 and candidate B go up at 14:03 has
identified that voter using our own demo.

**The answer.** "Secrecy here means anonymity within the roll, not secret ballot contents, and
we state that limit. It weakens when few ballots fall in the same time window, and for the first
or last ballot of a tiny election it gives nothing. In the demo we enrol the whole room and cast
a batch of ballots before the live ones, so live voters are not the only possible source of a
tally change. A three-voter demo cannot show anonymity, and should not try."

> **The position.** State the limit with the guarantee, and the expected set size for the demo
> next to it. Keep this separate from item 1: this is about how many people could have voted;
> item 1 is about who can watch the request arrive.

### 9. The identity secret is a bearer credential

**The question.** "I pay a hundred rupees for your identity secret. What exactly have I
bought?"

**Why it bites.** More than "you can prove how you voted". A buyer with the secret computes the
proof and nullifier and casts the ballot themselves. The nullifier is deterministic and keys
cannot be changed, so the real voter can never cast a competing ballot. Selling the secret sells
the vote for good, checkably, remotely, and at scale from one laptop. Our domain, student body
and hostel elections, is exactly where organised pressure and vote buying are easiest.

**The answer.** "You have bought the vote itself, which is worse than it sounds. The secret is a
bearer credential: whoever holds it can use it, and nothing ties it to a person. So handing over
the secret and organised vote farming are their own non-guarantee, not a footnote under
coercion. Anonymity also removes the trail a centralized system leaves for an investigator,
which is one area where the system we criticise is better, and we say so. MACI solves this with
key rotation, using a key the coercer does not hold, and it is the top item in our future work."

> **The position.** Resisting coercion and letting voters check their own vote pull against each
> other: whatever lets you prove your vote to yourself also lets you prove it to a buyer. The
> scope statement: DVote is the right trade-off when the threat is an operator who controls the
> roll, the ballot box and the count, and the wrong one when the threat is a candidate with cash
> and a small electorate.

### 10. A lost secret disenfranchises permanently

**The question.** "I registered in October, cleared my browser, and came back to vote in
November. What happens?"

**Why it bites.** Nothing can be done. The secret is gone, its commitment in the frozen tree is
useless, and re-enrolling would mean changing a root we froze on purpose. Private browsing, a new
phone, a reinstalled browser, the browser clearing storage, or a shared lab machine all end the
same way, and registration is deliberately days before voting. E1 to E3 all measure a clean first
run on one device, the run least likely to fail, so raise this before the examiner does.

**The answer.** "This is a real gap, not a scope choice. The standard fix: derive the identity
from a wallet signature over a fixed message that includes the election id, as Semaphore
deployments normally do. Then the secret can be recreated on any device and never needs storing.
The cost is assuming the voter still has their wallet, which is weaker than assuming the same
browser profile. Without that, the cheap fix is a recovery phrase shown at registration for the
voter to save. The honest boundary: re-registering works while registration is open and is
impossible once the root is frozen."

> **The position.** The recovery story and re-registration boundary are stated openly. Returning
> on a second device is a known gap, not a measured parameter: whether a voter enrolled in one
> browser profile can vote from another, and in how many steps.

### 11. The go/no-go is conditional on M1, not on the calendar

**The question.** "What is your plan if M1 lands on 18 October instead of 11 October?"

**Why it bites.** A decision tied to a fixed date decides nothing here. Whether in-browser proving
works on a phone cannot be judged until M1 exists, because Phase 2 is built on tier 2. M1 is due
11 October, with seven days of slack before the 18 October cutoff, and Phase 1 is not a prototype. In fourteen days it needs
the state machine, the factory with clones, `castVote` with Merkle verification, a Foundry test
suite above 80 percent, TypeScript and Solidity tree builders that agree bit for bit, a Fastify
service, a schema, an indexer, wallet connect, the admin console and a ballot screen.

**The answer.** "So our decision is conditional: one week after M1 actually lands, or
immediately if M1 has not landed by 18 October, because then the schedule is the problem, not
the technology. There is a second fallback with its own date. Tier 2 is a complete working
voting system, not half of tier 3, so the worst case is a demo without anonymity, not no demo.
That call is made on 1 November, a week before the freeze, not discovered at the freeze.
Server-side proving covers only one way Phase 2 can fail. It does nothing for the relayer or the
contract-side proof wiring, and it moves the identity secret onto our server, a privacy loss we
would document, not hide. The relayer risk has its own answer: the demo can use direct submission
from pre-funded wallets, which costs us parameter E2 but not the election."

> **On the hours.** If asked whether eight weeks is realistic, do not claim it is free time. The
> phase budget assumes the hours available alongside other coursework, and the 8 November feature
> freeze is partly there to absorb exam periods. Do not offer a split of the work in the room or
> in the report.

### 12. Smaller points, stated rather than defended

| Point | The position |
| :-- | :-- |
| Who is allowed to finalize an election | The closing steps are permissionless: once their timestamps pass, anyone can close voting and finalize. Only configuration and cancellation, both before voting opens, belong to the authority; every other step, including opening registration and voting, is open to anyone once its time passes. D5 tests an observer finalizing over the authority's objection |
| Crediting the EIP-712 signature with stopping a relayer altering a ballot | The proof stops that, because the signal is a public input. ERC-2771 is not a security boundary here; we keep it for the request deadline, one code path shared with direct submission, and an audited implementation. If A1 goes over budget, dropping the forwarder is the first saving |
| Listing OpenZeppelin `MerkleProof` and Semaphore as if tier 3 upgraded tier 2's tree | They are different trees: keccak over sorted pairs versus Poseidon in a LeanIMT. A keccak root is not a valid circuit input, as it is not kept below the field modulus. Phase 2 replaces the tree builder and what the registry treats as a root. Verification uses the standalone Semaphore verifier with our own root, and the tree depth fixed in the contract, not taken from the caller |
| Extrapolating to ten crore voters at INR 5 crore | Throughput runs out long before money: about 12 ballots a second is roughly three months of all the block space. Quote one lakh. Ten crore also contradicts the scope set in Section 2 |
| Proving time of roughly one to three seconds | An expectation from published desktop benchmarks, so a hypothesis that B2 measures. What would really trigger the fallback is phone memory running out or the file download, and both go in the risk table |
| Whether the timing should include wallet installation | Voting needs no wallet: the proof shows eligibility and the signing key is created in the browser. We measure the no-wallet path and report wallet install separately as the fallback cost |
| "An observer can verify the tally even if every service we operate is lying" | Too broad. Narrow it: no special access is needed, and an auditor can use any provider or their own node. We run no light client in the browser, so someone who trusts nobody must run a node |
| A relayer accepting a ballot near the close of voting and submitting it after | The ERC-2771 deadline expires before voting closes, relayed submission is refused in the last few minutes, and a receipt appears only once a confirmed transaction hash exists |

### Where each of these lives in the report

Use this to find the full wording. If an examiner quotes something that seems to contradict this table,
check the section and give the position below.

| # | The position in the report | Where |
| :-- | :-- | :-- |
| 1 | Booth rebuilds the authentication path from the published leaf set, not from the registrar; secrecy against our operator is conditional; the relayer is the only service needed during voting | Sections 3, 4 |
| 2 | Relayer reading and refusing to forward is one attack, limited by signed receipts and a client deadline; direct submission is a trade-off, not a privacy gain | Section 3 |
| 3 | Ballot count capped on-chain at the stored roll size; no detection claim; roll correctness a non-guarantee and future work | Sections 3, 4 |
| 4 | Signed registration receipt and a check-your-own-commitment step before voting | Sections 3, 4 |
| 5 | Trusted setup named, with the published setup files and the hash check | Sections 3, 4 |
| 6 | C1 as three predictions; tier 2's ballot line grows with log of the roll; off-chain cost grows with the roll | Sections 4, 5 |
| 7 | Relayer verifies the proof off-chain before sponsoring | Sections 3, 4, 6 |
| 8 | Ballot secrecy limited by anonymity set size; demo sized so the set is not one | Sections 3, 4 |
| 9 | Coercion a non-goal; handing over the secret its own non-guarantee; where the hosted system is better admitted in the domain section | Sections 2, 3 |
| 10 | A lost secret is the seventh non-guarantee; the booth offers a backup copy at registration | Section 3 |
| 11 | Go/no-go tied to M1; tier 2 as second fallback, decided 1 November | Section 6 |
| 12 | Permissionless closing steps; ERC-2771 credited correctly; tier 2 and tier 3 trees as a replacement; proving time a hypothesis; no-wallet path stated | Sections 3, 4, 5, 6 |

## Cheat sheet

**Contracts.** `ElectionFactory` (EIP-1167 clones, and the list of genuine elections), `Election`
(lifecycle, candidates, spent nullifiers, ballot counter, tallies), `VoterRegistry` (root, roll
size, leaf set CID per election), `TallyLib` (counting rules, plurality first), `VoteForwarder`
(OpenZeppelin `ERC2771Forwarder`). `castVote` rejects a ballot once spent nullifiers reach the
roll size stored next to the root.

**Lifecycle.** Created, Registration, Voting, Tallying, Finalized, plus Cancelled, reachable only
from Created or Registration, before voting opens. Every step depends on `block.timestamp` and
needs an explicit call. No step goes backwards.

**Events.** `ElectionCreated`, `VoterRootPublished`, `VoteCast`, `Finalized`. The audit dashboard
replays these four.

**Evaluation parameter families.** Fourteen parameters: A1 cost, B1 to B2 performance, C1 to C3
scalability, D1 to D5 security and correctness, E1 to E3 usability. **C1 is gas against roll
size, for rolls from 10 to 10^5, with three predictions: registration flat, tier 3 ballot flat,
tier 2 ballot rising slowly because the path is sent to the contract. Before the graph, say tier 3
is expected to cost more per ballot at every roll size we can measure. Registration is flat by
design, so the parameter that can really fail is C2: whether a phone can rebuild the tree and prove
for a large roll.**

**Before quoting any gas figure.** Nothing has been measured yet. Every number is a target we set
or a rough expectation from published figures, so say which. "We expect roughly 200k gas for the
proof check, and A1 measures it in November" is good. Stating it as fact is a claim you cannot
back up.

| Number | Value |
| :-- | :-- |
| `castVote` gas budget (A1) | under 400,000, a target, not a measurement |
| Groth16 proof | 8 field elements, 256 bytes, same at every tree depth |
| Cost per ballot | graded as gas (A1); a money figure is not a parameter, since it needs a gas price and exchange rate we do not control |
| Latency targets | B1 p95 under 30 s end to end, B2 p95 under 5 s proving on a mid-range phone |
| Repetitions | n at least 30 per data point, report median and p95 |
| Faucet reality | testnet faucets cannot fund a long load test, so throughput runs on a local node |
| Usability targets | E1 at most 4 steps, E2 zero ETH held, E3 over 80 percent of 10 users unaided |

| Date | What |
| :-- | :-- |
| 25/26 Sep 2026 | Evaluation 1: report, presentation, questions. No code required |
| 28 Sep to 11 Oct | Phase 1, M1: tier 2 working end to end locally, first gas snapshot committed |
| 12 to 25 Oct | Phase 2, M2: tier 3, anonymous and gasless on Sepolia |
| **M1 plus one week** | **Go/no-go on in-browser proving, tied to M1, not the calendar: one week after M1 actually lands, or immediately if M1 has not landed by 18 October. Fallback is server-side proving, with the privacy loss documented** |
| 26 Oct to 8 Nov | Phase 3, M3: feature freeze on 8 November |
| **1 Nov** | **Second decision, a week before the freeze: if no anonymous ballot has been cast on Sepolia by then, we demonstrate tier 2. Tier 2 is a complete voting system, so the worst case is a demo without anonymity** |
| 9 to 15 Nov | Phase 4: measurement campaign, C1 graph first |
| 16 to 19 Nov | Phase 5: three timed rehearsals, pre-funded wallets, recorded fallback video |
| 20/21 Nov 2026 | Evaluation 2: live demo, complete code, final report |

**Testbed.** Ethereum Sepolia for latency and the live demo; it is the Ethereum Foundation's
recommended testnet for building applications. Gas and throughput are measured on a local
Foundry node, where gas is deterministic and testing many roll sizes is free.

**Schedule honesty.** As in item 11: the phase budget assumes hours alongside other coursework,
and the 8 November freeze partly absorbs exam periods. Do not call it free time or offer a split
of the work.

**Six sentences worth having word-perfect.**

1. "The membership tree is built off-chain and only its 32-byte root is written on-chain, so
   registering a roll of ten and a roll of a hundred thousand is the same single storage write."
2. "The nullifier is a hash of the voter's identity secret and the election id. It is
   deterministic, so a second ballot reverts; one-way, so it says nothing about the voter; and
   tied to one election, so two elections cannot be linked."
3. "The proof says I know a secret whose commitment is one of the leaves under root R, without
   saying which leaf. So the anonymity set is the roll, and it is only as big as the roll."
4. "Against the chain, ballot secrecy is unconditional. Against our own operator it holds only if
   the relayer is run separately from the registrar, or if the voter submits directly."
5. "The audit dashboard reads the chain through a public RPC endpoint and never through our
   backend, which is why we can switch the backend off on stage and the tally still verifies."
6. "DVote removes the operator from the ballot box and from the count, but one party still
   controls who is allowed to vote."

And one about cost: gas per operation does not depend on electorate size; total gas grows
linearly with ballots cast, the registrar's work grows linearly with the roll, and proving time
depends on tree depth.

**Five things never to say.** "The vote is encrypted" (the choice is public). "Ballot secrecy"
on its own (say what it protects against and under what condition). "Publishing the roll size
makes stuffing detectable" (the registrar chose that number, and with voluntary registration
nobody knows the true one). "It is immutable, so it cannot be tampered with" (hash linking shows
tampering; consensus makes it hard). "It is decentralized because it is on a blockchain" (name
the six centralized pieces: registrar, relayer, authority, RPC provider, pinning service,
frontend host).

## Glossary

| Term | One line |
| :-- | :-- |
| **Anonymity set** | The people who could plausibly have cast a given ballot; here, the roll, shrunk by timing and metadata leaks |
| **Anvil** | Foundry's local EVM node: instant, free, deterministic, no peers or fee market |
| **Authentication path** | The sibling hashes and left/right positions from a leaf to the Merkle root; a private input in our circuit, built in the browser from the published leaf set, not fetched from the registrar |
| **BullMQ** | Redis-based job queue the relayer uses so a ballot is not lost if a worker crashes |
| **Calldata** | A transaction's input bytes, charged per byte; the proof and public signals travel here |
| **CID** | IPFS content identifier: a hash of a file, so it proves what the data is but not that anyone still serves it |
| **Commitment** | A hash published instead of a secret: hiding (reveals nothing) and binding (cannot later be opened to a different value) |
| **EIP-712** | Standard for signing typed structured data, used for the forwarding request the voter signs |
| **EIP-1167** | Minimal proxy standard: a few dozen bytes that pass every call to one shared implementation |
| **EIP-1559** | Fee system where the base fee is burned and only the priority tip goes to the validator |
| **ERC-2771** | Meta-transaction standard separating who pays gas from who is sending the call, via a trusted forwarder and `_msgSender()` |
| **EVM** | The deterministic stack machine on which every node re-runs contract bytecode |
| **Field element** | A number modulo the curve's field prime, about 2^254 for BN254; the basic unit a circuit works with |
| **Finality** | The point after which a block will not be reorganized out; being included is not being final |
| **Foundry** | Solidity toolchain (forge, cast, anvil); `forge snapshot` reports gas per function |
| **Gas** | The unit of EVM work; fee equals gas used times gas price |
| **Groth16** | The zk-SNARK scheme Semaphore v4 uses: fixed proof size, one pairing check to verify, needs a trusted setup per circuit |
| **Identity commitment** | The Poseidon hash of a voter's identity value, published as a leaf in the tree |
| **Identity secret** | The random value kept on the voter's device; the only thing that proves who a voter is |
| **Indexer** | Service that copies chain events into PostgreSQL so the dashboard loads fast; a cache, never the source of truth |
| **Leaf set** | The full list of identity commitments, published to IPFS when registration closes, with its CID on-chain next to the root; auditors recompute the root from it and the booth rebuilds the tree from it to get its own authentication path |
| **LeanIMT** | The incremental Merkle tree Semaphore v4 uses, with a depth that can grow, built with Poseidon |
| **MACI** | Minimal Anti-Collusion Infrastructure: resists coercion through key rotation, with a coordinator; out of scope here |
| **Meta-transaction** | A call the user signs but someone else submits and pays for |
| **Merkle root** | The single 32-byte value at the top of the tree; it commits to the whole voter roll |
| **Nullifier** | `H(identitySecret, electionId)`; one number per voter per election that makes a second ballot revert without identifying anyone |
| **Pairing check** | The elliptic-curve operation that verifies a Groth16 proof, run through EVM precompiles at roughly 200k gas |
| **Poseidon** | A hash function designed to be cheap inside a zk circuit; used for commitments, the tree and the nullifier |
| **Powers of Tau** | The shared phase-one ceremony that a Groth16 circuit's phase-two setup builds on |
| **Precompile** | A built-in contract at a fixed address that runs an expensive operation natively, such as the pairing check |
| **Public input / private witness** | Circuit inputs everyone sees versus inputs only the prover sees |
| **Receipts root** | The hash of all transaction receipts in the block header, which is why event logs are as trustworthy as state |
| **Relayer** | Our service that pays gas for a voter's ballot; the only service the vote path needs to stay up, and the party that can censor based on the choice |
| **Reorg** | A chain reorganization that replaces recent blocks and undoes their state changes |
| **Roll size** | The enrolment number the registrar publishes next to the root; `castVote` accepts no more ballots than this, and nothing proves the number honest |
| **Rollup** | A scaling layer that posts its data to Ethereum and inherits its security; a possible production target for a large electorate |
| **Scope** | The election identifier mixed into the nullifier so ballots cannot be linked across elections |
| **Semaphore v4** | The audited protocol for proving anonymous group membership; it supplies our circuit, verifier and nullifier scheme |
| **Signal** | The public input carrying the candidate choice, tied into the proof so it cannot be changed in transit |
| **Slither** | Static analyser for Solidity; run as part of the Phase 3 checklist, not reported as a parameter |
| **Soundness** | The property that a prover without a valid witness cannot produce an accepted proof |
| **SSTORE** | The EVM opcode that writes a storage slot |
| **Sybil resistance** | Resistance to one person enrolling many times; explicitly not guaranteed at our registrar |
| **Trusted forwarder** | The one contract address from which `Election` accepts an appended sender |
| **Trusted setup** | The per-circuit ceremony Groth16 needs; if its leftover randomness is kept, fake proofs become possible |
| **Zero-knowledge** | The property that a proof reveals nothing except that its statement is true |
| **zk-SNARK** | A succinct non-interactive proof: short, fast to verify in constant time, revealing nothing about the witness |
