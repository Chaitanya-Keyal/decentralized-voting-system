#!/usr/bin/env node
// Downloads Semaphore's proving files for the given tree depths into a directory and checks
// every file against the hash pinned in src/semaphore-artifacts.json. A download that does not
// match is never written and the run fails, so nothing unverified is used to prove a ballot.
//
//   node packages/shared/scripts/semaphore-artifacts.mjs <directory> [maxDepth]
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const manifest = JSON.parse(
  await readFile(
    fileURLToPath(new URL("../src/semaphore-artifacts.json", import.meta.url)),
    "utf8",
  ),
);

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/** Makes sure `dir` holds checked copies of the files for each depth. Returns their paths. */
export async function ensureArtifacts(dir, depths) {
  await mkdir(dir, { recursive: true });
  const paths = {};
  for (const depth of depths) {
    const pinned = manifest.files[String(depth)];
    if (!pinned) throw new Error(`No pinned proving files for depth ${depth}`);
    paths[depth] = {};
    for (const kind of ["wasm", "zkey"]) {
      const name = `semaphore-${depth}.${kind}`;
      const path = join(dir, name);
      const want = pinned[kind].sha256;
      if (!existsSync(path) || sha256(await readFile(path)) !== want) {
        const response = await fetch(`${manifest.url}/${name}`);
        if (!response.ok) throw new Error(`Downloading ${name} failed with ${response.status}`);
        const data = Buffer.from(await response.arrayBuffer());
        if (sha256(data) !== want) throw new Error(`${name} does not match its pinned hash`);
        await writeFile(`${path}.part`, data);
        await rename(`${path}.part`, path);
      }
      paths[depth][kind] = path;
    }
  }
  return paths;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, maxDepth = "20"] = process.argv.slice(2);
  if (!dir) {
    console.error("Usage: semaphore-artifacts.mjs <directory> [maxDepth]");
    process.exit(1);
  }
  const depths = Array.from({ length: Number(maxDepth) }, (_, i) => i + 1);
  try {
    await ensureArtifacts(dir, depths);
    console.log(`Checked Semaphore proving files for depths 1 to ${maxDepth} in ${dir}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
