import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

import { deploymentFor, electionFactoryAbi, semaphoreElectionAbi } from "@dvote/shared";
import pg from "pg";
import { createWalletClient, http, isAddressEqual, publicActions, type Hex } from "viem";
import { anvil } from "viem/chains";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const contracts = new URL("../../../contracts/", import.meta.url).pathname;
const api = new URL("../", import.meta.url).pathname;

/** Anvil's first default account, which the node unlocks. It deploys the contracts. */
export const AUTHORITY = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// The docker compose Postgres. Each run creates a database of its own here and drops it after.
const postgres =
  process.env.TEST_POSTGRES_URL ?? "postgresql://dvote:dvote@localhost:5433/postgres";

async function waitForNode(rpcUrl: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Anvil did not start on ${rpcUrl}`);
}

function bytecode(contract: string): Hex {
  const artifact = JSON.parse(
    readFileSync(`${contracts}/out/${contract}.sol/${contract}.json`, "utf8"),
  ) as { bytecode: { object: Hex } };
  return artifact.bytecode.object;
}

/** Deploys the contracts the way the deploy script does, without writing contracts/deployments. */
async function deployContracts(rpcUrl: string) {
  execFileSync("forge", ["build"], { cwd: contracts, stdio: "ignore" });
  const client = createWalletClient({
    account: AUTHORITY,
    chain: anvil,
    transport: http(rpcUrl),
  }).extend(publicActions);
  const deploy = async (hash: Hex) => {
    const { contractAddress } = await client.waitForTransactionReceipt({ hash });
    if (!contractAddress) throw new Error("Deployment failed");
    return contractAddress;
  };

  // In the deploy script's order, so the addresses match contracts/deployments/31337.json.
  const merkleElection = await deploy(
    await client.deployContract({ abi: [], bytecode: bytecode("MerkleElection") }),
  );
  const electionFactory = await deploy(
    await client.deployContract({
      abi: electionFactoryAbi,
      bytecode: bytecode("ElectionFactory"),
      args: [merkleElection],
    }),
  );
  const verifier = await deploy(
    await client.deployContract({ abi: [], bytecode: bytecode("SemaphoreVerifier") }),
  );
  const semaphoreElection = await deploy(
    await client.deployContract({
      abi: semaphoreElectionAbi,
      bytecode: bytecode("SemaphoreElection"),
      args: [verifier],
    }),
  );
  const semaphoreFactory = await deploy(
    await client.deployContract({
      abi: electionFactoryAbi,
      bytecode: bytecode("ElectionFactory"),
      args: [semaphoreElection],
    }),
  );
  const expected = deploymentFor(anvil.id);
  const deployed = { electionFactory, semaphoreFactory };
  for (const [name, address] of Object.entries(deployed)) {
    const want = expected?.[name as keyof typeof deployed];
    if (!want || !isAddressEqual(address, want)) {
      throw new Error(`${name} was deployed at ${address}, not at ${want}`);
    }
  }
}

export default async function setup(project: TestProject) {
  const rpcUrl = project.config.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL is not set in vitest.config.ts");

  const node = spawn("anvil", ["--port", new URL(rpcUrl).port, "--silent"], { stdio: "ignore" });
  const database = `dvote_test_${Date.now()}_${process.pid}`;
  const admin = new pg.Client({ connectionString: postgres });
  let created = false;
  const teardown = async () => {
    node.kill();
    // Only the database this run created.
    if (created) await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
    await admin.end();
  };

  // If setting up fails, nothing is left behind: a node still holding the port would break the
  // next run.
  try {
    await waitForNode(rpcUrl);
    await deployContracts(rpcUrl);

    await admin.connect();
    await admin.query(`CREATE DATABASE ${database}`);
    created = true;
    const databaseUrl = Object.assign(new URL(postgres), { pathname: `/${database}` }).toString();
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: api,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "ignore",
    });
    project.provide("databaseUrl", databaseUrl);
  } catch (error) {
    await teardown().catch(() => undefined);
    throw error;
  }
  return teardown;
}
