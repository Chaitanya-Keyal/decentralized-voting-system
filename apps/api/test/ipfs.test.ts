// Copying documents to Pinata: the node's own bytes go up, the CID that comes back must be the
// node's, and nothing that goes wrong is thrown at the caller.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CID = "bafkreicduhhgcd2gl7aspvyyuoecteqetvhxr3tdt3w2mjcodyx6zorysi";
const log = { info: vi.fn(), warn: vi.fn() };

/** A stand-in for the IPFS node and Pinata: `pinata` answers each upload. */
function stubNetwork(pinata: () => Response) {
  const uploads: FormData[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      if (url.includes("/api/v0/cat")) return Promise.resolve(new Response('{"format":"x"}'));
      uploads.push(init.body as FormData);
      return Promise.resolve(pinata());
    }),
  );
  return uploads;
}

async function copy(documents = [{ cid: CID, name: "doc.json" }]) {
  const { copyToPinata } = await import("../src/ipfs");
  return copyToPinata(documents, log as never);
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("PINATA_JWT", "test-jwt");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("copying to Pinata", () => {
  it("sends the node's bytes to the public network and checks the CID that comes back", async () => {
    const uploads = stubNetwork(() => Response.json({ data: { cid: CID } }));
    expect(await copy()).toEqual({ copied: 1, failed: 0 });
    const body = uploads[0]!;
    expect(body.get("network")).toBe("public");
    expect(body.get("cid_version")).toBe("v1");
    expect(await (body.get("file") as Blob).text()).toBe('{"format":"x"}');
  });

  it("counts a copy with another CID as failed", async () => {
    stubNetwork(() => Response.json({ data: { cid: "bafkreisomethingelse" } }));
    expect(await copy()).toEqual({ copied: 0, failed: 1 });
    expect(log.warn).toHaveBeenCalled();
  });

  it("reports a refusal without throwing, and goes on to the next document", async () => {
    let calls = 0;
    stubNetwork(() =>
      calls++ === 0
        ? new Response("over the limit", { status: 403 })
        : Response.json({ data: { cid: CID } }),
    );
    const documents = [
      { cid: CID, name: "a.json" },
      { cid: CID, name: "b.json" },
    ];
    expect(await copy(documents)).toEqual({ copied: 1, failed: 1 });
  });

  it("does nothing without a key", async () => {
    vi.stubEnv("PINATA_JWT", "");
    const uploads = stubNetwork(() => Response.json({ data: { cid: CID } }));
    expect(await copy()).toEqual({ copied: 0, failed: 0 });
    expect(uploads).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
