# Benchmarks

The scripts that measure the evaluation parameters in
[`docs/evaluation-parameters.md`](../docs/evaluation-parameters.md). Raw results are committed as
CSV in `results/`, and what a script wrote is never edited by hand. Section 6 of the Evaluation 2
report draws its graphs from these files with pgfplots, and the slide generator
(`reports/slides/build-deck-eval2.js`) reads them too, both by column name, so keep the headers as
they are.

## Running

`gas` and `load` need a fresh Anvil node with the contracts deployed (`anvil`, then
`pnpm deploy:local` from the repository root). `booth` needs no chain.

```bash
pnpm --filter @dvote/bench gas                        # [max power of two, default 16]
BENCH_DEVICE=<name> pnpm --filter @dvote/bench booth  # [max power of two, default 16] [runs, default 5]
pnpm --filter @dvote/bench load                       # [loads, default 16,64,256]
node bench/scripts/summarize.mjs                      # every timings-<device>.csv to summary-<device>.csv
```

`load` also needs a relayer for that Anvil node, with `RELAYER_RATE_LIMIT` high enough to accept
the whole burst. `RELAYER_URL`, `BENCH_BLOCK_TIME` (default 12 seconds) and `BENCH_LABEL` (written
into the rows and the file name) are optional.

Two scripts run against Sepolia. `RPC_URL` defaults to a public endpoint. `sepolia` reads
throwaway testnet keys from the environment, listed at the top of `src/sepolia.ts`; `d3` needs no
key.

```bash
pnpm --filter @dvote/bench sepolia                                # [ballots per path, default 3]
IPFS_GATEWAY=<gateway> pnpm --filter @dvote/bench d3 <election address>
```

Two measurements come from outside `bench/`. The web app's `/bench` page times the booth in a
browser on any device and downloads `timings-<device>.csv`, which is then committed here. The
Sepolia browser test (`e2e/sepolia.spec.ts`; `E2E_SEPOLIA=1 AUTHORITY_PRIVATE_KEY=0x... pnpm e2e
--grep "on Sepolia"`, with the stack running against Sepolia) times each ballot from the click to
the booth seeing it counted. `E2E_SEPOLIA_VOTERS` sets the number of voters, and
`E2E_SEPOLIA_BURST=1` makes them all cast at once.

## Outputs

`<time>` is when the run started, in UTC, as `YYYYMMDDHHMM`.

| Source | Writes to `results/` | Parameter |
|---|---|---|
| `src/gas.ts` | `gas.csv` | C1 |
| `src/booth.ts` | `timings-<device>.csv` | C2, and the B2 baseline |
| `/bench` page in the web app | `timings-<device>.csv` | B2 |
| `scripts/summarize.mjs` | `summary-<device>.csv`, one per timings file | B2, C2 |
| `src/load.ts` | `load-<label>.csv` | C3 |
| `src/sepolia.ts` | `sepolia-gas-<time>.csv`, `sepolia-latency-<time>.csv` | A1 on Sepolia; B1 from submission to inclusion |
| `e2e/sepolia.spec.ts` | `b1-sepolia-<time>.csv`, or `b1-sepolia-burst-<time>.csv` | B1 |
| `src/d3.ts` | `d3-<election>.csv` | D3 |
| No script: the scores of the simulated usability test | `e3-simulated.csv` | E3 |

The local A1 figures come from the contracts' gas snapshot in `contracts/snapshots/`
(`pnpm gas:contracts`), not from this folder.
