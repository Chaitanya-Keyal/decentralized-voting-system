// Settings can also come from files, the way container secrets are mounted: NAME_FILE=/path sets
// NAME to the file's contents, unless NAME is already set. Keys and passwords then never sit in a
// process's environment listing or in a compose file.
import { readFileSync } from "node:fs";

export function loadFileSettings(env: NodeJS.ProcessEnv = process.env): void {
  for (const [name, path] of Object.entries(env)) {
    if (!name.endsWith("_FILE") || !path) continue;
    const target = name.slice(0, -"_FILE".length);
    if (env[target]) continue;
    env[target] = readFileSync(path, "utf8").trim();
  }
}
