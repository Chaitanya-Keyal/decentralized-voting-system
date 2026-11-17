#!/usr/bin/env node
// Reduces the raw timing CSVs in bench/results to a median and 95th percentile per device, roll
// size and phase, for the report's graphs: results/timings-<device>.csv -> summary-<device>.csv.
// The 95th percentile is the nearest-rank one, so with few runs it is the slowest run.
//
//   node bench/scripts/summarize.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../results/", import.meta.url).pathname;

function quantile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

for (const file of readdirSync(dir).filter((name) => /^timings-.+\.csv$/.test(name))) {
  const [header, ...lines] = readFileSync(dir + file, "utf8")
    .trim()
    .split("\n");
  const columns = header.split(",");
  const at = (row, name) => row[columns.indexOf(name)];
  const groups = new Map();
  for (const line of lines) {
    const row = line.split(",");
    const key = `${at(row, "roll_size")},${at(row, "phase")}`;
    groups.set(key, [...(groups.get(key) ?? []), Number(at(row, "ms"))]);
  }
  const rows = [...groups.entries()]
    .map(([key, values]) => {
      const sorted = values.sort((a, b) => a - b);
      return `${key},${sorted.length},${quantile(sorted, 0.5).toFixed(1)},${quantile(sorted, 0.95).toFixed(1)}`;
    })
    .sort((a, b) => Number(a.split(",")[0]) - Number(b.split(",")[0]));
  const out = file.replace(/^timings-/, "summary-");
  writeFileSync(dir + out, ["roll_size,phase,runs,median_ms,p95_ms", ...rows].join("\n") + "\n");
  console.log(`Wrote ${out}`);
}
