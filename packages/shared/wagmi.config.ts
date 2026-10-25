// Generates src/generated.ts from the Foundry build and contracts/deployments.
// Run `pnpm --filter @dvote/shared generate` after changing a contract or deploying.
import { readdirSync, readFileSync } from "node:fs";

import { defineConfig, type Plugin } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

const CONTRACTS = "../../contracts";

interface Deployment {
  chainId: number;
  startBlock: number;
  merkleElection: string;
  electionFactory: string;
}

/** Exports the addresses in contracts/deployments, keyed by chain id. */
function deployments(): Plugin {
  return {
    name: "Deployments",
    run() {
      const dir = `${CONTRACTS}/deployments`;
      const byChain = Object.fromEntries(
        readdirSync(dir)
          .filter((file) => file.endsWith(".json"))
          .map((file) => JSON.parse(readFileSync(`${dir}/${file}`, "utf8")) as Deployment)
          .map((deployment) => [deployment.chainId, deployment]),
      );
      return { content: `export const deployments = ${JSON.stringify(byChain)} as const;` };
    },
  };
}

export default defineConfig({
  out: "src/generated.ts",
  plugins: [
    foundry({
      project: CONTRACTS,
      include: [
        "MerkleElection.sol/MerkleElection.json",
        "ElectionFactory.sol/ElectionFactory.json",
      ],
    }),
    deployments(),
  ],
});
