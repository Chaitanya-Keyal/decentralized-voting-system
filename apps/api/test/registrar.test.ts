import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";

import {
  googleNonce,
  Identity,
  identityReceiptSchema,
  identityReceiptTypedData,
  identityTree,
  merkleElectionAbi,
  parseIdentityList,
  proveBallot,
  rootToBytes32,
  semaphoreElectionAbi,
  verifyIdentityList,
  parseVoterList,
  receiptSchema,
  receiptTypedData,
  verifyVoterList,
  voterProof,
} from "@dvote/shared";
import type { FastifyInstance } from "fastify";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureArtifacts } from "../../../packages/shared/scripts/semaphore-artifacts.mjs";
import { buildApp } from "../src/app";
import { db } from "../src/db";
import { publishDueVoterLists } from "../src/registrar";
import {
  chain,
  createElection,
  newEmail,
  newVoter,
  node,
  REGISTRAR,
  signRegistration,
  warpTo,
  type TestElection,
} from "./helpers";

// Emails and IPFS are replaced: the codes are read from `mail`, and pinned documents from `ipfs`.
// Mail to an address in `mail.failing` fails, as does pinning a document described as "fail".
const mail = vi.hoisted(() => ({ codes: new Map<string, string>(), failing: new Set<string>() }));
const ipfs = vi.hoisted(() => ({ pinned: new Map<string, unknown>() }));

vi.mock("../src/mailer", () => ({
  sendCode: (message: { to: string; code: string }) => {
    if (mail.failing.has(message.to)) return Promise.reject(new Error("SMTP is down"));
    mail.codes.set(message.to, message.code);
    return Promise.resolve();
  },
}));

vi.mock("../src/ipfs", () => ({
  pinJson: (value: unknown) => {
    if ((value as { description?: string }).description === "fail") {
      return Promise.reject(new Error("IPFS add failed at http://192.0.2.7:5001/?key=secret"));
    }
    const cid = `bafytest${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
    ipfs.pinned.set(cid, value);
    return Promise.resolve(cid);
  },
}));

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ logger: false });
});

afterAll(async () => {
  await app.close();
});

function post(url: string, payload: object) {
  return app.inject({ method: "POST", url, payload });
}

async function requestCode(election: Address, email: string): Promise<string> {
  const response = await post(`/elections/${election}/codes`, { email });
  expect(response.statusCode, response.body).toBe(200);
  const code = mail.codes.get(email);
  if (!code) throw new Error(`No code was sent to ${email}`);
  return code;
}

/** Registers a new voter with a new email address, and returns the response. */
async function registerVoter(election: Address, voter = newVoter(), email = newEmail()) {
  const code = await requestCode(election, email);
  const signature = await signRegistration(voter, election, email);
  const response = await post(`/elections/${election}/registrations`, {
    email,
    code,
    voter: voter.address,
    signature,
  });
  return { response, voter, email };
}

async function registrationCount(election: Address): Promise<number> {
  const response = await app.inject(`/elections/${election}/registrations/count`);
  return response.json<{ count: number }>().count;
}

describe("GET /config", () => {
  it("names the chain, the registrar and the factory", async () => {
    const response = await app.inject("/config");
    expect(response.json()).toMatchObject({ chainId: chain.id, registrar: REGISTRAR });
  });
});

describe("registration", () => {
  let test: TestElection;

  beforeEach(async () => {
    test = await createElection();
    await warpTo(test.schedule.registrationStart);
  });

  it("registers a wallet and returns a receipt signed by the registrar", async () => {
    const { response, voter } = await registerVoter(test.election);

    expect(response.statusCode, response.body).toBe(200);
    const receipt = receiptSchema.parse(response.json());
    expect(receipt).toMatchObject({
      chainId: chain.id,
      election: test.election,
      voter: voter.address,
      registrar: REGISTRAR,
    });
    const signer = await recoverTypedDataAddress({
      ...receiptTypedData(receipt),
      signature: receipt.signature,
    });
    expect(signer).toBe(REGISTRAR);
    expect(await registrationCount(test.election)).toBe(1);
  });

  it("does not accept a + tag, which would let one mailbox register several wallets", async () => {
    const response = await post(`/elections/${test.election}/codes`, {
      email: "f20230001+second@hyderabad.bits-pilani.ac.in",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/\+ tag/);
  });

  it("refuses the zero address, which an invalid signature recovers to", async () => {
    const email = newEmail();
    const code = await requestCode(test.election, email);
    const response = await post(`/elections/${test.election}/registrations`, {
      email,
      code,
      voter: "0x0000000000000000000000000000000000000000",
      signature: `0x${"00".repeat(64)}1b`,
    });
    expect(response.statusCode).toBe(400);
  });

  it("only accepts institute email addresses", async () => {
    const response = await post(`/elections/${test.election}/codes`, {
      email: "someone@gmail.com",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/hyderabad\.bits-pilani\.ac\.in/);
  });

  it("refuses to send codes before registration opens", async () => {
    const early = await createElection();
    const response = await post(`/elections/${early.election}/codes`, { email: newEmail() });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ message: string }>().message).toMatch(/not opened/);
  });

  it("refuses to send codes after registration closes", async () => {
    await warpTo(test.schedule.registrationEnd);
    const response = await post(`/elections/${test.election}/codes`, { email: newEmail() });
    expect(response.statusCode).toBe(409);
  });

  it("sends at most one code a minute to an address", async () => {
    const email = newEmail();
    await requestCode(test.election, email);
    const again = await post(`/elections/${test.election}/codes`, { email });
    expect(again.statusCode).toBe(429);
  });

  it("sends one code when asked for several at once", async () => {
    const email = newEmail();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => post(`/elections/${test.election}/codes`, { email })),
    );
    const statuses = responses.map((response) => response.statusCode).sort();
    expect(statuses).toEqual([200, 429, 429, 429, 429]);
  });

  it("does not count a code that could not be emailed", async () => {
    const email = newEmail();
    mail.failing.add(email);
    const failed = await post(`/elections/${test.election}/codes`, { email });
    expect(failed.statusCode).toBe(502);
    mail.failing.delete(email);
    // Without the failed code counting, there is no minute to wait.
    await requestCode(test.election, email);
  });

  it("sends at most twenty codes a day to an address", async () => {
    const email = newEmail();
    try {
      for (let i = 0; i < 20; i++) {
        vi.useFakeTimers({ now: Date.now() + (i * 61 + 1) * 1000, toFake: ["Date"] });
        await requestCode(test.election, email);
      }
      vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ["Date"] });
      const extra = await post(`/elections/${test.election}/codes`, { email });
      expect(extra.statusCode).toBe(429);
      expect(extra.json<{ message: string }>().message).toMatch(/today/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a wrong code, and stops accepting the code after five attempts", async () => {
    const voter = newVoter();
    const email = newEmail();
    const code = await requestCode(test.election, email);
    const signature = await signRegistration(voter, test.election, email);
    const attempt = (guess: string) =>
      post(`/elections/${test.election}/registrations`, {
        email,
        code: guess,
        voter: voter.address,
        signature,
      });

    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      expect((await attempt(wrong)).statusCode).toBe(400);
    }
    expect((await attempt(code)).statusCode).toBe(429);
    expect(await registrationCount(test.election)).toBe(0);
  });

  it("rejects a signature made by a different wallet", async () => {
    const email = newEmail();
    const code = await requestCode(test.election, email);
    const signature = await signRegistration(newVoter(), test.election, email);
    const response = await post(`/elections/${test.election}/registrations`, {
      email,
      code,
      voter: newVoter().address,
      signature,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/signature/);
  });

  it("does not let two email addresses register the same wallet", async () => {
    const voter = newVoter();
    expect((await registerVoter(test.election, voter)).response.statusCode).toBe(200);
    const second = await registerVoter(test.election, voter);
    expect(second.response.statusCode).toBe(409);
    expect(await registrationCount(test.election)).toBe(1);
  });

  it("keeps an email address's first wallet, giving it a fresh receipt", async () => {
    const email = newEmail();
    const voter = newVoter();
    await registerVoter(test.election, voter, email);
    // The one-minute limit applies to codes, so move the wall clock on as well as the chain.
    try {
      vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ["Date"] });
      const again = await registerVoter(test.election, voter, email);
      expect(again.response.statusCode, again.response.body).toBe(200);
      expect(receiptSchema.parse(again.response.json()).voter).toBe(voter.address);

      // Moving to another wallet would let a registrar pass off a swap as the voter's own doing.
      vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ["Date"] });
      const other = await registerVoter(test.election, newVoter(), email);
      expect(other.response.statusCode).toBe(409);
      expect(other.response.json<{ message: string }>().message).toContain(voter.address);
    } finally {
      vi.useRealTimers();
    }
    expect(await registrationCount(test.election)).toBe(1);
  });

  it("closes as soon as the registrar starts publishing, whatever the clock says", async () => {
    const email = newEmail();
    const voter = newVoter();
    const code = await requestCode(test.election, email);
    // Publishing has begun, so the list is frozen, even though the chain's clock is still early.
    await db.voterListPublication.create({
      data: { election: test.election, root: "0x01", count: 1 },
    });
    const response = await post(`/elections/${test.election}/registrations`, {
      email,
      code,
      voter: voter.address,
      signature: await signRegistration(voter, test.election, email),
    });
    expect(response.statusCode).toBe(409);
    expect(await registrationCount(test.election)).toBe(0);
  });

  it("does not serve an election that names another registrar", async () => {
    const elsewhere = await createElection("Elsewhere", { registrar: newVoter().address });
    await warpTo(elsewhere.schedule.registrationStart);
    const response = await post(`/elections/${elsewhere.election}/codes`, { email: newEmail() });
    expect(response.statusCode).toBe(403);
  });

  it("does not serve an election whose authority is not on its list", async () => {
    const unknown = await createElection("Unapproved", {
      authority: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    });
    await warpTo(unknown.schedule.registrationStart);
    const response = await post(`/elections/${unknown.election}/codes`, { email: newEmail() });
    expect(response.statusCode).toBe(403);
  });

  it("answers 404 for an address that is not an election", async () => {
    const response = await post(`/elections/${newVoter().address}/codes`, { email: newEmail() });
    expect(response.statusCode).toBe(404);
  });

  it("answers 400 for an election that is not an address", async () => {
    const response = await post(`/elections/not-an-address/codes`, { email: newEmail() });
    expect(response.statusCode).toBe(400);
  });
});

describe("publishing the voter list", () => {
  let test: TestElection;

  beforeEach(async () => {
    test = await createElection();
    await warpTo(test.schedule.registrationStart);
  });

  it("is refused while registration is open", async () => {
    await registerVoter(test.election);
    const response = await post(`/elections/${test.election}/voter-list`, {});
    expect(response.statusCode).toBe(409);
  });

  it("is refused when nobody registered", async () => {
    await warpTo(test.schedule.registrationEnd);
    const response = await post(`/elections/${test.election}/voter-list`, {});
    expect(response.statusCode).toBe(409);
  });

  it("records the list on-chain, and every registered voter can then vote", async () => {
    const voters = [];
    for (let i = 0; i < 3; i++) {
      const { response, voter } = await registerVoter(test.election);
      expect(response.statusCode, response.body).toBe(200);
      voters.push(voter);
    }

    await warpTo(test.schedule.registrationEnd);
    const response = await post(`/elections/${test.election}/voter-list`, {});
    expect(response.statusCode, response.body).toBe(200);
    const publication = response.json<{ root: `0x${string}`; count: number; cid: string }>();
    expect(publication.count).toBe(3);

    const contract = { address: test.election, abi: merkleElectionAbi } as const;
    expect(await node.readContract({ ...contract, functionName: "voterRoot" })).toBe(
      publication.root,
    );
    expect(await node.readContract({ ...contract, functionName: "voterCount" })).toBe(3n);
    expect(await node.readContract({ ...contract, functionName: "voterListCid" })).toBe(
      publication.cid,
    );

    // The pinned list rebuilds to the published root, as the booth checks.
    const list = parseVoterList(ipfs.pinned.get(publication.cid));
    const tree = verifyVoterList(list, {
      chainId: chain.id,
      election: test.election,
      root: publication.root,
      count: 3n,
    });

    // Registration is now closed, even before the schedule says so to anyone else.
    const late = await post(`/elections/${test.election}/codes`, { email: newEmail() });
    expect(late.statusCode).toBe(409);

    await warpTo(test.schedule.votingStart);
    await node.waitForTransactionReceipt({
      hash: await node.writeContract({
        ...contract,
        account: REGISTRAR,
        functionName: "openVoting",
      }),
    });
    for (const [i, voter] of voters.entries()) {
      await node.setBalance({ address: voter.address, value: 10n ** 18n });
      const proof = voterProof(tree, voter.address);
      if (!proof) throw new Error("A registered voter is missing from the list");
      const hash = await node.writeContract({
        ...contract,
        account: voter,
        functionName: "castVote",
        args: [BigInt(i % 2), proof],
      });
      expect((await node.waitForTransactionReceipt({ hash })).status).toBe("success");
    }
    expect(await node.readContract({ ...contract, functionName: "tally" })).toEqual([2n, 1n]);
  });

  it("is refused once voting is due, and the registrar stops trying", async () => {
    await registerVoter(test.election);
    await warpTo(test.schedule.votingStart);
    const response = await post(`/elections/${test.election}/voter-list`, {});
    expect(response.statusCode).toBe(409);
    expect(response.json<{ message: string }>().message).toMatch(/can no longer be published/);

    await publishDueVoterLists(app.log);
    const contract = { address: test.election, abi: merkleElectionAbi } as const;
    expect(await node.readContract({ ...contract, functionName: "isVoterListPublished" })).toBe(
      false,
    );
  });

  it("does not send a second transaction while the first is waiting to be mined", async () => {
    await registerVoter(test.election);
    const contract = { address: test.election, abi: merkleElectionAbi } as const;
    await warpTo(test.schedule.registrationEnd);
    await node.waitForTransactionReceipt({
      hash: await node.writeContract({
        ...contract,
        account: REGISTRAR,
        functionName: "openRegistration",
      }),
    });
    const sent = await node.getTransactionCount({ address: REGISTRAR });

    await node.setAutomine(false);
    try {
      const first = await post(`/elections/${test.election}/voter-list`, {});
      expect(first.statusCode).toBe(409);
      expect(first.json<{ message: string }>().message).toMatch(/waiting to be mined/);
      const second = await post(`/elections/${test.election}/voter-list`, {});
      expect(second.statusCode).toBe(409);
      expect(await node.getTransactionCount({ address: REGISTRAR, blockTag: "pending" })).toBe(
        sent + 1,
      );
    } finally {
      await node.setAutomine(true);
    }
    await node.mine({ blocks: 1 });

    const third = await post(`/elections/${test.election}/voter-list`, {});
    expect(third.statusCode, third.body).toBe(200);
    expect(await node.readContract({ ...contract, functionName: "isVoterListPublished" })).toBe(
      true,
    );
  });

  it("answers from the chain if its own record of the publication is lost", async () => {
    await registerVoter(test.election);
    await warpTo(test.schedule.registrationEnd);
    const first = await post(`/elections/${test.election}/voter-list`, {});
    expect(first.statusCode).toBe(200);
    await db.voterListPublication.delete({ where: { election: test.election } });

    const again = await post(`/elections/${test.election}/voter-list`, {});
    expect(again.statusCode, again.body).toBe(200);
    const { root, count, cid } = first.json<{ root: string; count: number; cid: string }>();
    expect(again.json()).toEqual({ root, count, cid });
  });

  it("answers a second request with the same publication", async () => {
    await registerVoter(test.election);
    await warpTo(test.schedule.registrationEnd);
    const first = await post(`/elections/${test.election}/voter-list`, {});
    expect(first.statusCode).toBe(200);
    const second = await post(`/elections/${test.election}/voter-list`, {});
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
  });

  it("happens by itself once registration closes", async () => {
    await registerVoter(test.election);
    const contract = { address: test.election, abi: merkleElectionAbi } as const;

    await publishDueVoterLists(app.log);
    expect(await node.readContract({ ...contract, functionName: "isVoterListPublished" })).toBe(
      false,
    );

    await warpTo(test.schedule.registrationEnd);
    await publishDueVoterLists(app.log);
    expect(await node.readContract({ ...contract, functionName: "isVoterListPublished" })).toBe(
      true,
    );
  });
});

describe("tier 3: anonymous voters", () => {
  let test: TestElection;
  const artifacts = new URL("../node_modules/.cache/semaphore-artifacts/", import.meta.url)
    .pathname;

  beforeAll(async () => {
    await ensureArtifacts(artifacts, [2]);
  }, 120_000);

  beforeEach(async () => {
    test = await createElection("Anonymous senate", { tier: 3 });
    await warpTo(test.schedule.registrationStart);
  });

  async function registerIdentity(identity = new Identity(), email = newEmail()) {
    const code = await requestCode(test.election, email);
    const response = await post(`/elections/${test.election}/registrations`, {
      email,
      code,
      commitment: identity.commitment.toString(),
    });
    return { response, identity, email };
  }

  it("registers an identity commitment, with a receipt signed by the registrar", async () => {
    const { response, identity } = await registerIdentity();
    expect(response.statusCode, response.body).toBe(200);
    const receipt = identityReceiptSchema.parse(response.json());
    expect(receipt).toMatchObject({
      election: test.election,
      commitment: identity.commitment.toString(),
      registrar: REGISTRAR,
    });
    const signer = await recoverTypedDataAddress({
      ...identityReceiptTypedData(receipt),
      signature: receipt.signature,
    });
    expect(signer).toBe(REGISTRAR);
  });

  it("refuses a wallet where it expects an identity", async () => {
    const email = newEmail();
    const voter = newVoter();
    const code = await requestCode(test.election, email);
    const response = await post(`/elections/${test.election}/registrations`, {
      email,
      code,
      voter: voter.address,
      signature: await signRegistration(voter, test.election, email),
    });
    expect(response.statusCode).toBe(400);
  });

  it("keeps an email address's first identity", async () => {
    const email = newEmail();
    const identity = new Identity();
    await registerIdentity(identity, email);
    try {
      vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ["Date"] });
      const again = await registerIdentity(identity, email);
      expect(again.response.statusCode, again.response.body).toBe(200);
      vi.useFakeTimers({ now: Date.now() + 61_000, toFake: ["Date"] });
      const other = await registerIdentity(new Identity(), email);
      expect(other.response.statusCode).toBe(409);
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishes the identity list, and a registered voter's anonymous ballot counts", async () => {
    const voters = [new Identity(), new Identity(), new Identity()];
    for (const voter of voters) {
      const { response } = await registerIdentity(voter);
      expect(response.statusCode, response.body).toBe(200);
    }

    await warpTo(test.schedule.registrationEnd);
    const published = await post(`/elections/${test.election}/voter-list`, {});
    expect(published.statusCode, published.body).toBe(200);
    const { root, cid } = published.json<{ root: `0x${string}`; cid: string }>();

    // The pinned list rebuilds to the root on-chain, as the booth and auditors check.
    const contract = { address: test.election, abi: semaphoreElectionAbi } as const;
    expect(await node.readContract({ ...contract, functionName: "voterRoot" })).toBe(root);
    const list = parseIdentityList(ipfs.pinned.get(cid));
    const tree = verifyIdentityList(list, {
      chainId: chain.id,
      election: test.election,
      root,
      count: 3n,
    });
    expect(rootToBytes32(identityTree(list.commitments).root)).toBe(root);

    await warpTo(test.schedule.votingStart);
    await node.waitForTransactionReceipt({
      hash: await node.writeContract({
        ...contract,
        account: REGISTRAR,
        functionName: "openVoting",
      }),
    });
    const ballot = await proveBallot({
      identity: voters[1]!,
      tree,
      election: test.election,
      choice: 1n,
      artifacts: (depth) => ({
        wasm: `${artifacts}semaphore-${depth}.wasm`,
        zkey: `${artifacts}semaphore-${depth}.zkey`,
      }),
    });
    // Anyone can submit an anonymous ballot; here the registrar's account pays the gas.
    const cast = () =>
      node.writeContract({
        ...contract,
        account: REGISTRAR,
        functionName: "castVote",
        args: [ballot.choice, ballot.nullifier, ballot.points],
      });
    expect((await node.waitForTransactionReceipt({ hash: await cast() })).status).toBe("success");
    expect(await node.readContract({ ...contract, functionName: "tally" })).toEqual([0n, 1n]);
    // The same voter cannot vote again: the nullifier is spent.
    await expect(
      node.simulateContract({
        ...contract,
        account: REGISTRAR,
        functionName: "castVote",
        args: [ballot.choice, ballot.nullifier, ballot.points],
      }),
    ).rejects.toThrow(/AlreadyVoted/);
  }, 120_000);
});

describe("POST /metadata", () => {
  it("pins a ballot description", async () => {
    const response = await post("/metadata", {
      format: "dvote-election-v1",
      description: "Elect the student senate for 2026-27.",
    });
    expect(response.statusCode).toBe(200);
    expect(ipfs.pinned.get(response.json<{ cid: string }>().cid)).toMatchObject({
      format: "dvote-election-v1",
    });
  });

  it("refuses a document it does not know", async () => {
    const response = await post("/metadata", { format: "something", text: "hi" });
    expect(response.statusCode).toBe(400);
  });

  it("answers an unexpected failure without its internal details", async () => {
    const response = await post("/metadata", { format: "dvote-election-v1", description: "fail" });
    expect(response.statusCode).toBe(500);
    expect(response.json<{ message: string }>().message).toMatch(/Try again/);
    expect(response.body).not.toContain("secret");
    expect(response.body).not.toContain("192.0.2.7");
  });
});

describe("Google sign-in", () => {
  const CLIENT_ID = "dvote-test.apps.googleusercontent.com";
  let server: Server;
  let signingKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    signingKey = privateKey;
    const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "RS256", use: "sig" };
    server = createServer((_, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(8566, "127.0.0.1", resolve));
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  /** An ID token as Google would issue it, with any claim overridden. */
  function idToken(
    email: string,
    options: {
      claims?: Record<string, unknown>;
      audience?: string;
      expiresAt?: number | string;
      issuedAt?: number;
    } = {},
  ) {
    return new SignJWT({
      email,
      email_verified: true,
      hd: "hyderabad.bits-pilani.ac.in",
      ...options.claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://accounts.google.com")
      .setAudience(options.audience ?? CLIENT_ID)
      .setSubject("1234567890")
      .setIssuedAt(options.issuedAt)
      .setExpirationTime(options.expiresAt ?? "1h")
      .sign(signingKey);
  }

  let test: TestElection;
  beforeEach(async () => {
    test = await createElection("Google sign-in", { tier: 3 });
    await warpTo(test.schedule.registrationStart);
  });

  /**
   * Registers a new voting key, signed in with the token `token` makes from the nonce the web app
   * would have given Google for that key and election.
   */
  const registerWith = async (
    email: string,
    token: (nonce: Hex, commitment: string) => Promise<string>,
  ) => {
    const commitment = new Identity().commitment.toString();
    return post(`/elections/${test.election}/registrations`, {
      email,
      googleIdToken: await token(googleNonce(31337, test.election, commitment), commitment),
      commitment,
    });
  };

  it("registers a voter signed in with an institute Google account, without a code", async () => {
    const email = newEmail();
    const response = await registerWith(email, (nonce) => idToken(email, { claims: { nonce } }));
    expect(response.statusCode, response.body).toBe(200);
    expect(identityReceiptSchema.parse(response.json()).registrar).toBe(REGISTRAR);
  });

  it("registers a wallet the same way", async () => {
    const wallets = await createElection("Google sign-in, wallets");
    await warpTo(wallets.schedule.registrationStart);
    const email = newEmail();
    const voter = newVoter();
    const nonce = googleNonce(31337, wallets.election, voter.address);
    const response = await post(`/elections/${wallets.election}/registrations`, {
      email,
      googleIdToken: await idToken(email, { claims: { nonce } }),
      voter: voter.address,
      signature: await signRegistration(voter, wallets.election, email),
    });
    expect(response.statusCode, response.body).toBe(200);
  });

  it("refuses a sign-in made for another voting key, or another election", async () => {
    const email = newEmail();
    const otherKey = googleNonce(31337, test.election, new Identity().commitment.toString());
    expect(
      (await registerWith(email, () => idToken(email, { claims: { nonce: otherKey } }))).statusCode,
    ).toBe(400);
    const other = await createElection("Another election", { tier: 3 });
    // The same voting key, but the nonce of another election.
    const response = await registerWith(email, (_, commitment) =>
      idToken(email, { claims: { nonce: googleNonce(31337, other.election, commitment) } }),
    );
    expect(response.statusCode).toBe(400);
    expect(
      (await registerWith(email, () => idToken(email))).statusCode,
      "a token without a nonce",
    ).toBe(400);
  });

  it("refuses an account outside the institute's Google domain, whatever its address", async () => {
    const email = newEmail();
    const response = await registerWith(email, (nonce) =>
      idToken(email, { claims: { nonce, hd: undefined } }),
    );
    expect(response.statusCode).toBe(403);
  });

  it("refuses a sign-in for another address, another app, or one that has expired", async () => {
    const email = newEmail();
    expect(
      (await registerWith(email, (nonce) => idToken(newEmail(), { claims: { nonce } }))).statusCode,
    ).toBe(400);
    expect(
      (
        await registerWith(email, (nonce) =>
          idToken(email, {
            claims: { nonce },
            audience: "someone-else.apps.googleusercontent.com",
          }),
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await registerWith(email, (nonce) =>
          idToken(email, { claims: { nonce }, expiresAt: Math.floor(Date.now() / 1000) - 600 }),
        )
      ).statusCode,
    ).toBe(400);
  });

  it("refuses a sign-in more than ten minutes old, even if Google's token has not expired", async () => {
    const email = newEmail();
    const issuedAt = Math.floor(Date.now() / 1000) - 11 * 60;
    const response = await registerWith(email, (nonce) =>
      idToken(email, { claims: { nonce }, issuedAt, expiresAt: issuedAt + 3600 }),
    );
    expect(response.statusCode).toBe(400);
  });

  it("refuses a token signed by anyone but Google", async () => {
    const email = newEmail();
    const { privateKey } = await generateKeyPair("RS256");
    const response = await registerWith(email, (nonce) =>
      new SignJWT({ email, email_verified: true, hd: "hyderabad.bits-pilani.ac.in", nonce })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer("https://accounts.google.com")
        .setAudience(CLIENT_ID)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey),
    );
    expect(response.statusCode).toBe(400);
  });

  it("takes either a code or a Google sign-in, not both", async () => {
    const email = newEmail();
    const code = await requestCode(test.election, email);
    const response = await post(`/elections/${test.election}/registrations`, {
      email,
      code,
      googleIdToken: await idToken(email),
      commitment: new Identity().commitment.toString(),
    });
    expect(response.statusCode).toBe(400);
  });
});
