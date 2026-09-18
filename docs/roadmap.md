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

Shipping tier 2 before tier 3 is deliberate: it means the cost of anonymity and gas
sponsorship is *measured* against a working baseline rather than asserted.

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
anonymity, no gas sponsorship, Anvil only. Everything after this becomes an upgrade to a
working system rather than an integration gamble.

**Contracts**
- `Election` lifecycle state machine; `ElectionFactory` with EIP-1167 clones
- `castVote` with `MerkleProof` verification
- Foundry test suite, > 80% coverage

**Crypto**
- Merkle tree builder in `packages/shared`
- Proof generation and verification agreeing bit-for-bit across TypeScript and Solidity

**Backend**
- Fastify skeleton, Postgres schema
- Indexer consuming `VoteCast` events on Anvil

**Frontend**
- Wallet connect, admin create-election flow
- Ballot UI hitting a real local contract

**M1 gate (11 Oct):** from a fresh clone, start Anvil, deploy, register 5 voters, cast 5
ballots from the browser, see the tally on the dashboard.

Commit the first gas snapshot here. A baseline now makes the Phase 2 ZK cost delta
measurable.

---

## Phase 2 · 12–25 Oct · M2: anonymous and gasless, on a real testnet

The highest-risk phase. Two hard things land together.

**Crypto**
- Semaphore v4 group management and nullifier scheme
- Browser proving in a Web Worker

**Contracts**
- `castVote` accepts a Semaphore proof; nullifier registry
- `ERC2771Context` on `Election`, `VoteForwarder` deployed

**Backend**
- Relayer service: BullMQ queue, gas sponsorship, rate limiting, nullifier pre-check

**Frontend**
- Proving UX with progress states for the 1–3 s wait
- Receipt screen, Amoy network switching

**M2 gate (25 Oct):** a voter holding **zero POL** casts an **anonymous** ballot on
**Polygon Amoy**, and nothing on-chain links their address to their ballot.

**Contingency: decide by 18 Oct.** If browser proving isn't working, fall back to
server-side proof generation: weaker privacy, since the server briefly sees the identity
secret, but a working system. Document the tradeoff rather than shipping nothing. The
decision has a date so it can't drift into November.

---

## Phase 3 · 26 Oct – 8 Nov · M3: feature freeze

- `TallyLib`, plus approval voting *only if* ahead of schedule
- Slither clean; `forge coverage` > 90%
- Reorg handling, proof caching, edge cases (empty roll, single candidate, tie)
- IPFS metadata pinning; indexer rebuild-from-genesis
- Backend-down resilience verified
- Audit dashboard with client-side tally re-derivation
- Usability test with 10 non-crypto users (parameter E3)
- Relayer deployed somewhere reachable from a phone, with a tunnel as backup

**M3 gate (8 Nov):** feature freeze. After this date, only bug fixes, benchmarks, and
writing. Nothing new in the final two weeks; that is how demos break.

---

## Phase 4 · 9–15 Nov · Benchmarks and report

No feature work. Run the full measurement campaign from
[`evaluation-parameters.md`](evaluation-parameters.md).

- Full sweep: A1–A5, B1–B5, C1–C4, D1–D9, E1–E4
- Raw CSVs committed to `bench/results/`; graphs generated from them by script, not by hand
- Eval 2 report drafted section by section against the template

Build the C1 graph (gas vs voter-roll size) first; it's the thesis of the project. If the
line isn't flat, that's a finding worth the remaining time, and better surfaced now than
the night before.

---

## Phase 5 · 16–19 Nov · Rehearsal and buffer

- Three timed demo rehearsals on Amoy, on the actual presentation hardware and network
- Relayer wallet pre-funded; a second funded wallet as backup
- Two or three audience wallets pre-funded so voters can bypass the relayer if it fails
- Recorded video fallback in case campus Wi-Fi fails
- Final report proofread and submitted

Deliberate slack. Something always breaks in the last week.

**Eval 2 · 20/21 Nov.**

---

## Demo script

Draft this in Phase 3, not Phase 5.

1. Authority creates an election; registrar enrols the audience as voters.
2. Two or three people vote live from their own phones, paying no gas.
3. Open the block explorer. Show that the ballots exist, and that **nothing links them to the
   people who cast them**.
4. Attempt a double vote. Watch it revert.
5. **Kill the backend.** Show the audit dashboard still recomputing the correct tally from
   chain data alone.
6. Finalize; show the immutable result.

Step 5 is what distinguishes this from a database with extra steps. Rehearse it.

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Browser ZK proving is slow or breaks | High | Web Worker; 18 Oct go/no-go with a server-side fallback |
| Integration deferred to the end | High | M1 forces a working end-to-end path in week 2 |
| Relayer drained or spammed | Medium | Rate limiting, nullifier pre-check, capped daily budget |
| Faucet drip too slow for load testing | Medium | Throughput tests run on Anvil; pre-fund Amoy wallets from multiple faucets, starting early |
| Relayer unreachable during the live demo | Medium | Free-tier deploy plus a tunnel; pre-funded wallets let voters bypass it entirely |
| Sepolia EOL (30 Sep) breaks the comparison benchmark | Low | Amoy is primary; capture Sepolia numbers before EOL and treat them as historical |
| Schedule slip late in the term | High | 8 Nov feature freeze exists specifically to absorb it |
