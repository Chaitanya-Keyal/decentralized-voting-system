# Evaluation Parameters

Eval 1 asks us to *define* these; Eval 2 asks us to *demonstrate* them. Each parameter
below names what we measure, how, and what result would count as success. Targets are
hypotheses to test. We report what we actually get, including where we miss.

## A. Cost

| # | Parameter | Measurement | Target |
|---|---|---|---|
| A1 | Gas per operation | `forge snapshot` on `createElection`, `publishRoot`, `castVote`, `finalize` | `castVote` < 400k gas incl. Groth16 verification (a pairing check alone is ~200k, so this is tight) |
| A2 | Cost per vote in INR | A1 × Amoy gas price × POL/INR | < ₹0.50 per ballot |
| A3 | L1 vs L2 cost | Same suite on Sepolia and Amoy | Quantify the L2 saving as a multiple |
| A4 | On-chain vs IPFS metadata | Gas for a 2KB manifesto stored inline vs a 32-byte CID | Demonstrate the order-of-magnitude gap |
| A5 | Proxy deployment saving | Direct `Election` deploy vs `Clones.clone` | > 90% saving, confirming the EIP-1167 choice |

## B. Performance

| # | Parameter | Measurement | Target |
|---|---|---|---|
| B1 | End-to-end vote latency | Wall clock: click → confirmed. p50/p95, n ≥ 30 on Amoy | p95 < 10 s on Amoy |
| B2 | Client proof generation time | `performance.now()` around proof build, by device class (laptop / mid-range phone) | p95 < 5 s on a mid-range phone |
| B3 | On-chain verification time | Gas + block inclusion delay for proof verification | Isolate ZK cost from base tx cost |
| B4 | Throughput | Concurrent ballots via the relayer on Anvil, ramp 1→200, sustained votes/min | Identify the knee of the curve |
| B5 | Indexer lag | Time from `VoteCast` emission to dashboard visibility | < 3 s |

## C. Scalability

| # | Parameter | Measurement | Target |
|---|---|---|---|
| C1 | Gas vs voter-roll size | Registration + vote gas at rolls of 10 / 10² / 10³ / 10⁴ / 10⁵, measured locally | **Flat.** The central claim of the off-chain-tree design and the most important graph in the report. |
| C2 | Proof time vs tree depth | B2 across the same roll sizes | Logarithmic growth, not linear |
| C3 | Concurrent-voter ceiling | Load test until failure; record the failure mode | Locate and name the bottleneck (relayer? RPC? mempool?) |
| C4 | Candidate-count scaling | Gas vs 2 / 10 / 50 candidates | Confirm tally storage is O(1) per ballot |

C1 is the parameter the whole architecture is built around. If the line isn't flat, the
design didn't deliver, and we report that outcome rather than hiding it.

## D. Security and correctness

| # | Property | How we demonstrate it |
|---|---|---|
| D1 | Double-vote resistance | Foundry test: replay the same nullifier, assert revert. Plus a fuzz campaign over nullifier collisions. |
| D2 | Eligibility enforcement | Test: valid proof against a *wrong* root must revert |
| D3 | Ballot secrecy | Show that no chain data links an address to a ballot; walk through a failed deanonymization attempt live |
| D4 | Individual verifiability | A voter locates their own ballot tx in the explorer |
| D5 | Universal verifiability | Recompute the full tally from raw logs with the backend switched off |
| D6 | Authority containment | Tests: the admin cannot vote, cannot alter a frozen root, cannot stop the count |
| D7 | Static analysis | Slither: report findings by severity, with a written disposition for each |
| D8 | Test coverage | `forge coverage`; target > 90% line coverage on `src/` |
| D9 | Reorg safety | Simulate a chain reorg on Anvil, verify the indexer self-heals |

## E. Usability and adoption

| # | Parameter | Measurement | Target |
|---|---|---|---|
| E1 | Steps to cast a ballot | Count of user actions from landing page to receipt | ≤ 4 |
| E2 | Voter gas burden | POL a voter needs to hold | **Zero**: the point of the relayer |
| E3 | Task success rate | 10 users unfamiliar with crypto attempt a vote, unaided | > 80% unaided completion |
| E4 | Time to first vote | Wall clock for a new user, wallet install included | < 5 min |

E3 is worth doing properly. A voting system only meaningfully decentralizes power if
ordinary people can actually use it, and "we tested it on 10 non-crypto users" is a
stronger claim in the report than any gas number.

## Benchmark methodology

- **Harness** lives in `bench/`, committed alongside raw CSV output so results are reproducible.
- **Repetitions:** n ≥ 30 per data point; report median and p95, never a single run.
- **Isolation:** gas (A1, A4, A5, C1, C4) is deterministic and measured locally with
  `forge snapshot`, so no network is needed. Throughput ceilings (B4, C3) run on Anvil to remove
  network noise. Only latency (B1, B5) and the L1/L2 comparison (A3) need a live testnet.
  Always state which environment produced a number.
- **Faucet budget:** at roughly 0.009 POL per vote and ~0.1 POL per faucet claim per day,
  a 200-vote run on Amoy is not fundable. This is why load testing lives on Anvil and only
  the latency sample (n ≥ 30) runs on the testnet. Accumulate POL from several faucets well
  before the measurement window.
- **Controls:** record gas price, block number, RPC provider, and commit SHA with every run.
- **Honesty:** every target above is a hypothesis. Missed targets get reported with an
  analysis of why. That is a better result than a table of green checkmarks.
