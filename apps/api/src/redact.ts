// Errors from viem quote the RPC URL, whose path or query can hold the provider's API key. Both
// the API and the relayer log through this. It reads only RPC_URL, and only when first used, after
// each process has loaded its settings, so the relayer needs none of the registrar's.

let spellings: { all: string[]; origin: string } | undefined;

function rpcSpellings() {
  if (!spellings) {
    const setting = process.env.RPC_URL ?? "http://127.0.0.1:8545";
    const url = new URL(setting);
    const bare = Object.assign(new URL(setting), { username: "", password: "" }).href;
    spellings = { all: [...new Set([setting, bare])], origin: url.origin };
  }
  return spellings;
}

const redact = (text: string) => {
  const { all, origin } = rpcSpellings();
  return all.reduce((result, spelling) => result.replaceAll(spelling, `${origin}/…`), text);
};

/** An error as it can be logged: its message and stack, with the RPC URL cut down to its origin. */
export function loggable(error: unknown): { type: string; message: string; stack?: string } {
  if (!(error instanceof Error)) return { type: typeof error, message: redact(String(error)) };
  return {
    type: error.name,
    message: redact(error.message),
    ...(error.stack === undefined ? {} : { stack: redact(error.stack) }),
  };
}
