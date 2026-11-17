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
import {
  BaseError,
  ContractFunctionRevertedError,
  pad,
  parseEventLogs,
  toHex,
  WaitForTransactionReceiptTimeoutError,
  type Address,
  type Hex,
} from "viem";

import { anvil } from "viem/chains";

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
  const read = () =>
    Promise.all([
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
  let [phase, schedule, used, root, voterCount, block] = await read();
  // Just after voting opens, a node behind a load balancer may not have that block yet and still
  // report registration, so it is asked again a few times, a block apart, before refusing.
  for (
    let attempt = 1;
    phase === Phase.Registration && chain.id !== anvil.id && attempt <= 3;
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    [phase, schedule, used, root, voterCount, block] = await read();
  }
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
  try {
    await relay.queue.add(
      "ballot",
      { ballot: request },
      {
        jobId: id,
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  } catch (error) {
    // Not queued, so the ballot may be sent again.
    await relay.redis.del(key("nullifier", id));
    throw error;
  }

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
 * line holds only the send itself.
 *
 * The nonce is counted here, because a node behind a load balancer may not yet count the
 * transactions just sent. It is read from the node only at the start and when a node says a nonce
 * is already used, and then never lowered: a lower count from a lagging node would give a later
 * ballot the nonce of one still waiting to be mined, and replace it.
 */
function createSender() {
  let next: number | undefined;
  let line: Promise<unknown> = Promise.resolve();
  const nodeCount = () =>
    publicClient.getTransactionCount({ address: relayer.account.address, blockTag: "pending" });
  return (request: Parameters<typeof relayer.writeContract>[0]) => {
    const sent = line.then(async () => {
      next ??= await nodeCount();
      const nonce = next;
      try {
        const hash = await relayer.writeContract({ ...request, nonce });
        next = nonce + 1;
        return { hash, nonce };
      } catch (error) {
        // Any other failure leaves the count, so the next send takes this nonce, still unused.
        if (usedNonce(error)) next = Math.max(nonce + 1, await nodeCount().catch(() => 0));
        throw error;
      }
    });
    line = sent.catch(() => undefined);
    return sent;
  };
}

function usedNonce(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /nonce too low|already known|replacement transaction underpriced|nonce has already been used/i.test(
    message,
  );
}

/**
 * Waits for a ballot's transaction. One not mined within RELAYER_RECEIPT_TIMEOUT_MS, stuck behind
 * low fees or dropped, is sent again at the same nonce with twice the fees: that replaces it, or
 * fills the gap it left, and the ballots sent after it keep their nonces. Both are the same ballot,
 * so whichever is mined counts it.
 *
 * A receipt is matched to the transaction by its nonce alone, so the ballot's own VoteCast event
 * is looked for in it: only that shows this ballot was counted.
 */
async function confirm(
  request: Parameters<typeof relayer.writeContract>[0] & {
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  },
  sent: { hash: Hex; nonce: number },
  ballot: { election: Address; nullifier: bigint },
): Promise<Hex> {
  let hash = sent.hash;
  for (let attempt = 1; ; attempt++) {
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: config.RELAYER_RECEIPT_TIMEOUT_MS,
      });
      if (receipt.status !== "success") {
        throw new Error(`Transaction ${receipt.transactionHash} reverted`);
      }
      const key = pad(toHex(ballot.nullifier));
      const counted = parseEventLogs({
        abi: semaphoreElectionAbi,
        eventName: "VoteCast",
        logs: receipt.logs,
      }).some(
        (log) =>
          log.address.toLowerCase() === ballot.election.toLowerCase() && log.args.key === key,
      );
      if (!counted) throw new Error(`Transaction ${receipt.transactionHash} did not count it`);
      return receipt.transactionHash;
    } catch (error) {
      if (!(error instanceof WaitForTransactionReceiptTimeoutError) || attempt === 2) throw error;
    }
    // At least one more wei of tip, so a node takes it as a replacement even when the tip was 0.
    hash = await relayer.writeContract({
      ...request,
      nonce: sent.nonce,
      maxFeePerGas: request.maxFeePerGas * 2n + 1n,
      maxPriorityFeePerGas: request.maxPriorityFeePerGas * 2n + 1n,
    });
  }
}

/**
 * Sends queued ballots. Up to RELAYER_CONCURRENCY are checked and awaited at once; the sends
 * themselves go out one at a time.
 */
export function startWorker(relay: Relayer) {
  const send = createSender();
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
      const [gas, block, suggestedTip] = await Promise.all([
        publicClient.estimateContractGas({ ...simulateAt, ...call }),
        publicClient.getBlock(),
        publicClient.estimateMaxPriorityFeePerGas(),
      ]);
      const tip =
        suggestedTip > config.RELAYER_MIN_PRIORITY_FEE_WEI
          ? suggestedTip
          : config.RELAYER_MIN_PRIORITY_FEE_WEI;
      // Twice the base fee: it rises by at most an eighth a block, so a burst of ballots cannot
      // leave one priced below it for several blocks.
      const request = {
        ...call,
        chain,
        gas: (gas * 6n) / 5n,
        maxFeePerGas: (block.baseFeePerGas ?? 0n) * 2n + tip,
        maxPriorityFeePerGas: tip,
      };
      const txHash = await confirm(request, await send(request), {
        election,
        nullifier: ballot.nullifier,
      });
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
    relay.redis
      .multi()
      .set(key("failed", job.id), loggable(error).message.slice(0, 300), "EX", 3600)
      .del(key("nullifier", job.id))
      .exec()
      .catch(() => undefined);
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
