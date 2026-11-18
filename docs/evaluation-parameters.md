# Evaluation Parameters

Fourteen parameters across five families. Each names what is measured, how, and
what we expect or compare against. Security parameters name an adversary that
must fail.

This list was written for Evaluation 1, before anything was built, so it sets no
numeric targets. Predictions are about the shape of a result (for example, flat as
the voter list grows).

Section 6 of the Evaluation 2 report gives the measured value of each parameter.

## A. Cost

| # | Parameter | Measurement | What we report |
|---|---|---|---|
| A1 | Gas per operation | Gas snapshot per contract entry point, locally under mainnet's rules and on Sepolia under Glamsterdam's | Gas for tier 2 and tier 3 ballots; the difference is the cost of anonymity |

Gas is deterministic, so A1 measures the design rather than the market. A fiat cost per
vote is not a parameter: converting gas to money needs a gas price and an exchange rate the
project does not control, so it measures the market on a given day, not the system.

Gas does depend on the chain's rules. Sepolia runs Glamsterdam, whose EIP-8037
charges far more for new state than mainnet's current rules, so A1 is reported under
both: locally, and from transactions on Sepolia.

## B. Performance

| # | Parameter | Measurement | What we report |
|---|---|---|---|
| B1 | End-to-end vote latency | Wall clock, click to confirmation, on Ethereum Sepolia | Median and 95th percentile, next to Sepolia's block time |
| B2 | Client proof generation time | Timed in-browser, by device class | Median and 95th percentile per device; failures counted |

Both report the 95th percentile beside the median: the voter who waited is the
one who abandons the ballot. A device that cannot finish a proof at all counts as
a B2 failure, not a slow result.

Proving runs on the voter's device: on an Android phone it takes under two seconds
for lists up to 4,096 voters (B2).

## C. Scalability

| # | Parameter | Measurement | Expected shape |
|---|---|---|---|
| C1 | Gas vs voter-list size | Registration, tier 2 ballot, tier 3 ballot over a range of list sizes | Registration and tier 3 flat; tier 2 rising slowly |
| C2 | Booth time vs list size | Tree rebuild and proving, timed separately, across the same list sizes | Rebuild grows with the list; proving grows only with tree depth |
| C3 | Concurrent-voter ceiling | Load until failure on a local node | The component that fails first |

C1 is the central claim, and it is narrower than "gas does not grow with the
electorate". Two operations are constant in the size of the list: publishing it, and
casting a tier 3 ballot. Total election gas still grows with ballots cast, and
off-chain work still grows with the list.

C2 checks that the cost did not simply move to the client. The booth rebuilds the
tree locally so the registrar never learns who is voting, and that work is
linear in the size of the list; proving grows only with the tree's depth. This is where the design
is weakest: on one ARM64 core, rebuilding costs more than proving somewhere between 4,096 and
8,192 voters.

## D. Security and correctness

| # | Property | How it is demonstrated |
|---|---|---|
| D1 | Double-vote resistance | A replayed nullifier must revert, as must a ballot past the declared voter count |
| D2 | Eligibility enforcement | A valid proof against the wrong root, and a tampered proof, must revert |
| D3 | Ballot secrecy | Deanonymization attempt over all chain data; the operator condition reported beside the result |
| D4 | Verifiability | A voter finds their own ballot; an observer recomputes the tally with our backend off |
| D5 | Authority containment | An observer closes voting and finalizes; the authority cannot vote unless it is on the list, or alter a frozen root |

D2 holds only under the trusted setup assumption. D3 is conditional: against the
chain nothing should be linkable, but against the operator secrecy holds only
while the relayer runs separately from the registrar, or the voter submits
directly. D3 also reports the anonymity set size, which is small in a small election.

A failure in D1, D2 or D5 would be a design defect.

Static analysis, coverage and reorg handling are engineering checks rather than
evaluation parameters. Section 5 of the report gives the static analysis and
coverage results.

## E. Usability and adoption

| # | Parameter | Measurement | What we report |
|---|---|---|---|
| E1 | Steps to cast a ballot | User actions from landing page to receipt | The number of actions, and where users hesitate |
| E2 | Voter gas burden | ETH a voter must hold to register and vote | Must be zero, by design |
| E3 | Task success rate | Users unfamiliar with cryptocurrency, unaided; run as a simulation, with language models playing ten such users | How many finish, and where the others stop |

E2 is zero by design: a voter who must first acquire ETH narrows the electorate
to people who already hold cryptocurrency. That is also why direct submission is
no general answer to a censoring relayer.

E3 was run as a simulation, a cognitive walkthrough, and the report says so beside the
result.

## Benchmark methodology

Harness in `bench/`, raw output committed as CSV, graphs generated by script. Several repetitions per point, reported as a median
with the 95th percentile.

- **Gas (A1, C1)** is measured locally, since gas is deterministic given the same
  bytecode, calldata and gas rules. A1 is also measured on Sepolia, whose Glamsterdam
  rules differ.
- **Throughput (C3)** runs on a local node. Testnet faucet supply cannot fund
  sustained load.
- **Client timings (B2, C2)**: C2 on one ARM64 core in Node.js, and B2 in the
  browser on a laptop (Intel Core Ultra 7 256V) and an Android phone (Nothing
  Phone (3a)), each named in its result file.
- **End-to-end latency (B1)** runs on Ethereum Sepolia.

Every number carries its controls: gas price and block number, RPC provider,
commit hash, deployed addresses, and the device for client numbers.
