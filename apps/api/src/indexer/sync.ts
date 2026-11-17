// Copies the events of the factory and of every election it created into Postgres, in order,
// so that pages listing elections and ballots load quickly. The chain stays the source of truth:
// every row here can be rebuilt from the events.
import { setTimeout as sleep } from "node:timers/promises";

import { electionFactories, electionFactoryAbi, merkleElectionAbi } from "@dvote/shared";
import type { Logger } from "pino";
import { BlockNotFoundError, getAddress, type Address } from "viem";
import { anvil } from "viem/chains";

import { chain, deployment, publicClient } from "../chain";
import { db } from "../db";
import type { Prisma } from "../generated/prisma/client";
import { loggable } from "../redact";

/** Blocks per `eth_getLogs` request, within what public RPC providers allow. */
const BATCH_SIZE = 500n;

/** Blocks to stay behind the head, so a short testnet reorg rarely reaches the database; one that
 * does is caught below and the index rebuilt. Anvil does not reorg. */
const CONFIRMATIONS = chain.id === anvil.id ? 0n : 3n;

const POLL_MS = chain.id === anvil.id ? 500 : 4_000;

function readFactoryEvents(fromBlock: bigint, toBlock: bigint) {
  return publicClient.getContractEvents({
    address: electionFactories(deployment),
    abi: electionFactoryAbi,
    eventName: "ElectionCreated",
    fromBlock,
    toBlock,
    strict: true,
  });
}

/** Contracts per `eth_getLogs` request: public RPC providers allow at most ten addresses. */
const ADDRESSES_PER_REQUEST = 10;

/** Every election's events in the range, ten elections to a request. The caller sorts them. */
async function readElectionEvents(elections: Address[], fromBlock: bigint, toBlock: bigint) {
  const groups: Address[][] = [];
  for (let i = 0; i < elections.length; i += ADDRESSES_PER_REQUEST) {
    groups.push(elections.slice(i, i + ADDRESSES_PER_REQUEST));
  }
  const results = await Promise.all(
    groups.map((group) =>
      publicClient.getContractEvents({
        address: group,
        abi: merkleElectionAbi,
        fromBlock,
        toBlock,
        strict: true,
      }),
    ),
  );
  return results.flat();
}

type ChainEvent =
  | Awaited<ReturnType<typeof readFactoryEvents>>[number]
  | Awaited<ReturnType<typeof readElectionEvents>>[number];

/** What applying the events needs from the chain, read before the database transaction. */
interface Reads {
  candidates: Map<Address, readonly { name: string; manifestoCid: string }[]>;
  /** Each new election's tier and counting rule, which never change. */
  kinds: Map<Address, { tier: number; countingRule: number }>;
  timestamps: Map<bigint, bigint>;
}

async function readsFor(events: ChainEvent[]): Promise<Reads> {
  const reads: Reads = { candidates: new Map(), kinds: new Map(), timestamps: new Map() };
  for (const event of events) {
    const address = getAddress(event.address);
    if (event.eventName === "ElectionCreated") {
      const election = event.args.election;
      const contract = { address: election, abi: merkleElectionAbi } as const;
      const [tier, countingRule] = await Promise.all([
        publicClient.readContract({ ...contract, functionName: "tier" }),
        publicClient.readContract({ ...contract, functionName: "countingRule" }),
      ]);
      reads.kinds.set(getAddress(election), { tier, countingRule });
    }
    if (event.eventName === "CandidatesSet" && !reads.candidates.has(address)) {
      // Candidates can only change before voting opens, so the latest list is the final one. It
      // is read at the latest block, not at the event's: a node without archive state cannot
      // answer for old blocks, which the first pass over a testnet reads.
      reads.candidates.set(
        address,
        await publicClient.readContract({
          address,
          abi: merkleElectionAbi,
          functionName: "candidates",
        }),
      );
    }
    if (event.eventName === "VoteCast" && !reads.timestamps.has(event.blockNumber)) {
      const block = await publicClient.getBlock({ blockNumber: event.blockNumber });
      reads.timestamps.set(event.blockNumber, block.timestamp);
    }
  }
  return reads;
}

// Anyone can create an election, so its events can hold values Postgres cannot store: a NUL
// character in a string, or a number beyond a column's range. They are cleaned up here, since a
// write that failed would fail its whole batch again on every retry and stop the indexer.
const INT_MAX = 2n ** 31n - 1n;
const BIGINT_MAX = 2n ** 63n - 1n;
const text = (value: string) => value.replaceAll("\0", "");
const int = (value: bigint) => Number(value > INT_MAX ? INT_MAX : value);
const bigint = (value: bigint) => (value > BIGINT_MAX ? BIGINT_MAX : value);

async function apply(tx: Prisma.TransactionClient, event: ChainEvent, reads: Reads) {
  const address = getAddress(event.address);
  switch (event.eventName) {
    case "ElectionCreated":
      // `Configured` and `CandidatesSet` follow in the same transaction and fill in the rest.
      await tx.election.create({
        data: {
          address: event.args.election,
          authority: event.args.authority,
          registrar: event.args.registrar,
          ...reads.kinds.get(getAddress(event.args.election)),
          createdAtBlock: event.blockNumber,
          createdTxHash: event.transactionHash,
        },
      });
      break;
    case "Configured": {
      const { title, metadataCid, schedule } = event.args;
      await tx.election.update({
        where: { address },
        data: {
          title: text(title),
          metadataCid: text(metadataCid),
          registrationStart: bigint(schedule.registrationStart),
          registrationEnd: bigint(schedule.registrationEnd),
          votingStart: bigint(schedule.votingStart),
          votingEnd: bigint(schedule.votingEnd),
        },
      });
      break;
    }
    case "CandidatesSet":
      await tx.candidate.deleteMany({ where: { electionAddress: address } });
      await tx.candidate.createMany({
        data: (reads.candidates.get(address) ?? []).map((candidate, index) => ({
          electionAddress: address,
          index,
          name: text(candidate.name),
          manifestoCid: text(candidate.manifestoCid),
        })),
      });
      break;
    case "PhaseChanged":
      await tx.election.update({ where: { address }, data: { phase: event.args.to } });
      break;
    case "VoterRootPublished":
      await tx.election.update({
        where: { address },
        data: {
          voterRoot: event.args.root,
          voterCount: int(event.args.voterCount),
          voterListCid: text(event.args.voterListCid),
        },
      });
      break;
    case "VoteCast":
      await tx.ballot.create({
        data: {
          electionAddress: address,
          key: event.args.key,
          choice: event.args.choice.toString(),
          blockNumber: event.blockNumber,
          timestamp: reads.timestamps.get(event.blockNumber) ?? 0n,
          txHash: event.transactionHash,
          logIndex: event.logIndex,
        },
      });
      break;
    case "Finalized":
      await tx.election.update({
        where: { address },
        data: {
          finalTally: event.args.tally.map(int),
          winners: event.args.winners.map(int),
        },
      });
      break;
    default:
      // Role and initialisation events carry nothing the pages show.
      break;
  }
}

/** Deletes the indexer's copy of the chain, so that it is rebuilt from the deployment block. */
async function forgetIndex(tx: Prisma.TransactionClient) {
  await tx.ballot.deleteMany();
  await tx.candidate.deleteMany();
  await tx.election.deleteMany();
  await tx.indexerCursor.deleteMany({ where: { chainId: chain.id } });
}

export type BatchResult =
  | { kind: "indexed"; from: bigint; to: bigint }
  | { kind: "caught-up" }
  | { kind: "restarted"; reason: string };

/**
 * Checks that the chain still contains the blocks the database describes. A restarted Anvil node
 * is a new chain that reuses the same contract addresses, so everything recorded about the old
 * one, the registrar's records included, would be mistaken for the new one's and is cleared. A
 * replaced block means a reorg, and the index is rebuilt.
 */
async function checkChain(
  cursor: { genesisHash: string; block: bigint; blockHash: string } | null,
  genesisHash: string,
): Promise<BatchResult | undefined> {
  if (!cursor) return undefined;
  if (cursor.genesisHash !== "" && cursor.genesisHash !== genesisHash) {
    if (chain.id !== anvil.id) {
      throw new Error(`Chain ${chain.id} no longer has the genesis block the database describes`);
    }
    await db.$transaction(async (tx) => {
      await forgetIndex(tx);
      await tx.emailCode.deleteMany();
      await tx.registration.deleteMany();
      await tx.voterListPublication.deleteMany();
    });
    return {
      kind: "restarted",
      reason: "Anvil was restarted; cleared the previous chain's records",
    };
  }
  if (cursor.blockHash !== "" && (await replaced(cursor.block, cursor.blockHash))) {
    await db.$transaction(forgetIndex);
    return {
      kind: "restarted",
      reason: `Block ${cursor.block} was replaced; rebuilding the index`,
    };
  }
  return undefined;
}

/**
 * Whether the chain now has a different block `number`. A node without the block at all is
 * waited for rather than taken as a reorg: behind a load balancer it may just be behind the node
 * that answered last time, and a chain that really did get shorter shows a different hash once it
 * grows past `number` again. Any failure is passed on, so a node that is briefly unreachable or
 * behind does not cost a rebuild.
 */
async function replaced(number: bigint, hash: string): Promise<boolean> {
  try {
    return (await publicClient.getBlock({ blockNumber: number })).hash !== hash;
  } catch (error) {
    if (error instanceof BlockNotFoundError) {
      throw new Error(`The node does not have block ${number} yet; waiting for it to catch up`);
    }
    throw error;
  }
}

/** Indexes the next batch of blocks, and records how far it got in the same transaction. */
export async function indexNextBatch(): Promise<BatchResult> {
  // Neither the index nor the registrar's records say which chain they describe, so a database
  // serves one chain only.
  const other = await db.indexerCursor.findFirst({ where: { chainId: { not: chain.id } } });
  if (other) {
    throw new Error(
      `This database describes chain ${other.chainId}; give chain ${chain.id} a database of its own`,
    );
  }
  const genesis = await publicClient.getBlock({ blockNumber: 0n });
  const cursor = await db.indexerCursor.findUnique({ where: { chainId: chain.id } });
  const problem = await checkChain(cursor, genesis.hash);
  if (problem) return problem;

  // viem caches the block number for a polling interval; the indexer needs the true head, or a
  // block mined just after the last batch can be missed until the cache expires.
  const head = (await publicClient.getBlockNumber({ cacheTime: 0 })) - CONFIRMATIONS;
  const from = cursor ? cursor.block + 1n : BigInt(deployment.startBlock);
  if (from > head) return { kind: "caught-up" };
  const to = from + BATCH_SIZE - 1n < head ? from + BATCH_SIZE - 1n : head;

  // New elections first, so that their own events in the same batch are read too.
  const created = await readFactoryEvents(from, to);
  const known = await db.election.findMany({ select: { address: true } });
  const elections = [
    ...known.map((election) => election.address as Address),
    ...created.map((event) => event.args.election),
  ];
  const events: ChainEvent[] = [
    ...created,
    ...(elections.length > 0 ? await readElectionEvents(elections, from, to) : []),
  ].sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber < b.blockNumber
        ? -1
        : 1,
  );
  const reads = await readsFor(events);
  const last = await publicClient.getBlock({ blockNumber: to });

  // A busy batch can take longer than Prisma's default of five seconds.
  await db.$transaction(
    async (tx) => {
      for (const event of events) await apply(tx, event, reads);
      const position = { genesisHash: genesis.hash, block: to, blockHash: last.hash };
      await tx.indexerCursor.upsert({
        where: { chainId: chain.id },
        create: { chainId: chain.id, ...position },
        update: position,
      });
    },
    { timeout: 60_000 },
  );
  return { kind: "indexed", from, to };
}

/** Keeps indexing until `signal` aborts, waiting for new blocks once it has caught up. */
export async function runIndexer(log: Logger, signal: AbortSignal): Promise<void> {
  log.info({ chainId: chain.id, factories: electionFactories(deployment) }, "Indexing");
  while (!signal.aborted) {
    try {
      const batch = await indexNextBatch();
      if (batch.kind === "indexed") {
        log.info({ from: Number(batch.from), to: Number(batch.to) }, "Indexed blocks");
      } else if (batch.kind === "restarted") {
        log.warn(batch.reason);
      } else {
        await sleep(POLL_MS, undefined, { signal });
      }
    } catch (error) {
      if (signal.aborted) break;
      log.error({ err: loggable(error) }, "Indexing failed; trying again shortly");
      await sleep(5_000, undefined, { signal }).catch(() => undefined);
    }
  }
}
