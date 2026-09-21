# Roadmap

Two fixed dates anchor everything:

- **Eval 1** (25/26 Sep 2026) · problem, stakeholders, evaluation parameters, report. *No code required.*
- **Eval 2** (20/21 Nov 2026) · live demo, complete code, final report.

That leaves roughly **one week of writing** and then **eight weeks of building**. The plan
front-loads risk: the two things most likely to derail the project (zero-knowledge proving
in a browser, and the gasless relayer) are attacked in Phase 2, not at the end.

The system is described in three tiers. Tier 1 is the conventional approach and is not
built; it exists as the contrast. Tiers 2 and 3 are both working systems, shipped in that
order.

| Tier | Built in | Eligibility | Ballot privacy | Voter pays gas |
|---|---|---|---|---|
| 1 | not built (the contrast) | on-chain roll | none: ballots linked to addresses | yes |
| 2 | Phase 1 | Merkle root | none | yes |
| 3 | Phase 2 | Semaphore ZK proof | anonymous, nullifier-protected | no |

Shipping tier 2 before tier 3 is deliberate for two reasons. It means the cost of
anonymity and gas sponsorship is *measured* against a working baseline rather than
asserted, and it means the fallback described in Phase 3 is a complete voting system
rather than a half-finished tier 3.

Tier 3 is a replacement and not an extension, and the plan should not call it an upgrade.
Tier 2 is keccak256 over sorted pairs with OpenZeppelin `MerkleProof`; tier 3 is Poseidon
in a LeanIMT, because that is what the Semaphore circuit constrains. The tree builder, the
verification path and the registry's notion of a root are rebuilt. What carries across is
the lifecycle, the factory, the indexer and the gas baseline, which is most of what Phase 1
produces.

---

## Phase 0 · 18–26 Sep · Eval 1

The deliverable is a document, not a program. No Solidity this week.

- Freeze scope, actors, and trust model
- Stakeholder requirements with justification (template §3)
- Proposed system design (template §4)
- Evaluation parameters (template §5)
- Implementation plan (template §6)
- Literature review and references (template §8)
- Presentation deck
- Repo scaffold: pnpm workspace, Foundry init, CI skeleton

The report itself is written in LaTeX under `reports/` (`make eval1`), which mirrors the
section structure of the `.docx` template exactly.

The design docs map onto the report template directly: §3 ← `architecture.md` §1,
§4 ← `architecture.md` §3–6, §5 ← `evaluation-parameters.md`, §6 ← this file. Adapt the
prose; don't start from a blank page.

**Exit criteria:** report submitted, deck rehearsed end to end, `pnpm install && forge test`
green on a hello-world contract.

---

## Phase 1 · 28 Sep – 11 Oct · M1: a vote works end to end

Ship the boring version first. Plurality voting, plain Merkle-proof eligibility, no
anonymity, no gas sponsorship, Anvil only. Everything after this lands against a working
system rather than being an integration gamble.

**Contracts**
- `Election` lifecycle state machine; `ElectionFactory` with EIP-1167 clones
- `VoterRegistry` storing the root, the roll size and the leaf-set CID, all three written in
  one transaction and frozen when registration closes
- `castVote` with `MerkleProof` verification
- Foundry test suite, > 80% coverage

**Crypto**
- Merkle tree builder in `packages/shared`
- Proof generation and verification agreeing bit-for-bit across TypeScript and Solidity
- The booth rebuilds the tree from the published leaf set and derives its own authentication
  path; the registrar is not asked for one, and is not contacted at vote time

**Backend**
- Fastify skeleton, Postgres schema
- Registrar: commitment intake, a receipt signed over the commitment and the election id, and
  publication of the leaf set with the root, the roll size and the CID
- Indexer consuming `VoteCast` events on Anvil

**Frontend**
- Wallet connect, admin create-election flow
- Ballot UI hitting a real local contract

**M1 gate (11 Oct):** from a fresh clone, start Anvil, deploy, register 5 voters, cast 5
ballots from the browser, see the tally on the dashboard.

Commit the first gas snapshot here. A baseline now makes the Phase 2 ZK cost delta
measurable; a baseline taken after tier 3 lands is not a baseline.

---

## Phase 2 · 12–25 Oct · M2: anonymous and gasless, on the testbed

The highest-risk phase. Two hard things land together.

**Crypto**
- Poseidon LeanIMT replacing the tier 2 keccak tree; nullifier scheme
- Browser proving in a Web Worker, against the published Semaphore phase-two ceremony
  artifacts, with their hashes verified against the Semaphore repository rather than a
  ceremony of our own. The eligibility guarantee rests on that ceremony: if every
  contributor colluded, forged membership proofs would verify

**Contracts**
- `castVote` accepts a Semaphore proof; nullifier registry
- The ceiling check: `castVote` reverts once spent nullifiers would exceed the roll size
  already stored beside the root, one comparison against a value in storage
- `ERC2771Context` on `Election`, `VoteForwarder` deployed

**Backend**
- Relayer service: BullMQ queue, off-chain proof verification before anything is spent,
  nullifier pre-check, gas sponsorship, rate limiting, and a signed receipt for every
  accepted ballot

**Frontend**
- Proving UX with progress states for the expected 1–3 s wait, which is a figure carried over
  from published benchmarks on other hardware and not a measurement of this system
- Receipt screen, Amoy network switching, and the warning path that offers direct submission
  when no transaction hash appears before the deadline

**M2 gate (25 Oct):** a voter holding **zero POL** casts an **anonymous** ballot on
**Polygon Amoy**, and nothing on-chain links their address to their ballot.

**Contingency: one week after M1 actually lands, or immediately if M1 has not landed by
18 Oct.** The gate is conditional on the milestone rather than on the calendar, because what
it decides cannot be assessed before tier 2 exists: Phase 2 is built on top of it, so a gate
fixed to a date would fire on a day when no proving work had started if Phase 1 ran a week
late, and Phase 1 running late is the likeliest way this plan slips. Tying it to M1 is also
what stops it drifting into November, when no schedule would be left to act on it.

If valid proofs are not being produced on a phone at that point, proving moves to the server.
That fallback is weaker and would be reported as weaker: the identity secret leaves the
device, and the service that receives it is the same backend that runs the registrar and the
relayer, so it does not add a qualification to the trust model, it collapses privacy back
onto the operator. It also covers only one of the ways Phase 2 can fail, doing nothing for
the contract-side proof wiring and nothing for the relayer.

---

## Phase 3 · 26 Oct – 8 Nov · M3: feature freeze

- `TallyLib`, plus approval voting *only if* ahead of schedule
- Slither clean; `forge coverage` > 90%
- Reorg handling, proof caching, edge cases (empty roll, single candidate, tie)
- IPFS pinning of metadata and of the leaf set, with the CID written on-chain beside the root;
  indexer rebuild-from-genesis
- Backend-down resilience verified
- Audit dashboard with client-side tally re-derivation
- Usability test with 10 non-crypto users (parameter E3)
- Relayer deployed somewhere reachable from a phone, with a tunnel as backup

**Tier-3 gate (1 Nov):** a week before the freeze, and the second fallback. If an anonymous
ballot has not been cast on Amoy by then, tier 2 is what gets demonstrated. Tier 2 is a
complete voting system on its own rather than a half-finished tier 3, so the worst case is a
demonstration without anonymity rather than no demonstration. Tier 3 would then be reported
as unfinished, with whatever measurements exist, and the remaining fortnight goes to the
parameters tier 2 can answer.

**M3 gate (8 Nov):** feature freeze. After this date, only bug fixes, benchmarks, and
writing. Nothing new in the final two weeks; that is how demos break.

---

## Phase 4 · 9–15 Nov · Benchmarks and report

No feature work. Run the full measurement campaign from
[`evaluation-parameters.md`](evaluation-parameters.md).

- Full sweep of the A, B, C, D and E families, with no parameter left without either a
  committed number or a written statement of why it has none
- Raw CSVs committed to `bench/results/`; graphs generated from them by script, not by hand
- A3 is a desk calculation and not a second deployment. Identical bytecode consumes identical
  gas on either chain, so running the suite twice would produce two copies of the A1 number,
  and the whole of the difference between networks is a fee market denominated in worthless
  test tokens. A3 prices the single A1 figure under Ethereum mainnet, Polygon PoS mainnet and
  Amoy conditions, and reports a band across a range of gas prices rather than a point
- Eval 2 report drafted section by section against the template

Build the C1 graph (gas vs voter-roll size) first, and state what it carries. The
registration line is flat by construction, since one root, one roll size and one CID is one
write at any roll size, and tier 2 already has that flatness without any zero knowledge; it
is a regression guard, so the prediction is exact equality across the five roll sizes and any
variation at all means an O(n) term entered the implementation. The ballot lines are where C1
has something to report: tier 3 flat because the authentication path is a private witness,
tier 2 logarithmic because the path travels in calldata, and the tier 3 line expected to sit
above the tier 2 line at every roll size measured. That is the price of anonymity rather than
a cost win, and saying so before the graph exists keeps it from being read as a claim the
project is not making.

Record registrar tree-build time, published leaf-set size and in-browser tree reconstruction
time at the same roll sizes, and print them beside the flat line. The design relocates the
O(n) work off-chain rather than removing it, and a flat on-chain curve next to an audit
artifact nobody can process would be a misleading graph. If a browser cannot rebuild the
tree at 10⁵ commitments, the ballot path falls back to a registrar-supplied authentication
path, which the design rejects on privacy grounds, so this is where the scalability case is
most likely to fail.

---

## Phase 5 · 16–19 Nov · Rehearsal and buffer

- Three timed demo rehearsals on Amoy, on the actual presentation hardware and network
- Relayer wallet pre-funded; a second funded wallet as backup
- Two or three audience wallets pre-funded so voters can bypass the relayer if it fails
- Recorded video fallback in case campus Wi-Fi fails
- Final report proofread and submitted

Deliberate slack, though little genuine slack survives those commitments, which is why slip
is absorbed by the freeze rather than here. Something always breaks in the last week.

**Eval 2 · 20/21 Nov.**

---

## Demo script

Draft this in Phase 3, not Phase 5.

1. Authority creates an election; registrar enrols the audience as voters.
2. A batch of ballots is cast before any live one, because anonymity is bounded by the number
   of plausible authors at that moment and a tally that increments while one person presses a
   button shows the opposite of the property being claimed.
3. Two or three people vote live from their own phones, paying no gas.
4. Open the block explorer. Show that the ballots exist, and that **no on-chain field links
   them to the people who cast them**, within the anonymity set the room provides.
5. Attempt a double vote. Watch it revert.
6. **Kill the backend.** Show the audit dashboard still recomputing the correct tally from
   chain data alone, and a proof still buildable from the leaf set on IPFS.
7. Finalize; show the immutable result.

Step 6 is what distinguishes this from a database with extra steps. Rehearse it.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Browser ZK proving is slow or breaks | High | Web Worker; go/no-go one week after M1 lands, or immediately if M1 has not landed by 18 Oct; server-side proving as the fallback, with its privacy cost reported rather than glossed |
| Circuit artifacts exhaust the mobile WASM memory ceiling | High | The likelier failure than slowness, since a killed tab returns nothing rather than returning late. Artifact size and peak memory recorded beside every B2 timing; same gate as above |
| Tier 3 not working in time | High | 1 Nov gate: demonstrate tier 2, a complete voting system without anonymity, and report tier 3 unfinished with whatever measurements exist |
| Integration deferred to the end | High | M1 forces a working end-to-end path in week 2 |
| Relayer drained or spammed | Medium | Off-chain proof verification before anything is spent, which holds lifetime exposure to the roll size; nullifier pre-check and rate limiting sit on top of that bound rather than in place of it, and a daily cap alone does not bound it |
| Relayer drops the ballots for one candidate | High | Bounded, not removed: a signed receipt for every accepted ballot, so a dropped one becomes a signed promise it did not keep, and the booth warns and offers direct submission if no transaction hash appears before a deadline. Removing it needs encrypted ballots or several independent relayers, neither of which we build |
| Faucet drip too slow for load testing | Medium | Throughput tests run on Anvil; pre-fund Amoy wallets from multiple faucets, starting early |
| Relayer unreachable during the live demo | Medium | Free-tier deploy plus a tunnel; pre-funded wallets let voters bypass it entirely |
| Sepolia end of life (30 Sep) | Closed | We are not exposed: Sepolia is not used at all, everything deploys to Amoy with Anvil locally, and A3 is a desk calculation over fee regimes rather than a live Layer-1 run |
| Schedule slip late in the term | High | 8 Nov feature freeze exists specifically to absorb it |
