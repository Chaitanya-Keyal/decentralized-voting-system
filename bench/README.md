# Benchmarks

Everything measured for the evaluation parameters lives here. Raw results are
committed as CSV, and every graph in the report is generated from them by
script, never by hand.

## Layout

| Path        | Contents                                               |
| ----------- | ------------------------------------------------------ |
| `results/`  | Real measurements, as CSV. Never edited by hand        |
| `fixtures/` | Made-up CSVs in the same format, for testing scripts   |
| `graphs/`   | PNGs generated from `results/`                         |

## CSV formats

The column names and values below are fixed; scripts may rely on them.

### `results/gas.csv`

| Column      | Type    | Values                        |
| ----------- | ------- | ----------------------------- |
| `tier`      | integer | `2` or `3`                    |
| `operation` | string  | `publish_roll` or `cast_vote` |
| `roll_size` | integer | number of registered voters   |
| `gas`       | integer | gas used by the operation     |

### `results/timings.csv`

| Column      | Type    | Values                                       |
| ----------- | ------- | -------------------------------------------- |
| `device`    | string  | a named device, e.g. `laptop-i7`, `pixel-6a` |
| `roll_size` | integer | number of registered voters                  |
| `phase`     | string  | `tree_rebuild` or `prove`                    |
| `run`       | integer | repetition number, starting at 1             |
| `ms`        | number  | duration in milliseconds                     |
