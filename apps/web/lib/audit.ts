"use client";

// An independent audit of an election (D4), run in the browser from the chain and IPFS alone. It
// does not ask DVote's API or indexer anything, so it works with every DVote server switched off.
import {
  choiceCandidates,
  identityListSchema,
  merkleElectionAbi,
  Phase,
  semaphoreElectionAbi,
  verifyBallot,
  verifyIdentityList,
  verifyVoterList,
  voterListSchema,
  type AnonymousBallot,
} from "@dvote/shared";
import {
  decodeFunctionData,
  getAbiItem,
  slice,
  toFunctionSelector,
  toHex,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";

import { deployment, type OnchainElection } from "./election";
import { chain } from "./env";
import { fetchFromIpfs } from "./ipfs";

export type StepStatus = "waiting" | "running" | "pass" | "fail";

export interface AuditStep {
  id: "list" | "ballots" | "eligibility" | "tally" | "result";
  title: string;
  status: StepStatus;
  detail?: string;
}

export function auditSteps(election: OnchainElection): AuditStep[] {
  const anonymous = election.tier === 3;
  const steps: AuditStep[] = [
    {
      id: "list",
      title: "The published voter list is the one locked into the contract",
      status: "waiting",
    },
    {
      id: "ballots",
      title: "Every ballot is read straight from the blockchain, and none appears twice",
      status: "waiting",
    },
    {
      id: "eligibility",
      title: anonymous
        ? "Every ballot was cast by someone on the voter list"
        : "Every ballot came from a wallet on the list",
      status: "waiting",
    },
    {
      id: "tally",
      title: "Adding up the ballots gives the contract's totals",
      status: "waiting",
    },
  ];
  if (election.phase === Phase.Finalized) {
    steps.push({
      id: "result",
      title: "The winners follow from those totals",
      status: "waiting",
    });
  }
  return steps;
}

const voteCast = getAbiItem({ abi: merkleElectionAbi, name: "VoteCast" });
const castVoteSelector = toFunctionSelector(
  getAbiItem({ abi: semaphoreElectionAbi, name: "castVote" }),
).slice(2);

/** Public RPCs cap how many blocks one log query may span. */
const LOG_CHUNK = 5_000n;

async function readBallots(client: PublicClient, election: Address) {
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const logs: Log<bigint, number, false, typeof voteCast>[] = [];
  for (let from = BigInt(deployment?.startBlock ?? 0); from <= head; from += LOG_CHUNK) {
    // The last query asks for "latest": behind a load balancer, the node that answers may be a
    // block behind the one that gave the head, and would refuse a range past its own.
    const last = from + LOG_CHUNK - 1n >= head;
    logs.push(
      ...(await client.getLogs({
        address: election,
        event: voteCast,
        fromBlock: from,
        toBlock: last ? "latest" : from + LOG_CHUNK - 1n,
      })),
    );
  }
  return logs.map((log) => ({
    key: log.args.key!,
    choice: log.args.choice!,
    txHash: log.transactionHash,
  }));
}

/**
 * The ballots, with the contract's own count and tally read around them. While voting is open a
 * ballot can land between the reads; then they are taken again, so that the audit compares one
 * moment with itself.
 */
async function readSnapshot(client: PublicClient, election: Address) {
  const contract = { address: election, abi: merkleElectionAbi } as const;
  const count = () => client.readContract({ ...contract, functionName: "ballotsCast" });
  const read = async () => {
    const before = await count();
    const ballots = await readBallots(client, election);
    const [after, tally] = await Promise.all([
      count(),
      client.readContract({ ...contract, functionName: "tally" }),
    ]);
    const steady = before === after && BigInt(ballots.length) === after;
    return { ballots, count: Number(after), tally: tally.map(Number), steady };
  };
  let snapshot = await read();
  for (let attempt = 1; attempt < 5 && !snapshot.steady; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    snapshot = await read();
  }
  return snapshot;
}

/**
 * Finds a tier 3 ballot in the transaction that cast it, by the encoded `castVote` call it carries:
 * sent to the election directly, or from a smart-contract wallet, whose transaction wraps the
 * same call.
 */
async function ballotFromTransaction(
  client: PublicClient,
  txHash: Hex,
  nullifier: bigint,
  choice: bigint,
): Promise<AnonymousBallot | undefined> {
  const hex = (await client.getTransaction({ hash: txHash })).input.slice(2);
  for (
    let at = hex.indexOf(castVoteSelector);
    at !== -1;
    at = hex.indexOf(castVoteSelector, at + 1)
  ) {
    if (at % 2 !== 0) continue;
    try {
      const call = decodeFunctionData({ abi: semaphoreElectionAbi, data: `0x${hex.slice(at)}` });
      if (call.functionName !== "castVote") continue;
      const [ballotChoice, ballotNullifier, points] = call.args;
      if (ballotNullifier === nullifier && ballotChoice === choice) {
        return { choice: ballotChoice, nullifier: ballotNullifier, points };
      }
    } catch {
      // Bytes that only looked like the call's selector.
    }
  }
  return undefined;
}

/** Runs the audit, reporting each step as it starts and ends. */
export async function runAudit(
  client: PublicClient,
  election: OnchainElection,
  report: (id: AuditStep["id"], status: StepStatus, detail?: string) => void,
) {
  const step = async (id: AuditStep["id"], task: () => Promise<string> | string) => {
    report(id, "running");
    try {
      report(id, "pass", await task());
      return true;
    } catch (error) {
      report(id, "fail", error instanceof Error ? error.message : String(error));
      return false;
    }
  };
  const expected = {
    chainId: chain.id,
    election: election.address,
    root: election.voterRoot,
    count: BigInt(election.voterCount),
  };

  let voters: Set<string> | undefined;
  const listOk = await step("list", async () => {
    if (election.voterListCid === "") throw new Error("No voter list has been published yet.");
    if (election.tier === 3) {
      const list = verifyIdentityList(
        await fetchFromIpfs(identityListSchema, election.voterListCid),
        expected,
      );
      return `${list.size} identity commitments, root ${toHex(list.root).slice(0, 12)}…`;
    }
    const list = await fetchFromIpfs(voterListSchema, election.voterListCid);
    verifyVoterList(list, expected);
    voters = new Set(list.voters.map((voter) => voter.toLowerCase()));
    return `${list.voters.length} wallets, root ${election.voterRoot.slice(0, 12)}…`;
  });

  let ballots: Awaited<ReturnType<typeof readBallots>> = [];
  let tally: number[] = [];
  const ballotsOk = await step("ballots", async () => {
    const snapshot = await readSnapshot(client, election.address);
    ({ ballots, tally } = snapshot);
    const keys = new Set(ballots.map((ballot) => ballot.key));
    if (keys.size !== ballots.length) throw new Error("A ballot key appears twice.");
    if (ballots.length !== snapshot.count) {
      throw new Error(
        `The log holds ${ballots.length} ballots, the contract counts ${snapshot.count}.`,
      );
    }
    if (ballots.length > election.voterCount) {
      throw new Error("There are more ballots than voters on the list.");
    }
    return `${ballots.length} ballots, from the contract's own events`;
  });

  await step("eligibility", async () => {
    if (!listOk || !ballotsOk) throw new Error("Needs the two checks above.");
    if (election.tier === 3) {
      let checked = 0;
      for (const ballot of ballots) {
        const nullifier = BigInt(ballot.key);
        const found = await ballotFromTransaction(client, ballot.txHash, nullifier, ballot.choice);
        if (!found) throw new Error(`Could not find the ballot in ${ballot.txHash}.`);
        const valid = await verifyBallot({
          ballot: found,
          election: election.address,
          root: election.voterRoot,
          voterCount: election.voterCount,
        });
        if (!valid || found.choice !== ballot.choice) {
          throw new Error(`The proof in ${ballot.txHash} does not check out.`);
        }
        checked++;
        report("eligibility", "running", `${checked} of ${ballots.length} proofs checked`);
      }
      return `${checked} ballots checked in this browser: each comes from someone on the list`;
    }
    for (const ballot of ballots) {
      const voter = slice(ballot.key, 12).toLowerCase();
      if (!voters?.has(voter)) throw new Error(`${voter} voted but is not on the list.`);
    }
    return `All ${ballots.length} voting wallets are on the list`;
  });

  const recount = election.candidates.map(() => 0);
  const tallyOk = await step("tally", () => {
    if (!ballotsOk) throw new Error("Needs the ballots.");
    for (const ballot of ballots) {
      for (const index of choiceCandidates(
        election.countingRule,
        ballot.choice,
        election.candidates.length,
      )) {
        recount[index] = (recount[index] ?? 0) + 1;
      }
    }
    const matches = recount.every((votes, index) => votes === (tally[index] ?? 0));
    if (!matches) {
      throw new Error(
        `Recount ${recount.join(", ")} differs from the contract's ${tally.join(", ")}.`,
      );
    }
    return `Recount ${recount.join(", ")} matches the contract`;
  });

  if (election.phase === Phase.Finalized) {
    await step("result", () => {
      if (!tallyOk) throw new Error("Needs the recount.");
      const top = Math.max(0, ...recount);
      const winners =
        top === 0 ? [] : recount.flatMap((votes, index) => (votes === top ? [index] : []));
      const same =
        winners.length === election.winners.length &&
        winners.every((winner, i) => winner === election.winners[i]);
      if (!same) throw new Error("The recount's winners differ from the contract's.");
      const names = winners.map((index) => election.candidates[index]?.name ?? `#${index}`);
      return names.length > 0 ? `Winner: ${names.join(", ")}` : "Nobody voted, so nobody won";
    });
  }
}
