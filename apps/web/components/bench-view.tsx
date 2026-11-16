"use client";

import { Identity, identityTree, SNARK_FIELD, voterTreeDepth } from "@dvote/shared";
import { useState } from "react";

import { provingFiles, provingFilesSize } from "@/lib/artifacts";
import { proveInBrowser } from "@/lib/prover";

import { Button, Card, Field, Input, Notice, Spinner } from "./ui";

const SIZES = [16, 256, 1024, 4096, 16384, 65536];
const ELECTION = "0x1000000000000000000000000000000000000001";

interface Row {
  roll_size: number;
  phase: "tree_rebuild" | "prove";
  run: number;
  ms: number;
}

/** Random field elements: any of them is a valid leaf, and making them costs almost nothing. */
function fakeCommitments(count: number): string[] {
  const bytes = new Uint8Array(32 * count);
  for (let offset = 0; offset < bytes.length; offset += 65536) {
    crypto.getRandomValues(bytes.subarray(offset, offset + 65536));
  }
  return Array.from({ length: count }, (_, i) => {
    let value = 0n;
    for (const byte of bytes.subarray(i * 32, i * 32 + 32)) value = (value << 8n) | BigInt(byte);
    return (value % SNARK_FIELD).toString();
  });
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 50));

export function BenchView() {
  const [device, setDevice] = useState("");
  const [sizes, setSizes] = useState<Set<number>>(new Set([16, 256, 1024, 4096]));
  const [runs, setRuns] = useState(3);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string>();
  const [problem, setProblem] = useState<string>();

  async function run() {
    setProblem(undefined);
    setRows([]);
    const voter = new Identity();
    const collected: Row[] = [];
    try {
      for (const size of [...sizes].sort((a, b) => a - b)) {
        const depth = voterTreeDepth(size);
        setStatus(
          `Downloading the proving files for ${size} voters (${(provingFilesSize(depth) / 1e6).toFixed(1)} MB)…`,
        );
        await provingFiles(depth);
        const commitments = [voter.commitment.toString(), ...fakeCommitments(size - 1)];
        for (let attempt = 1; attempt <= runs; attempt++) {
          setStatus(`${size} voters, run ${attempt} of ${runs}: rebuilding the tree…`);
          await pause();
          const started = performance.now();
          identityTree(commitments);
          collected.push({
            roll_size: size,
            phase: "tree_rebuild",
            run: attempt,
            ms: performance.now() - started,
          });
          setStatus(`${size} voters, run ${attempt} of ${runs}: proving…`);
          const { provingMs } = await proveInBrowser({
            identity: voter,
            commitments,
            election: ELECTION,
            choice: 0n,
          });
          collected.push({ roll_size: size, phase: "prove", run: attempt, ms: provingMs });
          setRows([...collected]);
        }
      }
      setStatus(undefined);
    } catch (error) {
      setStatus(undefined);
      setProblem(error instanceof Error ? error.message : String(error));
    }
  }

  function download() {
    const name = device.trim() || "unnamed-device";
    const csv = [
      "device,roll_size,phase,run,ms",
      ...rows.map((row) => [name, row.roll_size, row.phase, row.run, row.ms.toFixed(1)].join(",")),
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([`${csv}\n`], { type: "text/csv" }));
    link.download = `timings-${name}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const busy = status !== undefined;
  const measured = [...new Set(rows.map((row) => row.roll_size))];

  return (
    <>
      <Card title="Settings">
        <div className="flex flex-col gap-4 text-sm">
          <Field
            label="Device name"
            hint="For the results file, for example pixel-6a or laptop-i5."
          >
            <Input value={device} onChange={(event) => setDevice(event.target.value)} />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">Voter list sizes</legend>
            <div className="flex flex-wrap gap-3">
              {SIZES.map((size) => (
                <label key={size} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sizes.has(size)}
                    onChange={() => {
                      const next = new Set(sizes);
                      if (next.has(size)) next.delete(size);
                      else next.add(size);
                      setSizes(next);
                    }}
                  />
                  {size.toLocaleString()}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Runs per size">
            <Input
              type="number"
              min={1}
              max={10}
              value={runs}
              onChange={(event) => setRuns(Math.max(1, Math.min(10, Number(event.target.value))))}
              className="w-24"
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void run()} disabled={busy || sizes.size === 0}>
              {busy && <Spinner />} Run the benchmark
            </Button>
            <Button variant="secondary" onClick={download} disabled={busy || rows.length === 0}>
              Download results
            </Button>
          </div>
          {status && <Notice>{status}</Notice>}
          {problem && <Notice tone="error">{problem}</Notice>}
        </div>
      </Card>

      {measured.length > 0 && (
        <Card title="Results" description="Medians of the runs so far, in milliseconds.">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Voters</th>
                <th className="py-2 pr-4 font-medium">Tree depth</th>
                <th className="py-2 pr-4 font-medium">Rebuild the tree</th>
                <th className="py-2 font-medium">Prove</th>
              </tr>
            </thead>
            <tbody>
              {measured.map((size) => {
                const of = (phase: Row["phase"]) =>
                  median(
                    rows
                      .filter((row) => row.roll_size === size && row.phase === phase)
                      .map((row) => row.ms),
                  ).toFixed(0);
                return (
                  <tr key={size} className="border-t border-zinc-100 dark:border-zinc-900">
                    <td className="py-2 pr-4">{size.toLocaleString()}</td>
                    <td className="py-2 pr-4">{voterTreeDepth(size)}</td>
                    <td className="py-2 pr-4">{of("tree_rebuild")}</td>
                    <td className="py-2">{of("prove")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
