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
  voteForwarderAbi,
  voterListSchema,
  type AnonymousBallot,
} from "@dvote/shared";
import {
  decodeFunctionData,
  getAbiItem,
  isAddressEqual,
  slice,
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
      title: "The published voter list rebuilds the root recorded on-chain",
      status: "waiting",
    },
    {
      id: "ballots",
      title: "Every ballot is read from the chain's event log, and none repeats",
      status: "waiting",
    },
    {
      id: "eligibility",
      title: anonymous
        ? "Every ballot's zero-knowledge proof checks out against the list, in this browser"
        : "Every ballot came from a wallet on the list",
      status: "waiting",
    },
    {
      id: "tally",
      title: "Recounting those ballots gives the contract's count",
      status: "waiting",
    },
  ];
  if (election.phase === Phase.Finalized) {
    steps.push({
      id: "result",
      title: "The recount gives the winners the contract declared",
      status: "waiting",
    });
  }
  return steps;
}

const voteCast = getAbiItem({ abi: merkleElectionAbi, name: "VoteCast" });

/** Public RPCs cap how many blocks one log query may span. */
const LOG_CHUNK = 5_000n;

async function readBallots(client: PublicClient, election: Address) {
  const head = await client.getBlockNumber();
  const logs: Log<bigint, number, false, typeof voteCast>[] = [];
  for (let from = BigInt(deployment?.startBlock ?? 0); from <= head; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n > head ? head : from + LOG_CHUNK - 1n;
    logs.push(
      ...(await client.getLogs({
        address: election,
        event: voteCast,
        fromBlock: from,
        toBlock: to,
      })),
    );
  }
  return logs.map((log) => ({
    key: log.args.key!,
    choice: log.args.choice!,
    txHash: log.transactionHash,
  }));
}

/** Finds a tier 3 ballot in its transaction, sent directly or through the vote forwarder. */
async function ballotFromTransaction(
  client: PublicClient,
  txHash: Hex,
  election: Address,
  nullifier: bigint,
): Promise<AnonymousBallot | undefined> {
  const tx = await client.getTransaction({ hash: txHash });
  let data: Hex | undefined;
  if (tx.to && isAddressEqual(tx.to, election)) data = tx.input;
  else if (tx.to && deployment && isAddressEqual(tx.to, deployment.voteForwarder)) {
    const call = decodeFunctionData({ abi: voteForwarderAbi, data: tx.input });
    if (call.functionName === "execute") data = call.args[0].data;
  }
  if (!data) return undefined;
  const decoded = decodeFunctionData({ abi: semaphoreElectionAbi, data });
  if (decoded.functionName !== "castVote") return undefined;
  const [choice, ballotNullifier, points] = decoded.args;
  if (ballotNullifier !== nullifier) return undefined;
  return { choice, nullifier: ballotNullifier, points };
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
  const ballotsOk = await step("ballots", async () => {
    ballots = await readBallots(client, election.address);
    const keys = new Set(ballots.map((ballot) => ballot.key));
    if (keys.size !== ballots.length) throw new Error("A ballot key appears twice.");
    if (ballots.length !== election.ballotsCast) {
      throw new Error(
        `The log holds ${ballots.length} ballots, the contract counts ${election.ballotsCast}.`,
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
        const found = await ballotFromTransaction(
          client,
          ballot.txHash,
          election.address,
          nullifier,
        );
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
      return `${checked} proofs checked; none says who cast it`;
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
    const matches = recount.every((votes, index) => votes === (election.tally[index] ?? 0));
    if (!matches) {
      throw new Error(
        `Recount ${recount.join(", ")} differs from the contract's ${election.tally.join(", ")}.`,
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
