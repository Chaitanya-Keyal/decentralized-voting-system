# Evaluation Parameters

Eval 1 asks us to *define* these; Eval 2 asks us to *demonstrate* them. Each parameter
below names what we measure, how, and what result would count as success. Targets are
hypotheses to test. We report what we actually get, including where we miss.

Five families: cost (A1–A5), performance (B1–B5), scalability (C1–C5), security and
correctness (D1–D9), usability and adoption (E1–E5). The identifiers are fixed here and
Eval 2 answers them one by one. Nothing has been built, deployed or measured, so no number
below is a result.

## A. Cost

| # | Parameter | Measurement | Target |
|---|---|---|---|
| A1 | Gas per operation | `forge snapshot` on `createElection`, `publishRoot`, `castVote`, `finalize` | `castVote` < 400k gas incl. Groth16 verification (a pairing check alone is ~200k, so this is tight) |
| A2 | Cost per vote in INR | A1 × gas price × token price, both stated beside the result | < ₹0.50 per ballot, as an illustration of the arithmetic rather than a forecast |
| A3 | Cost across fee markets | The single A1 gas figure priced under three fee regimes: Ethereum mainnet, Polygon PoS mainnet, Amoy | A band across a range of gas prices, not a point |
| A4 | On-chain vs IPFS metadata | Gas for a 2KB manifesto stored inline vs a 32-byte CID | Demonstrate the order-of-magnitude gap |
| A5 | Proxy deployment saving | Direct `Election` deploy vs `Clones.clone` | > 90% saving, confirming the EIP-1167 choice |

A3 prices gas rather than measuring it twice, and the earlier "same suite on Sepolia and
Amoy" definition is dropped for two reasons. Gas is a function of the EVM and the bytecode, so
an identical suite consumes identical gas on both chains and a second run would produce a
second copy of the A1 number; the entire difference is the fee market, gas price times token
price, and a testnet token has no market price, so the ratio has to be imported from mainnet
feeds either way. And the calendar closes it: Sepolia reaches end of life on 30 September 2026
while the first deployable contract lands with M1 in October, so there is no day on which a
live Sepolia and a working contract both exist. Sepolia is not used anywhere in this plan. The
name changed with the definition, because Polygon PoS is a checkpointed sidechain rather than
a rollup; A3 sets fee markets side by side over chains that execute the same bytecode, and we
do not call it L1 versus L2.

A1 reports the application-side costs as separate lines rather than one total, because those
are the lines we would re-examine if the 400k budget is missed. Three sit inside it. The
ERC-2771 wrapper is the largest: the ephemeral signing key that keeps a voter's ballots
unlinkable makes the forwarder nonce a fresh zero-to-non-zero write of about 22,100 gas per
ballot, before the request struct and the signature check are counted, and dropping the
forwarder is the first saving to take because the proof already binds the nullifier and the
candidate signal. The nullifier write is a second store of the same order. The roll-size
invariant is the third: `castVote` compares the count of spent nullifiers against the roll
size stored beside the root and reverts if it would exceed it, which is one comparison
against a value already in storage plus a warm counter write on the order of 3k gas. That is
the price of turning a claim about how many ballots can be accepted into a check the contract
performs, and A1 declares it rather than absorbing it.

## B. Performance

| # | Parameter | Measurement | Target |
|---|---|---|---|
| B1 | End-to-end vote latency | Wall clock: click → confirmed. p50/p95, n ≥ 30 on Amoy | p95 < 10 s on Amoy |
| B2 | Client proof generation time | `performance.now()` around proof build, by device class (laptop / mid-range phone); artifact download size and peak memory recorded beside the timing | p95 < 5 s on a mid-range phone |
| B3 | On-chain verification time | Gas + block inclusion delay for proof verification | Isolate ZK cost from base tx cost |
| B4 | Throughput | Concurrent ballots via the relayer on Anvil, ramp 1→200, sustained votes/min | Identify the knee of the curve |
| B5 | Indexer lag | Time from `VoteCast` emission to dashboard visibility | < 3 s |

B1's clock covers the whole ballot path, and that path grew. The booth downloads the
published leaf set, rebuilds the tree in the browser and derives its own authentication path,
so that work is on the voter's critical path and inside B1. B1 and C5 share a bottleneck and
are reported together.

The one to three second proving figure quoted elsewhere is an expectation taken from
published Semaphore benchmarks on desktop hardware, not a property of anything we have built.
B2 replaces it with a measurement. On a phone the failure that matters is not slowness: the
booth downloads several megabytes of circuit artifacts and runs them through snarkjs under a
mobile WASM memory ceiling, and applications of this class fail outright there more often
than they run slowly, so an outright failure counts as a failure and not as a missing data
point. B2 feeds the proving go/no-go, which is conditional on M1 rather than on the calendar:
it is taken one week after M1 actually lands, or immediately if M1 has not landed by
18 October. The first fallback, server-side proving, is recorded with its cost, since it
moves the identity secret onto the same operator the design exists to remove from the ballot
box. The second is that tier 2 is a complete working voting system, so the worst case is a
demonstration without anonymity rather than no demonstration.

## C. Scalability

| # | Parameter | Measurement | Target |
|---|---|---|---|
| C1 | Gas vs voter-roll size | Registration, tier 2 ballot and tier 3 ballot at rolls of 10 / 10² / 10³ / 10⁴ / 10⁵, measured locally | Registration and tier 3 ballot constant; tier 2 ballot logarithmic |
| C2 | Proof time vs tree depth | B2 across the same roll sizes | Logarithmic growth, not linear |
| C3 | Concurrent-voter ceiling | Load test until failure; record the failure mode | Locate and name the bottleneck (relayer? RPC? mempool?) |
| C4 | Candidate-count scaling | Gas vs 2 / 10 / 50 candidates | Confirm tally storage is O(1) per ballot |
| C5 | Off-chain cost vs roll size | Registrar tree-build time, published leaf-set size, and in-browser tree rebuild and root recomputation, at the same roll sizes as C1 | Practical in a browser at 10⁵ |

C1 is the parameter the architecture is read against most often, so it is worth scoping. "Gas
is flat" is too broad to be true, and C1 makes three separate predictions instead.

1. **Registration gas is constant**, and constant by construction: publishing a roll writes
   one `bytes32` root, one roll size and one CID whatever the roll contains. Plotting that is
   arithmetic and not a discovery, and we say so rather than presenting a horizontal line as a
   result. Its value is as a regression guard, so the refutation condition is strict: exact
   equality across all five roll sizes, and any variation at all means an O(n) term entered the
   implementation, most plausibly an event carrying the leaf array or commitments written to
   storage. The honest baseline it should be read against is on-chain enrolment, one leaf
   insertion per voter at roughly 22,100 gas plus a 21,000 transaction base if unbatched, which
   is what Semaphore's own group management contracts do. That baseline is either produced by a
   throwaway registration contract kept as a measurement artifact or computed from the
   per-voter storage cost, and C1 records which.
2. **The tier 3 ballot is constant in the roll.** A Groth16 proof is the same size and the
   same pairing check at every tree depth, and the authentication path never reaches calldata
   because it is a private witness. Predicted: `castVote` gas varies by under 1% between 10¹
   and 10⁵ with no monotone trend. A larger spread or a consistent rise refutes it, and the
   likely causes would be a depth-dependent public input or a verification key chosen by the
   caller rather than pinned in the contract.
3. **The tier 2 ballot rises with the logarithm of the roll.** Tier 2 sends the path in
   calldata, one 32-byte sibling per level at 16 gas per non-zero byte plus a hash per level,
   so each level costs on the order of 500 to 600 gas. Depth runs from 4 at a roll of 10 to 17
   at 10⁵, giving a predicted increase of roughly 7k to 8k gas across the range. A flat tier 2
   line would refute the calldata pricing model; a rise much steeper than logarithmic would
   mean the verification loop is not doing what we assume.

Stating all three in advance also stops the graph being read as a claim we are not making. The
tier 3 line is expected to sit *above* the tier 2 line at every roll size we can measure, and
the curves are not expected to cross in any realistic range, because one pairing check costs
far more than seventeen levels of calldata and hashing. That is the price of anonymity, not a
cost win, and A1 and B3 price it. What the ZK layer removes from the ballot is the logarithmic
factor, not the constant; the registration saving belongs to the Merkle commitment, since
tier 2 publishes a root as well and has flat registration gas with no zero knowledge in it.

C5 answers where the work went. Moving the tree off-chain does not remove the O(n) work, it
relocates it, and the relocation is worth several orders of magnitude, because a Poseidon hash
off-chain costs microseconds while a storage slot on-chain costs about 22,100 gas. It still
lands on somebody: the registrar builds the tree, the leaf set is published and downloaded,
and each auditor recomputes the root independently, so root verification is O(n) per auditor
rather than O(n) once. It now lands on the voter too, because the booth rebuilds the tree
locally to derive its own path, which is what keeps the registrar out of the ballot path. At
10⁵ commitments the leaf set is on the order of 3 MB and the tree about 2 × 10⁵ Poseidon
hashes, and whether that is seconds or minutes on a mid-range phone is a real unknown. This is
where the scalability story can fail: a flat gas line printed without these figures beside it
would be a misleading graph, and a booth that cannot rebuild the tree at 10⁵ would push the
ballot path back to a registrar-supplied authentication path, which the design rejects on
privacy grounds. Of C1's three predictions only the registration line is settled in advance;
the two ballot lines can be refuted by measurement, and C2 and C5 are where this case is most
likely to break.

## D. Security and correctness

| # | Property | How we demonstrate it |
|---|---|---|
| D1 | Double-vote resistance | Foundry test: replay the same nullifier, assert the named revert. A ballot past the stored roll size must revert too. Plus a fuzz campaign over nullifier collisions. |
| D2 | Eligibility enforcement | Test: a structurally valid proof against a *wrong* root must revert. Ceremony artifact hashes checked against the Semaphore repository, in the test suite. |
| D3 | Ballot secrecy | Attempt deanonymization over all chain data; report the operator condition and the anonymity set size beside the result |
| D4 | Individual verifiability | Before voting, the booth finds the voter's own commitment in the published leaf set; after voting, the voter locates their own ballot tx |
| D5 | Universal verifiability | Recompute the root from the published leaf set and the full tally from raw logs, with our backend switched off |
| D6 | Authority containment | Tests: an observer closes voting and finalizes; the authority cannot vote and cannot alter a frozen root |
| D7 | Static analysis | Slither: report findings by severity, with a written disposition for each |
| D8 | Test coverage | `forge coverage`; target > 90% line coverage on `src/` |
| D9 | Reorg safety | Simulate a chain reorg on Anvil, verify the indexer self-heals |

Each negative test asserts the named revert reason, because a test that passes because the
contract silently accepted nothing is not evidence.

D2 rests on an assumption we name rather than assume. Groth16 needs a circuit-specific trusted
setup, so eligibility holds only if the Semaphore circuit's phase-two ceremony was not
compromised in its entirety. We use the published artifacts and verify their hashes rather
than running our own ceremony, and that hash check belongs in the suite rather than in
somebody's memory. If every contributor colluded, forged membership proofs would verify and
nothing in the proofs themselves would show it. That is one reason the roll-size invariant
earns its 3k gas in A1: it bounds what forged proofs can do to the count even though it cannot
detect one.

D3 is a negative claim and its scope travels with it. Against the chain the expected answer is
that nothing is linkable, since no on-chain value ties an address or an identity to a ballot.
Against the operator the claim is conditional and D3 states the condition: the relayer reads
the candidate choice in every ballot it forwards and sees the source network address, so
secrecy from the operator holds when the relayer is run separately from the registrar, or when
the voter submits directly. D3 also reports the anonymity set size, because the hiding is
worth the number of plausible authors in that window and no more; in a demonstration roll of a
few dozen, with a public running tally and ordered timestamped ballots, that number is small,
and printing it is more honest than claiming the set is the whole roll.

D4 is two checks because recomputing the root proves only that the leaves match the root and
says nothing about whose commitments those leaves are. The pre-vote check is what makes leaf
substitution visible to the person it targets. A failure in D1, D2 or D6 is a design defect
rather than a tuning problem and would block the live demonstration.

## E. Usability and adoption

| # | Parameter | Measurement | Target |
|---|---|---|---|
| E1 | Steps to cast a ballot | Count of user actions from landing page to receipt | ≤ 4 |
| E2 | Voter gas burden | POL a voter needs to hold to register and vote | **Zero**: the point of the relayer |
| E3 | Task success rate | 10 users unfamiliar with crypto attempt a vote, unaided | > 80% unaided completion |
| E4 | Time to first vote | Wall clock on the no-wallet path; wallet installation timed separately | < 5 min |
| E5 | Returning on a second device | A voter enrolled in one browser attempts to vote from another | A working path exists, or the gap is reported |

E3 is worth doing properly. A voting system only meaningfully decentralizes power if ordinary
people can actually use it, and "we tested it on 10 non-crypto users" is a stronger claim in
the report than any gas number. *Unaided* is the load-bearing word: a group member prompting a
participant at the hard step invalidates the measurement, so sessions are observed silently
and the points where participants stall are findings in their own right.

E4 times the no-wallet path because that is the path a voter takes. Eligibility comes entirely
from the proof, `Election` never checks the appended sender against the roll, and the booth
signs the forwarding request with a key it creates in the browser, so casting a relayed ballot
installs no wallet. Wallet installation is timed separately, as the cost of the
direct-submission fallback and of the admin and registrar surfaces.

E2 is also why direct submission is not a general remedy against a censoring relayer. A voter
holding zero POL cannot take it, so a relayer that reads the choice and declines to forward it
is a result-altering attack on exactly the population E2 describes. The design bounds that
with a signed receipt per accepted ballot rather than claiming to remove it.

E5 exists because E1 to E4 all measure a clean first run on one device, which is the run least
likely to fail. The identity secret lives on the voter's device, registration is days ahead of
voting, and a cleared browser, a reinstalled browser, a shared lab machine or storage eviction
all produce the same state: a voter enrolled in a frozen root who cannot prove it. After the
root freezes there is no remedy, so E5 reports the outcome plainly whichever way it comes out.

## Benchmark methodology

- **Harness** lives in `bench/`, committed alongside raw CSV output so results are reproducible.
- **Repetitions:** n ≥ 30 per data point; report median and p95, never a single run.
- **Isolation:** gas (A1, A4, A5, C1, C4) is deterministic and measured locally with
  `forge snapshot`, so no network is needed. Throughput ceilings (B4, C3) run on Anvil to remove
  network noise. Client-side and off-chain timings (B2, C2, C5) run on the devices themselves,
  with the device named beside every number. Only end-to-end latency (B1, B5) needs a live
  testbed, and that testbed is Polygon Amoy. A3 needs no network at all, since it prices the A1
  figure under published fee conditions, and no measurement in this plan depends on Ethereum
  Sepolia, which retires before our first contract exists.
- **Faucet economics:** at roughly 0.009 POL per ballot and ~0.1 POL per faucet claim per day,
  a 200-ballot ramp is about 1.8 POL and a ceiling run repeats that ramp at every load level,
  so sustained load on Amoy is not fundable inside our window. That is the second reason B4 and
  C3 live on Anvil. Accumulate POL from several faucets ahead of the latency sampling.
- **Controls:** record gas price and block number at execution, RPC provider, commit SHA,
  deployed contract addresses, and the leaf-set CID the run was made against. Client-side
  numbers also record device model, browser and version, and whether proving ran in a Web
  Worker or on the main thread, since that distinction is itself one of the comparisons.
- **Honesty:** every target above is a hypothesis. Missed targets get reported with an
  analysis of why. That is a better result than a table of green checkmarks.
