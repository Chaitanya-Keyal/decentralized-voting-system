// What the relayer does with a ballot: check it completely before paying anything, queue it, and
// submit it to the election, paying the gas. Ballots are sent one at a time, in nonce order, but
// the relayer does not wait for one to be mined before sending the next: on a chain with 12-second
// blocks, waiting would let through one ballot per block, and a room of voters would queue for
// minutes.
//
// The relayer calls `castVote` itself. The ballot's proof binds the choice and the election, and
// `castVote` never reads the sender, so nothing is gained by having the voter sign the call: the
// relayer can neither change a ballot nor cast one it was not given. Going through the ERC-2771
// `VoteForwarder` instead, as the contracts also allow, costs a signature check and, for the fresh
// key each ballot is signed with, a new nonce slot; under Glamsterdam's state pricing (EIP-8037)
// that was about 127,000 gas more per ballot on Sepolia.
import { createHash } from "node:crypto";

import {
  electionFactoryAbi,
  Phase,
  relayReceiptTypedData,
  semaphoreElectionAbi,
  verifyBallot,
  type AnonymousBallot,
  type RelayReceipt,
  type RelayStatus,
} from "@dvote/shared";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { BaseError, ContractFunctionRevertedError, pad, toHex, type Address, type Hex } from "viem";

import { HttpError } from "../http";
import { loggable } from "../redact";
import { chain, config, deployment, publicClient, relayer, simulateAt } from "./config";

/** A ballot as the relayer receives it, every number in decimal. */
export interface BallotRequest {
  election: Address;
  choice: string;
  nullifier: string;
  points: string[];
}

interface BallotJob {
  ballot: BallotRequest;
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

function toBallot(request: BallotRequest): AnonymousBallot {
  return {
    choice: BigInt(request.choice),
    nullifier: BigInt(request.nullifier),
    points: request.points.map((point) => BigInt(point)) as unknown as AnonymousBallot["points"],
  };
}

function castVoteCall(election: Address, ballot: AnonymousBallot) {
  return {
    address: election,
    abi: semaphoreElectionAbi,
    functionName: "castVote",
    args: [ballot.choice, ballot.nullifier, ballot.points],
  } as const;
}

/**
 * Accepts a ballot after checking everything that would make it fail on-chain: the target is an
 * anonymous election of this deployment, voting is open, the proof verifies against the published
 * root, the nullifier is unused and not already queued, and the call succeeds when simulated. Only
 * then does the relayer promise, with a signed receipt, to submit it.
 *
 * `client` identifies the requester for rate limiting only. It is hashed and kept for two minutes;
 * nothing ties it to the ballot.
 */
export async function acceptBallot(
  relay: Relayer,
  request: BallotRequest,
  client: string,
): Promise<{ id: string; receipt: RelayReceipt }> {
  await rateLimit(relay, client);
  const { election } = request;
  const ballot = toBallot(request);

  const created = await publicClient.readContract({
    address: deployment.semaphoreFactory,
    abi: electionFactoryAbi,
    functionName: "isElection",
    args: [election],
  });
  if (!created) {
    throw new HttpError(400, "The relayer only submits ballots for anonymous elections.");
  }

  const contract = { address: election, abi: semaphoreElectionAbi } as const;
  const [phase, schedule, used, root, voterCount, block] = await Promise.all([
    publicClient.readContract({ ...contract, functionName: "phase" }),
    publicClient.readContract({ ...contract, functionName: "schedule" }),
    publicClient.readContract({
      ...contract,
      functionName: "ballotKeyUsed",
      args: [pad(toHex(ballot.nullifier))],
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

  const valid = await verifyBallot({ ballot, election, root, voterCount });
  if (!valid) throw new HttpError(400, "The ballot's proof does not check out.");

  // The call exactly as the relayer will send it, so nothing is promised for a ballot that would
  // revert, for example one whose choice the election does not accept.
  try {
    await publicClient.simulateContract({
      ...simulateAt,
      account: relayer.account,
      ...castVoteCall(election, ballot),
    });
  } catch (error) {
    throw new HttpError(400, `The ballot would be refused on-chain: ${revertReason(error)}`);
  }

  // One queued ballot per nullifier: a second copy would only revert, at the relayer's cost.
  const id = createHash("sha256").update(`${election}:${ballot.nullifier}`).digest("hex");
  const claimed = await relay.redis.set(key("nullifier", id), "queued", "EX", 24 * 3600, "NX");
  if (claimed !== "OK") throw new HttpError(409, "This ballot has already been submitted.");
  await relay.redis.del(key("failed", id));
  // Jobs are deleted when they finish, so the queue holds a ballot only while it is pending; what
  // is kept afterwards is the outcome alone.
  await relay.queue.add(
    "ballot",
    { ballot: request },
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
    nullifier: ballot.nullifier.toString(),
    choice: ballot.choice.toString(),
    acceptedAt,
    relayer: relayer.account.address,
    signature: await relayer.signTypedData({
      account: relayer.account,
      ...relayReceiptTypedData({
        chainId: chain.id,
        election,
        nullifier: ballot.nullifier,
        choice: ballot.choice,
        acceptedAt,
      }),
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

/**
 * Sends the relayer's transactions one after another with consecutive nonces, without waiting for
 * any to be mined. Everything else a send needs is worked out before it joins the line, so the
 * line holds only the send itself. The nonce is counted here rather than asked of the node each
 * time, because a node behind a load balancer may not yet count the transaction just sent. After a
 * failed send, or one not mined in time that may have been dropped, it is read from the node
 * again, so a gap left by a lost nonce gets filled.
 */
function createSender() {
  let next: number | undefined;
  let line: Promise<unknown> = Promise.resolve();
  const forget = () => {
    next = undefined;
  };
  const send = (request: Parameters<typeof relayer.writeContract>[0]): Promise<Hex> => {
    const sent = line.then(async () => {
      try {
        next ??= await publicClient.getTransactionCount({
          address: relayer.account.address,
          blockTag: "pending",
        });
        const nonce = next;
        const hash = await relayer.writeContract({ ...request, nonce });
        next = nonce + 1;
        return hash;
      } catch (error) {
        next = undefined;
        throw error;
      }
    });
    line = sent.catch(() => undefined);
    return sent;
  };
  return { send, forget };
}

/**
 * Sends queued ballots. Up to RELAYER_CONCURRENCY are checked and awaited at once; the sends
 * themselves go out one at a time.
 */
export function startWorker(relay: Relayer) {
  const sender = createSender();
  return new Worker<BallotJob>(
    "ballots",
    async (job: Job<BallotJob>) => {
      const { election } = job.data.ballot;
      const ballot = toBallot(job.data.ballot);
      // A retry may find the ballot already counted, by an earlier attempt or by a direct
      // submission. Either way the voter's ballot is in, which is what they need to know. (A first
      // attempt was checked moments ago, when the ballot was accepted.)
      if (job.attemptsMade > 0 && (await isCounted(election, ballot.nullifier))) {
        await relay.redis.set(key("mined", job.id ?? ""), "", "EX", 7 * 24 * 3600);
        return;
      }
      const call = { account: relayer.account, ...castVoteCall(election, ballot) };
      // Estimating the gas also runs the call, so a ballot the election would now reject fails
      // here, with the election's reason, before anything is paid. It is estimated against the
      // latest block rather than at send time with a nonce some ballots ahead: ballots queued ahead
      // only make the election's first writes cheaper, and a fifth more covers a change of block.
      const [gas, fees] = await Promise.all([
        publicClient.estimateContractGas({ ...simulateAt, ...call }),
        publicClient.estimateFeesPerGas(),
      ]);
      const txHash = await sender.send({
        ...call,
        chain,
        gas: (gas * 6n) / 5n,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      });
      let receipt;
      try {
        receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 180_000 });
      } catch (error) {
        sender.forget();
        throw new Error(`Transaction ${txHash} was not mined in time`, { cause: error });
      }
      if (receipt.status !== "success") throw new Error(`Transaction ${txHash} reverted`);
      await relay.redis.set(key("mined", job.id ?? ""), txHash, "EX", 7 * 24 * 3600);
    },
    {
      connection: relay.redis.duplicate({ maxRetriesPerRequest: null }),
      prefix: config.RELAYER_PREFIX,
      concurrency: config.RELAYER_CONCURRENCY,
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

function isCounted(election: Address, nullifier: bigint): Promise<boolean> {
  return publicClient.readContract({
    address: election,
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
