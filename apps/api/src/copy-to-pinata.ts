// Copies elections' documents from the IPFS node to Pinata: their voter lists, descriptions and
// manifestos. The registrar copies each list as it publishes it, once PINATA_JWT is set; this is
// for elections published before then. Copying again is harmless.
//
//   pnpm --filter @dvote/api copy-to-pinata <election address>...
import { pino } from "pino";
import { getAddress, isAddress } from "viem";

import { electionDocuments } from "./documents";
import { env } from "./env";
import { copyToPinata } from "./ipfs";

const log = pino();
const elections = process.argv.slice(2);
if (!env.PINATA_JWT) throw new Error("Set PINATA_JWT, or PINATA_JWT_FILE, to copy to Pinata");
if (elections.length === 0 || !elections.every((address) => isAddress(address))) {
  throw new Error("Pass the addresses of the elections to copy");
}

let failures = 0;
for (const election of elections.map((address) => getAddress(address))) {
  const { copied, failed } = await copyToPinata(await electionDocuments(election), log);
  log.info({ election, copied, failed }, "Copied the election's documents");
  failures += failed;
}
process.exitCode = failures === 0 ? 0 : 1;
