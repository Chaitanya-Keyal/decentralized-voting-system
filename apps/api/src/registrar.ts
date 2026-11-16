// The registrar: checks that a voter has an institute email address, registers their wallet with a
// signed receipt, and publishes the voter list when registration closes. It is not involved in
// voting at all.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import {
  buildIdentityList,
  buildVoterList,
  identityReceiptTypedData,
  identityRegistrationRequestSchema,
  identityTree,
  merkleElectionAbi,
  Phase,
  receiptTypedData,
  registrationRequestSchema,
  registrationTypedData,
  rootToBytes32,
  voterTree,
  type IdentityReceipt,
  type Publication,
  type Receipt,
} from "@dvote/shared";
import type { FastifyBaseLogger } from "fastify";
import {
  isAddressEqual,
  TransactionNotFoundError,
  TransactionReceiptNotFoundError,
  WaitForTransactionReceiptTimeoutError,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { anvil } from "viem/chains";

import {
  chain,
  chainNow,
  publicClient,
  readElection,
  registrar,
  simulateAt,
  type ElectionState,
} from "./chain";
import { db } from "./db";
import { env } from "./env";
import type { Prisma } from "./generated/prisma/client";
import { HttpError, parse } from "./http";
import { loggable } from "./redact";
import { pinJson } from "./ipfs";
import { sendCode as emailCode } from "./mailer";

const CODE_VALID_MINUTES = 10;
const CODE_RESEND_SECONDS = 60;
const MAX_CODE_ATTEMPTS = 5;
/** With five tries a code, guessing gets 25 tries a day per address and election. */
const MAX_CODES_PER_DAY = 5;

/**
 * How long to wait for a transaction to be mined. After that it is left to a later attempt, which
 * checks on it instead of sending another.
 */
const CONFIRM_TIMEOUT_MS = chain.id === anvil.id ? 10_000 : 60_000;

const hashCode = (code: string) => createHash("sha256").update(code).digest();

/**
 * Institute addresses only, written plainly. Mail to `name+tag@` reaches `name@`, so allowing a
 * tag would let one mailbox register several wallets.
 */
function requireInstituteEmail(email: string) {
  const at = email.lastIndexOf("@");
  if (email.slice(at + 1) !== env.EMAIL_DOMAIN.toLowerCase()) {
    throw new HttpError(400, `Only @${env.EMAIL_DOMAIN} addresses can register.`);
  }
  if (!/^[a-z0-9._-]+$/.test(email.slice(0, at))) {
    throw new HttpError(400, "Use your institute address as it is, without a + tag.");
  }
}

/**
 * Registration runs from `registrationStart` to `registrationEnd`. The phase can still read
 * Created during that time, because opening registration on-chain is a step anyone may take and
 * nobody may have taken it yet.
 */
async function requireRegistrationOpen(state: ElectionState) {
  if (state.phase === Phase.Cancelled) throw new HttpError(409, "This election was cancelled.");
  const now = await chainNow();
  if (now < state.registrationStart) {
    throw new HttpError(409, "Registration for this election has not opened yet.");
  }
  if (
    state.phase > Phase.Registration ||
    state.isVoterListPublished ||
    now >= state.registrationEnd
  ) {
    throw new HttpError(409, "Registration for this election has closed.");
  }
}

/**
 * Runs `fn` in a transaction that holds a lock on the election, so that a registration and the
 * publication of the voter list never interleave.
 */
function withElectionLock<T>(
  election: Address,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: { timeout?: number },
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${election}))`;
    return fn(tx);
  }, options);
}

export async function sendCode(
  election: Address,
  email: string,
  log: FastifyBaseLogger,
): Promise<{ expiresAt: number }> {
  requireInstituteEmail(email);
  const state = await readElection(election);
  await requireRegistrationOpen(state);

  const code = randomInt(1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date(Date.now() + CODE_VALID_MINUTES * 60_000);
  // The limits are checked and the code recorded under one lock, so that requests sent in
  // parallel cannot all pass the check.
  const { id } = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${election} ${email}`}))`;
    const recent = await tx.emailCode.findFirst({
      where: {
        election,
        email,
        createdAt: { gt: new Date(Date.now() - CODE_RESEND_SECONDS * 1000) },
      },
    });
    if (recent) {
      throw new HttpError(429, "A code was sent less than a minute ago. Check your inbox first.");
    }
    const today = await tx.emailCode.count({
      where: { election, email, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60_000) } },
    });
    if (today >= MAX_CODES_PER_DAY) {
      throw new HttpError(429, "Too many codes for this address today. Try again tomorrow.");
    }
    return tx.emailCode.create({
      data: { election, email, codeHash: hashCode(code).toString("hex"), expiresAt },
      select: { id: true },
    });
  });

  try {
    await emailCode(
      { to: email, code, electionTitle: state.title, validMinutes: CODE_VALID_MINUTES },
      log,
    );
  } catch (error) {
    // A code that never arrived must not count against the address.
    await db.emailCode.delete({ where: { id } });
    log.error({ err: loggable(error), election }, "Could not email a code");
    throw new HttpError(502, "The code could not be emailed. Try again in a moment.");
  }
  return { expiresAt: Math.floor(expiresAt.getTime() / 1000) };
}

async function checkCode(election: Address, email: string, code: string) {
  const latest = await db.emailCode.findFirst({
    where: { election, email, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) throw new HttpError(400, "That code has expired. Ask for a new one.");

  // Count the attempt before comparing, so that guesses sent in parallel cannot pass the limit.
  const { count } = await db.emailCode.updateMany({
    where: { id: latest.id, attempts: { lt: MAX_CODE_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (count === 0) throw new HttpError(429, "Too many wrong codes. Ask for a new one.");
  if (!timingSafeEqual(hashCode(code), Buffer.from(latest.codeHash, "hex"))) {
    throw new HttpError(400, "That code is not right.");
  }
}

/**
 * Registers a voter's wallet once they have proved their email address and signed with the
 * wallet, and returns the registrar's signed receipt (FR2). An email address registers one wallet
 * and a wallet one email address, and the pair never changes: registering again with the same
 * wallet gives a fresh receipt, and any other wallet is refused. If a registration could move to
 * another wallet, a registrar that dropped or swapped a voter's wallet could claim the voter had
 * moved it, and the receipt would prove nothing.
 */
export async function register(
  election: Address,
  request: { email: string; code: string; voter: Address; signature: Hex },
  known?: ElectionState,
): Promise<Receipt> {
  const { email, voter } = request;
  requireInstituteEmail(email);
  // An invalid signature recovers to the zero address, so it must never be a voter.
  if (isAddressEqual(voter, zeroAddress)) throw new HttpError(400, "That is not a wallet address.");
  const state = known ?? (await readElection(election));
  if (state.tier === 3) {
    throw new HttpError(400, "This election registers identities, not wallets.");
  }
  await requireRegistrationOpen(state);
  await checkCode(election, email, request.code);

  const signedByVoter = await publicClient.verifyTypedData({
    address: voter,
    ...registrationTypedData({ chainId: chain.id, election, voter, email }),
    signature: request.signature,
  });
  if (!signedByVoter) {
    throw new HttpError(400, "The wallet signature does not match the address being registered.");
  }

  const issuedAt = Number(await chainNow());
  const receipt: Receipt = {
    chainId: chain.id,
    election,
    voter,
    issuedAt,
    registrar: registrar.account.address,
    signature: await registrar.signTypedData({
      account: registrar.account,
      ...receiptTypedData({ chainId: chain.id, election, voter, issuedAt }),
    }),
  };

  await withElectionLock(election, async (tx) => {
    if (await tx.voterListPublication.findUnique({ where: { election } })) {
      throw new HttpError(409, "Registration for this election has closed.");
    }
    const holder = await tx.registration.findUnique({
      where: { election_voter: { election, voter } },
    });
    if (holder && holder.email !== email) {
      throw new HttpError(409, "This wallet is already registered with another email address.");
    }
    const existing = await tx.registration.findUnique({
      where: { election_email: { election, email } },
    });
    if (existing && !isAddressEqual(existing.voter as Address, voter)) {
      throw new HttpError(
        409,
        `This email address is registered with the wallet ${existing.voter}, which stays its ` +
          "wallet for this election. Register with that wallet to get your receipt again.",
      );
    }
    const record = {
      voter,
      voterSignature: request.signature,
      receiptSignature: receipt.signature,
      issuedAt: new Date(issuedAt * 1000),
    };
    await tx.registration.upsert({
      where: { election_email: { election, email } },
      create: { election, email, ...record },
      update: record,
    });
    await tx.emailCode.deleteMany({ where: { election, email } });
  });
  return receipt;
}

/**
 * Tier 3: registers the commitment of a Semaphore identity the voter's device created, once they
 * have proved their email address, and returns the registrar's signed receipt (FR2). The secret
 * behind the commitment never leaves the device, so the registrar cannot vote in the voter's
 * name or tell which ballot is theirs. As with wallets, an email address registers one identity
 * and the pair never changes.
 */
export async function registerIdentity(
  election: Address,
  request: { email: string; code: string; commitment: string },
  known?: ElectionState,
): Promise<IdentityReceipt> {
  const { email, commitment } = request;
  requireInstituteEmail(email);
  const state = known ?? (await readElection(election));
  if (state.tier !== 3) {
    throw new HttpError(400, "This election registers wallets, not identities.");
  }
  await requireRegistrationOpen(state);
  await checkCode(election, email, request.code);

  const issuedAt = Number(await chainNow());
  const receipt: IdentityReceipt = {
    chainId: chain.id,
    election,
    commitment,
    issuedAt,
    registrar: registrar.account.address,
    signature: await registrar.signTypedData({
      account: registrar.account,
      ...identityReceiptTypedData({ chainId: chain.id, election, commitment, issuedAt }),
    }),
  };

  await withElectionLock(election, async (tx) => {
    if (await tx.voterListPublication.findUnique({ where: { election } })) {
      throw new HttpError(409, "Registration for this election has closed.");
    }
    const holder = await tx.registration.findUnique({
      where: { election_voter: { election, voter: commitment } },
    });
    if (holder && holder.email !== email) {
      throw new HttpError(409, "This identity is already registered with another email address.");
    }
    const existing = await tx.registration.findUnique({
      where: { election_email: { election, email } },
    });
    if (existing && existing.voter !== commitment) {
      throw new HttpError(
        409,
        "This email address is registered with another identity, which stays its identity for " +
          "this election. Restore that identity from its backup to get your receipt again.",
      );
    }
    const record = {
      voter: commitment,
      voterSignature: "",
      receiptSignature: receipt.signature,
      issuedAt: new Date(issuedAt * 1000),
    };
    await tx.registration.upsert({
      where: { election_email: { election, email } },
      create: { election, email, ...record },
      update: record,
    });
    await tx.emailCode.deleteMany({ where: { election, email } });
  });
  return receipt;
}

/** Registers a voter in either tier, reading which one the election uses. */
export async function registerVoter(
  election: Address,
  body: unknown,
): Promise<Receipt | IdentityReceipt> {
  const state = await readElection(election);
  return state.tier === 3
    ? registerIdentity(election, parse(identityRegistrationRequestSchema, body), state)
    : register(election, parse(registrationRequestSchema, body), state);
}

export async function registrationCount(election: Address): Promise<{ count: number }> {
  await readElection(election);
  return { count: await db.registration.count({ where: { election } }) };
}

const publishing = new Map<Address, Promise<Publication>>();

/**
 * Publishes the voter list once registration has closed and before voting is due to open (FR3):
 * freezes it, adds it to IPFS, and records its root, size and CID on-chain in one transaction. A
 * second request while one is running waits for the same result.
 */
export function publishVoterList(election: Address, log: FastifyBaseLogger): Promise<Publication> {
  const running = publishing.get(election);
  if (running) return running;
  const attempt = publish(election, log).finally(() => publishing.delete(election));
  publishing.set(election, attempt);
  return attempt;
}

async function publish(election: Address, log: FastifyBaseLogger): Promise<Publication> {
  const state = await readElection(election);
  if (state.isVoterListPublished) return publishedList(election);
  if (state.phase === Phase.Cancelled) throw new HttpError(409, "This election was cancelled.");
  const now = await chainNow();
  if (now < state.registrationEnd) throw new HttpError(409, "Registration is still open.");
  if (now >= state.votingStart) {
    throw new HttpError(
      409,
      "Voting was due to open before the voter list was published, so it can no longer be " +
        "published. The election's authority can cancel the election.",
    );
  }

  // An earlier attempt may have sent the transaction already. A second one sent while the first
  // is on its way would only revert.
  const earlier = await db.voterListPublication.findUnique({ where: { election } });
  if (earlier?.txHash) {
    const outcome = await outcomeOf(earlier.txHash as Hex);
    if (outcome === "success") return publishedList(election);
    if (outcome === "pending") {
      throw new HttpError(409, "The voter list was sent to the chain and is waiting to be mined.");
    }
    log.warn({ election, txHash: earlier.txHash, outcome }, "Sending the voter list again");
  }

  // Freezing the list stops any later registration. If an earlier attempt failed after this
  // point, the list it froze is rebuilt unchanged. Hashing a large list takes a few seconds.
  const { list, root, count } = await withElectionLock(
    election,
    async (tx) => {
      const registrations = await tx.registration.findMany({
        where: { election },
        select: { voter: true },
      });
      if (registrations.length === 0) {
        throw new HttpError(409, "Nobody has registered, so there is no voter list to publish.");
      }
      const voters = registrations.map((registration) => registration.voter);
      // Tier 2 lists wallet addresses under a keccak Merkle tree; tier 3 lists identity
      // commitments under Semaphore's Poseidon tree.
      const built =
        state.tier === 3
          ? (() => {
              const list = buildIdentityList({ chainId: chain.id, election, commitments: voters });
              const tree = identityTree(list.commitments);
              return { list, root: rootToBytes32(tree.root), count: list.commitments.length };
            })()
          : (() => {
              const list = buildVoterList({ chainId: chain.id, election, voters });
              return {
                list,
                root: voterTree(list.voters).root as Hex,
                count: list.voters.length,
              };
            })();
      await tx.voterListPublication.upsert({
        where: { election },
        create: { election, root: built.root, count: built.count },
        update: {},
      });
      return built;
    },
    { timeout: 60_000 },
  );

  const cid = await pinJson(list, `voter-list-${election}.json`);
  await db.voterListPublication.update({ where: { election }, data: { cid, txHash: null } });

  const contract = { address: election, abi: merkleElectionAbi, account: registrar.account };
  if (state.phase === Phase.Created) {
    const { request } = await publicClient.simulateContract({
      ...contract,
      ...simulateAt,
      functionName: "openRegistration",
    });
    await confirm(await registrar.writeContract(request));
  }
  const { request } = await publicClient.simulateContract({
    ...contract,
    ...simulateAt,
    functionName: "publishVoterList",
    args: [root, BigInt(count), cid],
  });
  const txHash = await registrar.writeContract(request);
  // Recorded before waiting, so that a later attempt checks on this transaction rather than
  // sending another.
  await db.voterListPublication.update({ where: { election }, data: { txHash } });
  await confirm(txHash);

  log.info({ election, root, count, cid, txHash }, "Published the voter list");
  return { root, count, cid, txHash };
}

/** The voter list as the chain records it, with the transaction that sent it if it is known. */
async function publishedList(election: Address): Promise<Publication> {
  const contract = { address: election, abi: merkleElectionAbi } as const;
  const [root, count, cid, record] = await Promise.all([
    publicClient.readContract({ ...contract, functionName: "voterRoot" }),
    publicClient.readContract({ ...contract, functionName: "voterCount" }),
    publicClient.readContract({ ...contract, functionName: "voterListCid" }),
    db.voterListPublication.findUnique({ where: { election } }),
  ]);
  const txHash = record?.root === root ? (record.txHash as Hex | null) : null;
  return { root, count: Number(count), cid, ...(txHash ? { txHash } : {}) };
}

/** What became of a transaction sent earlier. */
async function outcomeOf(hash: Hex): Promise<"success" | "reverted" | "pending" | "dropped"> {
  try {
    return (await publicClient.getTransactionReceipt({ hash })).status;
  } catch (error) {
    if (!(error instanceof TransactionReceiptNotFoundError)) throw error;
  }
  try {
    await publicClient.getTransaction({ hash });
    return "pending";
  } catch (error) {
    if (error instanceof TransactionNotFoundError) return "dropped";
    throw error;
  }
}

/**
 * What the publisher has learned about the elections it watches. A restarted Anvil node is a new
 * chain that reuses the same election addresses, so this is kept only while the chain is the same.
 */
const watched = {
  genesis: undefined as Hex | undefined,
  /** Fixed once registration opens, which it has for any election with registrations. */
  schedules: new Map<string, { registrationEnd: bigint; votingStart: bigint }>(),
  /** Elections with nothing left to publish: published, cancelled, or past the deadline. */
  finished: new Set<string>(),
};

/**
 * Publishes every voter list that is due, among the elections this registrar has registrations
 * for, so that nobody has to ask. Between checks it asks the chain only about elections whose
 * window for publishing is open.
 */
export async function publishDueVoterLists(log: FastifyBaseLogger): Promise<void> {
  const genesis = (await publicClient.getBlock({ blockNumber: 0n })).hash;
  if (genesis !== watched.genesis) {
    watched.genesis = genesis;
    watched.schedules.clear();
    watched.finished.clear();
  }

  const registered = await db.registration.groupBy({ by: ["election"] });
  const now = await chainNow();
  for (const { election } of registered) {
    if (watched.finished.has(election)) continue;
    try {
      let schedule = watched.schedules.get(election);
      if (!schedule) {
        const state = await readElection(election as Address);
        schedule = { registrationEnd: state.registrationEnd, votingStart: state.votingStart };
        watched.schedules.set(election, schedule);
      }
      if (now < schedule.registrationEnd) continue;

      const state = await readElection(election as Address);
      if (!state.isVoterListPublished && state.phase !== Phase.Cancelled) {
        if (now >= schedule.votingStart) {
          log.warn({ election }, "Voting was due before the voter list could be published");
        } else {
          await publishVoterList(election as Address, log);
        }
      }
      watched.finished.add(election);
    } catch (error) {
      // An election this registrar no longer serves stays that way.
      if (error instanceof HttpError && (error.statusCode === 403 || error.statusCode === 404)) {
        watched.finished.add(election);
      }
      log.warn({ err: loggable(error), election }, "Could not publish the voter list");
    }
  }
}

async function confirm(hash: Hex) {
  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: CONFIRM_TIMEOUT_MS,
    });
    if (receipt.status !== "success") throw new Error(`Transaction ${hash} reverted`);
  } catch (error) {
    if (error instanceof WaitForTransactionReceiptTimeoutError) {
      throw new HttpError(
        409,
        "The registrar's transaction is waiting to be mined. Try again soon.",
      );
    }
    throw error;
  }
}
