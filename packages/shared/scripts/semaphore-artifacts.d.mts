/** Makes sure `dir` holds hash-checked copies of the proving files for each depth. */
export function ensureArtifacts(
  dir: string,
  depths: number[],
): Promise<Record<number, { wasm: string; zkey: string }>>;
