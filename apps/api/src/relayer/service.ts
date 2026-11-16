// What the relayer does with a ballot: check it completely before paying anything, queue it, and
// submit it through the `VoteForwarder`. Ballots are sent one at a time, so the relayer's nonce
// never races with itself.
import { createHash } from "node:crypto";

import {
  electionFactoryAbi,
  Phase,
  relayReceiptTypedData,
  semaphoreElectionAbi,
  verifyBallot,
  voteForwarderAbi,
  type RelayReceipt,
  type RelayStatus,
} from "@dvote/shared";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeFunctionData,
  pad,
  toHex,
  type Address,
  type Hex,
} from "viem";

import { HttpError } from "../http";
import { loggable } from "../redact";
import { chain, config, deployment, publicClient, relayer, simulateAt } from "./config";

/** Enough for a ballot through the forwarder (about 340,000 gas), with room to spare. */
const MAX_GAS = 600_000n;

/** A forwarded ballot, as the relayer receives it. */
export interface ForwardRequest {
  from: Address;
  to: Address;
  value: string;
  gas: string;
  deadline: number;
  data: Hex;
  signature: Hex;
}

interface BallotJob {
  request: ForwardRequest;
}

export function connect() {
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue<BallotJob>("ballots", {
    connection: redis,
    prefix: config.RELAYER_PREFIX,
  });
  return { redis, queue };
}

export type Relayer = ReturnType<typeof connect>;

const key = (...parts: string[]) => [config.RELAYER_PREFIX, ...parts].join(":");

/**
 * Accepts a ballot after checking everything that would make it fail on-chain: the target is an
 * anonymous election of this deployment, voting is open, the proof verifies against the published
 * root, the nullifier is unused and not already queued, and the forwarder will accept the
 * signature. Only then does the relayer promise, with a signed receipt, to submit it.
 *
 * `client` identifies the requester for rate limiting only. It is hashed and kept for two minutes;
 * nothing ties it to the ballot.
 */
export async function acceptBallot(
  relay: Relayer,
  request: ForwardRequest,
  client: string,
): Promise<{ id: string; receipt: RelayReceipt }> {
  await rateLimit(relay, client);

  const election = request.to;
  if (BigInt(request.value) !== 0n) throw new HttpError(400, "A ballot carries no ETH.");
  if (BigInt(request.gas) > MAX_GAS) throw new HttpError(400, "That ballot asks for too much gas.");

  let decoded;
  try {
    decoded = decodeFunctionData({ abi: semaphoreElectionAbi, data: request.data });
  } catch {
    throw new HttpError(400, "That is not a ballot.");
  }
  if (decoded.functionName !== "castVote") throw new HttpError(400, "That is not a ballot.");
  const [choice, nullifier, points] = decoded.args;

  const created = await publicClient.readContract({
    address: deployment.semaphoreFactory,
    abi: electionFactoryAbi,
    functionName: "isElection",
    args: [election],
  });
  if (!created)
    throw new HttpError(400, "The relayer only submits ballots for anonymous elections.");

  const contract = { address: election, abi: semaphoreElectionAbi } as const;
  const [phase, schedule, used, root, voterCount, block] = await Promise.all([
    publicClient.readContract({ ...contract, functionName: "phase" }),
    publicClient.readContract({ ...contract, functionName: "schedule" }),
    publicClient.readContract({
      ...contract,
      functionName: "ballotKeyUsed",
      args: [pad(toHex(nullifier))],
    }),
    publicClient.readContract({ ...contract, functionName: "voterRoot" }),
    publicClient.readContract({ ...contract, functionName: "voterCount" }),
    publicClient.getBlock(simulateAt),
  ]);
  const votingEnd = schedule[3];
  if (phase !== Phase.Voting || block.timestamp >= votingEnd) {
    throw new HttpError(409, "Voting is not open in this election.");
  }
  if (used) throw new HttpError(409, "This voter has already voted.");

  const valid = await verifyBallot({
    ballot: { choice, nullifier, points: points as unknown as readonly bigint[] as never },
    election,
    root,
    voterCount,
  });
  if (!valid) throw new HttpError(400, "The ballot's proof does not check out.");

  // The whole call, as the relayer would send it: the forwarder's signature, nonce, deadline and gas
  // checks, then the election's own (the choice, the ballot cap). Nothing is promised for a ballot
  // that would revert.
  try {
    await publicClient.simulateContract({
      ...simulateAt,
      account: relayer.account,
      address: deployment.voteForwarder,
      abi: voteForwarderAbi,
      functionName: "execute",
      args: [toForwardData(request)],
    });
  } catch {
    // The forwarder reports only that the call failed, so the election is asked directly why.
    // castVote does not use the sender, so calling it from the forwarder's address is the same.
    const reason = await publicClient
      .simulateContract({
        ...simulateAt,
        account: deployment.voteForwarder,
        address: election,
        abi: semaphoreElectionAbi,
        functionName: "castVote",
        args: [choice, nullifier, points],
      })
      .then(
        () => "the forwarder refuses it; check its signature, deadline and gas",
        (error: unknown) => revertReason(error),
      );
    throw new HttpError(400, `The ballot would be refused on-chain: ${reason}`);
  }

  // One queued ballot per nullifier: a second copy would only revert, at the relayer's cost.
  const id = createHash("sha256").update(`${election}:${nullifier}`).digest("hex");
  const claimed = await relay.redis.set(key("nullifier", id), "queued", "EX", 24 * 3600, "NX");
  if (claimed !== "OK") throw new HttpError(409, "This ballot has already been submitted.");
  await relay.redis.del(key("failed", id));
  // Jobs are deleted when they finish, so the queue holds a request only while it is pending; what
  // is kept afterwards is the outcome alone.
  await relay.queue.add(
    "ballot",
    { request },
    {
      jobId: id,
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );

  const acceptedAt = Number(block.timestamp);
  const receipt: RelayReceipt = {
    chainId: chain.id,
    election,
    nullifier: nullifier.toString(),
    choice: choice.toString(),
    acceptedAt,
    relayer: relayer.account.address,
    signature: await relayer.signTypedData({
      account: relayer.account,
      ...relayReceiptTypedData({ chainId: chain.id, election, nullifier, choice, acceptedAt }),
    }),
  };
  return { id, receipt };
}

/** Where a ballot the relayer accepted has got to. */
export async function ballotStatus(relay: Relayer, id: string): Promise<RelayStatus> {
  const [mined, failed, job] = await Promise.all([
    relay.redis.get(key("mined", id)),
    relay.redis.get(key("failed", id)),
    relay.queue.getJob(id),
  ]);
  if (mined !== null) {
    return mined === "" ? { id, status: "mined" } : { id, status: "mined", txHash: mined as Hex };
  }
  if (job) return { id, status: (await job.isActive()) ? "sending" : "queued" };
  if (failed !== null) return { id, status: "failed", error: failed };
  throw new HttpError(404, "The relayer has no such ballot.");
}

/** Sends queued ballots, one at a time. */
export function startWorker(relay: Relayer) {
  return new Worker<BallotJob>(
    "ballots",
    async (job: Job<BallotJob>) => {
      const request = toForwardData(job.data.request);
      // A retry after a crash may find the ballot already counted, by an earlier attempt or by a
      // direct submission. Either way the voter's ballot is in, which is what they need to know.
      if (await isCounted(request)) {
        await relay.redis.set(key("mined", job.id ?? ""), "", "EX", 7 * 24 * 3600);
        return;
      }
      const { request: call } = await publicClient.simulateContract({
        ...simulateAt,
        account: relayer.account,
        address: deployment.voteForwarder,
        abi: voteForwarderAbi,
        functionName: "execute",
        args: [request],
      });
      const txHash = await relayer.writeContract(call);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 180_000,
      });
      if (receipt.status !== "success") throw new Error(`Transaction ${txHash} reverted`);
      await relay.redis.set(key("mined", job.id ?? ""), txHash, "EX", 7 * 24 * 3600);
    },
    {
      connection: relay.redis.duplicate({ maxRetriesPerRequest: null }),
      prefix: config.RELAYER_PREFIX,
      concurrency: 1,
    },
  ).on("failed", (job, error) => {
    // Only once the retries are spent. The ballot may then be sent again, through the relayer or
    // directly, so its nullifier is released.
    if (!job?.id || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    void relay.redis
      .multi()
      .set(key("failed", job.id), loggable(error).message.slice(0, 300), "EX", 3600)
      .del(key("nullifier", job.id))
      .exec();
  });
}

async function rateLimit(relay: Relayer, client: string) {
  const minute = Math.floor(Date.now() / 60_000);
  const hashed = createHash("sha256").update(client).digest("hex").slice(0, 16);
  const counter = key("rate", hashed, String(minute));
  // In one transaction, so a counter can never be left without its expiry.
  const results = await relay.redis.multi().incr(counter).expire(counter, 120).exec();
  const count = Number(results?.[0]?.[1] ?? 0);
  if (count > config.RELAYER_RATE_LIMIT) {
    throw new HttpError(429, "Too many ballots from here. Wait a minute and try again.");
  }
}

function toForwardData(request: ForwardRequest) {
  return {
    from: request.from,
    to: request.to,
    value: BigInt(request.value),
    gas: BigInt(request.gas),
    deadline: request.deadline,
    data: request.data,
    signature: request.signature,
  };
}

async function isCounted(request: ReturnType<typeof toForwardData>): Promise<boolean> {
  const { args } = decodeFunctionData({ abi: semaphoreElectionAbi, data: request.data });
  const nullifier = args[1] as bigint;
  return publicClient.readContract({
    address: request.to,
    abi: semaphoreElectionAbi,
    functionName: "ballotKeyUsed",
    args: [pad(toHex(nullifier))],
  });
}

/** What the election's custom errors mean, for a voter. */
const REASONS: Record<string, string> = {
  InvalidChoice: "that is not a valid choice of candidates",
  InvalidProof: "the proof does not match the published voter list",
  AlreadyVoted: "this voter has already voted",
  VotingClosed: "voting is not open",
  BallotCapReached: "every voter on the list has voted",
};

function revertReason(error: unknown): string {
  const revert =
    error instanceof BaseError
      ? error.walk((cause) => cause instanceof ContractFunctionRevertedError)
      : undefined;
  const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
  if (name) return `${REASONS[name] ?? "the election refuses it"} (${name})`;
  return error instanceof BaseError ? error.shortMessage : "it reverts";
}
