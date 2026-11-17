// Builds the Evaluation 2 presentation into slides/build/eval2-slides.pptx.
// Run from reports/: node slides/build-deck-eval2.js
// Needs pptxgenjs, react, react-dom, react-icons and sharp on NODE_PATH.
//
// Every number on the slides is read from the committed results (bench/results, the gas
// snapshots, the deployment record), never typed in. A figure that is not there yet stops the
// build; DECK_DRAFT=1 builds anyway and shows it as "pending", for checking the layout.

const path = require("path");
const fs = require("fs");
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa6");

const OUT = path.join(__dirname, "build", "eval2-slides.pptx");
const ROOT = path.join(__dirname, "..", "..");
const RESULTS = path.join(ROOT, "bench", "results");
const LOGO = path.join(__dirname, "..", "figures", "bits-logo.png");
const DRAFT = process.env.DECK_DRAFT === "1";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const missing = [];

function readCsv(file) {
  const [header, ...lines] = fs.readFileSync(file, "utf8").trim().split("\n");
  const cols = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((v, i) => [cols[i], v])));
}

function results(pattern) {
  return fs
    .readdirSync(RESULTS)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => path.join(RESULTS, name));
}

/** A figure for a slide, or "pending" (draft builds only) if it has not been measured yet. */
function fig(value, label, format = (v) => String(v)) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    missing.push(label);
    return "pending";
  }
  return format(value);
}

const n0 = (v) => Math.round(v).toLocaleString("en-US");
const k = (v) => `${Math.round(v / 1000).toLocaleString("en-US")}k`;
const m2 = (v) => `${(v / 1e6).toFixed(2)}M`;
const s1 = (ms) => `${(ms / 1000).toFixed(1)} s`;

function quantile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function members() {
  const tex = fs.readFileSync(path.join(__dirname, "..", "metadata.tex"), "utf8");
  return [...tex.matchAll(/^\s*(\d{4}[A-Z0-9]{4}\d{4}H)\s*&\s*([^&]+?)\s*&/gm)].map((m) => [
    m[2].trim(),
    m[1],
  ]);
}

// Local gas, pre-Glamsterdam pricing (C1 sweep and the snapshot).
const gasRows = readCsv(path.join(RESULTS, "gas.csv"));
const sweep = (tier, operation) =>
  gasRows
    .filter((r) => r.tier === String(tier) && r.operation === operation)
    .map((r) => ({ roll: Number(r.roll_size), gas: Number(r.gas) }))
    .sort((a, b) => a.roll - b.roll);
const t3cast = sweep(3, "cast_vote");
const t2cast = sweep(2, "cast_vote");
const t3publish = sweep(3, "publish_roll");
const snap2 = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts", "snapshots", "tier2.json")));
const snap3 = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts", "snapshots", "tier3.json")));
const flatFrom4 = t3cast.filter((r) => r.roll >= 4).map((r) => r.gas);

// Sepolia under Glamsterdam: the newest complete gas run.
const sepoliaRuns = results(/^sepolia-gas-.*\.csv$/)
  .map(readCsv)
  .filter((rows) => rows.some((r) => r.operation === "finalize"));
const sepolia = sepoliaRuns.at(-1);
const sepoliaGas = (tier, operation) => {
  const rows = (sepolia ?? []).filter(
    (r) => r.tier === String(tier) && r.operation === operation,
  );
  return rows.length ? Math.min(...rows.map((r) => Number(r.gas))) : undefined;
};
// The election contract's deployment, from the receipts in the report's deployment table.
const DEPLOY_MERKLE_SEPOLIA = 14659413;

// C2: the booth's two costs, median of five runs.
const c2 = readCsv(path.join(RESULTS, "summary-arm64-node24.csv"));
const c2series = (phase) =>
  c2
    .filter((r) => r.phase === phase)
    .map((r) => ({ roll: Number(r.roll_size), ms: Number(r.median_ms) }))
    .sort((a, b) => a.roll - b.roll);
const prove = c2series("prove");
const rebuild = c2series("tree_rebuild");

// B1, end to end on Sepolia. The relayer changed how it sends at RELAYER_CHANGE (UTC, as in the
// file names); samples before and after are kept apart.
const RELAYER_CHANGE = "202611170200";
const b1 = (after, burst) =>
  results(burst ? /^b1-sepolia-burst-\d+\.csv$/ : /^b1-sepolia-\d+\.csv$/)
    .filter((file) => (path.basename(file).match(/(\d{12})/)[1] >= RELAYER_CHANGE) === after)
    .flatMap((file) => readCsv(file).map((r) => Number(r.click_to_counted_ms)));
const b1Before = b1(false, false);
const b1Now = b1(true, false);
const b1Burst = b1(true, true);
const stats = (values) =>
  values.length
    ? {
        n: values.length,
        median: median(values),
        slowest: Math.max(...values),
        p95: quantile([...values].sort((a, b) => a - b), 0.95),
      }
    : undefined;

// C3: a burst of voters through the relayer, local node with 12-second blocks.
function loadSummary(file) {
  if (!fs.existsSync(file)) return [];
  const rows = readCsv(file);
  const loads = [...new Set(rows.map((r) => Number(r.load)))].sort((a, b) => a - b);
  return loads.map((load) => {
    const counted = rows.filter((r) => Number(r.load) === load && r.outcome === "counted");
    const blocks = new Map();
    for (const r of counted) blocks.set(r.block, (blocks.get(r.block) ?? 0) + 1);
    return {
      load,
      counted: counted.length,
      failed: rows.filter((r) => Number(r.load) === load).length - counted.length,
      last: Math.max(...counted.map((r) => Number(r.counted_ms))),
      blocks: blocks.size,
      perBlock: Math.max(...blocks.values()),
    };
  });
}
const c3before = loadSummary(path.join(RESULTS, "load-concurrency-1.csv"));
const c3now = loadSummary(path.join(RESULTS, "load-concurrency-64.csv"));

// ---------------------------------------------------------------------------
// Look
// ---------------------------------------------------------------------------

const C = {
  navy: "1B2A41",
  navySoft: "2C3E5C",
  teal: "0F7C80",
  tealTint: "E6F2F2",
  amber: "F2A541",
  amberTint: "FDF3E3",
  ink: "23303F",
  muted: "5E6B7A",
  line: "D5DCE3",
  card: "F4F6F8",
  white: "FFFFFF",
  red: "B5483B",
  redTint: "F8E9E7",
};
const HEAD = "Cambria";
const BODY = "Calibri";

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Comp, { color: "#" + color, size: String(size) }),
  );
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

const shadow = () => ({ type: "outer", color: "000000", blur: 6, offset: 1.5, angle: 90, opacity: 0.12 });

function text(slide, t, o) {
  slide.addText(
    t,
    Object.assign(
      { fontFace: BODY, fontSize: 14, color: C.ink, margin: 0, isTextBox: true, valign: "top" },
      o,
    ),
  );
}

function title(slide, t, part) {
  text(slide, t, { x: 0.5, y: 0.3, w: 7.6, h: 0.6, fontFace: HEAD, fontSize: 28, bold: true, color: C.navy, valign: "middle" });
  if (part) {
    text(slide, part, { x: 8.1, y: 0.42, w: 1.4, h: 0.3, fontSize: 10, color: C.muted, align: "right" });
  }
}

function pageNo(slide, n) {
  text(slide, String(n), { x: 9.1, y: 5.25, w: 0.4, h: 0.25, fontSize: 9, color: C.muted, align: "right" });
}

function card(slide, x, y, w, h, fill = C.card) {
  slide.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: fill }, shadow: shadow(),
  });
}

function iconCircle(slide, data, x, y, d, fill) {
  slide.addShape("ellipse", { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } });
  const pad = d * 0.25;
  slide.addImage({ data, x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad });
}

function arrow(slide, x1, y1, x2, y2, o = {}) {
  slide.addShape("line", {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1,
    line: { color: o.color || C.navy, width: o.width || 1.5, dashType: o.dash ? "dash" : "solid", endArrowType: o.noHead ? undefined : "triangle" },
  });
}

/** A big number with a small label under it. */
function stat(slide, value, label, x, y, w, color = C.teal) {
  text(slide, value, { x, y, w, h: 0.6, fontFace: HEAD, fontSize: 30, bold: true, color });
  text(slide, label, { x, y: y + 0.62, w, h: 0.6, fontSize: 12, color: C.muted });
}

const rollLabel = (roll) => (roll >= 1024 ? `${roll / 1024}k` : String(roll));

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title = "DVote: Evaluation 2";

  const I = {
    list: await icon(fa.FaListCheck, C.white),
    box: await icon(fa.FaBoxArchive, C.white),
    calc: await icon(fa.FaCalculator, C.white),
    log: await icon(fa.FaFileLines, C.white),
    key: await icon(fa.FaKey, C.white),
    stamp: await icon(fa.FaStamp, C.white),
    phone: await icon(fa.FaMobileScreen, C.white),
    relay: await icon(fa.FaPaperPlane, C.white),
    chain: await icon(fa.FaLink, C.white),
    search: await icon(fa.FaMagnifyingGlass, C.white),
    wallet: await icon(fa.FaWallet, C.white),
    mask: await icon(fa.FaUserSecret, C.white),
    qr: await icon(fa.FaQrcode, C.white),
    google: await icon(fa.FaGoogle, C.white),
    bolt: await icon(fa.FaBolt, C.white),
    ruler: await icon(fa.FaRulerHorizontal, C.white),
    gas: await icon(fa.FaGasPump, C.white),
    route: await icon(fa.FaRoute, C.white),
    users: await icon(fa.FaUsers, C.white),
    ban: await icon(fa.FaBan, C.white),
    shield: await icon(fa.FaUserShield, C.white),
    eye: await icon(fa.FaEye, C.white),
    lock: await icon(fa.FaLock, C.white),
    flag: await icon(fa.FaFlag, C.white),
    warn: await icon(fa.FaTriangleExclamation, C.white),
    check: await icon(fa.FaCircleCheck, C.teal),
    half: await icon(fa.FaCircleHalfStroke, C.amber),
  };
  let page = 1;

  // 1. Title ---------------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.navy };
    s.addShape("roundRect", { x: 0.5, y: 0.45, w: 4.3, h: 1.05, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.white } });
    s.addImage({ path: LOGO, altText: "BITS Pilani, Hyderabad Campus logo", x: 0.65, y: 0.56, w: 4.0, h: (4.0 * 390) / 1890 });
    text(s, "DVote", { x: 0.5, y: 1.85, w: 5.2, h: 0.95, fontFace: HEAD, fontSize: 54, bold: true, color: C.white });
    text(s, "Anonymous, verifiable voting on Ethereum", { x: 0.5, y: 2.8, w: 5.0, h: 0.5, fontFace: HEAD, fontSize: 20, color: C.amber });
    text(s, "Blockchain Technology (BITS F452)  |  Group 6\nEvaluation 2: the final system", {
      x: 0.5, y: 3.55, w: 5.0, h: 0.7, fontSize: 14, color: "C9D3DF", paraSpaceAfter: 4,
    });
    const team = members();
    s.addShape("roundRect", { x: 5.45, y: 1.85, w: 4.05, h: 0.65 + team.length * 0.31, rectRadius: 0.08, fill: { color: C.navySoft }, line: { color: C.navySoft } });
    text(s, "Team", { x: 5.7, y: 1.98, w: 3.5, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.amber });
    s.addTable(
      team.map(([name, id]) => [
        { text: name, options: { color: C.white, fontSize: 12, fontFace: BODY } },
        { text: id, options: { color: "C9D3DF", fontSize: 12, fontFace: BODY, align: "right" } },
      ]),
      { x: 5.62, y: 2.38, w: 3.72, colW: [2.1, 1.62], rowH: 0.29, border: { type: "none" }, margin: [0, 0.08, 0, 0.08], valign: "middle" },
    );
    s.addNotes(
      "DVote is a voting system where the rules and the count live in a smart contract, and a voter can stay anonymous. At Evaluation 1 we presented the design and the plan. Today: what we built, how it performed against the parameters we set, and a live election on Sepolia.",
    );
  }

  // 2. The problem ---------------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "One operator runs the whole election", "Problem");
    text(s, "In most institutional elections one database is the voter roll, the ballot box, the count and the log. Nobody outside can check any of them, so voters have to trust whoever runs it.", {
      x: 0.5, y: 1.15, w: 3.7, h: 1.5, fontSize: 15,
    });
    card(s, 0.5, 2.85, 3.7, 1.85, C.tealTint);
    text(s, [
      { text: "What DVote changes", options: { bold: true, color: C.teal, breakLine: true } },
      { text: "The roll's fingerprint, every ballot and the count are on a public chain. Anyone can recount from the chain alone, and an anonymous ballot proves it is eligible without saying whose it is." },
    ], { x: 0.7, y: 3.0, w: 3.3, h: 1.6, fontSize: 13, paraSpaceAfter: 4 });
    const items = [
      [I.list, "Voter roll", "Fixed in public before voting; it cannot change after"],
      [I.box, "Ballot box", "Each ballot is a transaction; a second one from the same voter is refused"],
      [I.calc, "Count", "Kept by the contract as ballots arrive"],
      [I.search, "Audit", "Anyone recounts in the browser, from the chain and IPFS"],
    ];
    items.forEach(([ic, h, b], i) => {
      const x = 4.6 + (i % 2) * 2.5;
      const y = 1.15 + Math.floor(i / 2) * 1.85;
      card(s, x, y, 2.3, 1.65);
      iconCircle(s, ic, x + 0.2, y + 0.2, 0.5, C.teal);
      text(s, h, { x: x + 0.82, y: y + 0.27, w: 1.4, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: C.navy });
      text(s, b, { x: x + 0.2, y: y + 0.85, w: 1.95, h: 0.75, fontSize: 12, color: C.muted });
    });
    pageNo(s, ++page);
    s.addNotes("The problem from Evaluation 1, in one slide. Four jobs that one operator usually does, and what the chain does for each of them in DVote.");
  }

  // 3. Two tiers -------------------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "Two kinds of election, one contract design", "What we built");
    const cols = [
      {
        x: 0.5, icon: I.wallet, fill: C.navy, head: "Wallet ballots (tier 2)",
        lines: [
          "Voters register a wallet address",
          "A Merkle proof shows the wallet is on the list",
          "The voter's wallet sends the ballot and pays",
          "Who voted for whom is public",
        ],
        gas: `${n0(Number(snap2.castVote))} gas a ballot`,
      },
      {
        x: 5.1, icon: I.mask, fill: C.teal, head: "Anonymous ballots (tier 3)",
        lines: [
          "Voters register a key made in their browser",
          "A zero-knowledge proof shows the key is on the list, not which one",
          "A relayer sends the ballot and pays; no wallet needed",
          "Nobody, the registrar included, can tell whose ballot is whose",
        ],
        gas: `${n0(Number(snap3.castVote))} gas a ballot`,
      },
    ];
    for (const col of cols) {
      card(s, col.x, 1.15, 4.4, 3.6);
      iconCircle(s, col.icon, col.x + 0.25, 1.35, 0.6, col.fill);
      text(s, col.head, { x: col.x + 1.0, y: 1.45, w: 3.2, h: 0.45, fontFace: HEAD, fontSize: 18, bold: true, color: C.navy, valign: "middle" });
      text(s, col.lines.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < col.lines.length - 1 } })), {
        x: col.x + 0.3, y: 2.15, w: 3.9, h: 1.85, fontSize: 14, paraSpaceAfter: 6,
      });
      text(s, col.gas, { x: col.x + 0.3, y: 4.15, w: 3.9, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: col.fill });
    }
    text(s, "Both: plurality or approval voting, chosen when the election is created; time-gated phases; any wallet may close and finalize.", {
      x: 0.5, y: 4.9, w: 9.0, h: 0.35, fontSize: 12, color: C.muted,
    });
    pageNo(s, ++page);
    s.addNotes("Two tiers. Tier 2 is cheap and simple but public. Tier 3 is the anonymous one, and it is what the demo uses. The gas figures are measured locally under mainnet's current rules.");
  }

  // 4. An anonymous ballot ---------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "An anonymous ballot, start to finish", "How it works");
    const steps = [
      [I.key, "Key", "The browser makes a voting key. Only a public code made from it goes to the registrar."],
      [I.stamp, "List", "When registration closes, the registrar publishes the list on IPFS and its root on-chain."],
      [I.phone, "Proof", "The phone proves the key is on the list, binding the choice and this election."],
      [I.relay, "Relay", "The relayer checks the proof, then sends the ballot and pays the gas."],
      [I.ban, "Once", "The contract records a nullifier: the same key cannot vote twice here."],
    ];
    const w = 1.66;
    steps.forEach(([ic, h, b], i) => {
      const x = 0.5 + i * (w + 0.18);
      card(s, x, 1.3, w, 3.1);
      iconCircle(s, ic, x + (w - 0.62) / 2, 1.5, 0.62, i === 2 ? C.amber : C.teal);
      text(s, `${i + 1}. ${h}`, { x: x + 0.1, y: 2.25, w: w - 0.2, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: C.navy, align: "center" });
      text(s, b, { x: x + 0.15, y: 2.72, w: w - 0.3, h: 1.6, fontSize: 12, color: C.ink });
      if (i < steps.length - 1) arrow(s, x + w + 0.01, 2.85, x + w + 0.17, 2.85, { color: C.muted, width: 1.25 });
    });
    card(s, 0.5, 4.6, 9.0, 0.6, C.tealTint);
    text(s, "Then anyone can audit: the page rebuilds the list, re-checks every proof and recounts, using only the chain and IPFS.", {
      x: 0.7, y: 4.68, w: 8.6, h: 0.45, fontSize: 13, color: C.teal, bold: true, valign: "middle",
    });
    pageNo(s, ++page);
    s.addNotes("This is Semaphore v4. The nullifier is the same every time a given key votes in a given election, so the contract refuses a second ballot without learning who cast either. Proving happens on the voter's phone, in a Web Worker.");
  }

  // 5. Architecture ----------------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "Final architecture", "System");
    // Browser
    card(s, 0.5, 1.15, 2.6, 3.6, C.tealTint);
    text(s, "Voter's browser", { x: 0.7, y: 1.25, w: 2.2, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.teal });
    text(s, ["Election pages", "Booth: voting key, proof in a Web Worker", "Audit: recount from chain and IPFS", "Wallet, only for tier 2 or organisers"].map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })), {
      x: 0.7, y: 1.7, w: 2.3, h: 2.9, fontSize: 12, paraSpaceAfter: 5,
    });
    // Services
    const svc = [
      ["Registrar", "Checks the institute email, signs receipts, publishes the list"],
      ["Relayer", "Checks each proof, sends the ballot, pays the gas"],
      ["Indexer", "A cache for lists and ballot tables; nothing depends on it"],
    ];
    svc.forEach(([h, b], i) => {
      const y = 1.15 + i * 1.17;
      card(s, 3.65, y, 2.7, 0.98);
      text(s, h, { x: 3.82, y: y + 0.1, w: 2.4, h: 0.32, fontFace: HEAD, fontSize: 14, bold: true, color: C.navy });
      text(s, b, { x: 3.82, y: y + 0.44, w: 2.4, h: 0.6, fontSize: 11, color: C.muted });
    });
    // Chain and storage
    card(s, 6.9, 1.15, 2.6, 2.45, C.navy);
    text(s, "Ethereum Sepolia", { x: 7.08, y: 1.25, w: 2.3, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.amber });
    text(s, ["Two election factories (clones)", "Wallet and anonymous election logic", "Semaphore verifier", "ERC-2771 forwarder (kept, unused by the relayer)"].map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })), {
      x: 7.08, y: 1.68, w: 2.3, h: 1.85, fontSize: 11, color: C.white, paraSpaceAfter: 4,
    });
    card(s, 6.9, 3.8, 2.6, 0.95);
    text(s, "IPFS", { x: 7.08, y: 3.88, w: 2.3, h: 0.32, fontFace: HEAD, fontSize: 14, bold: true, color: C.navy });
    text(s, "Voter lists and election texts, by content hash", { x: 7.08, y: 4.2, w: 2.3, h: 0.5, fontSize: 11, color: C.muted });
    // Arrows
    arrow(s, 3.1, 1.64, 3.65, 1.64);
    arrow(s, 3.1, 2.81, 3.65, 2.81);
    arrow(s, 6.35, 1.64, 6.9, 1.64);
    arrow(s, 6.35, 2.81, 6.9, 2.81);
    arrow(s, 6.9, 3.3, 6.35, 3.8, { color: C.muted, dash: true });
    arrow(s, 3.1, 4.66, 6.9, 4.66, { color: C.teal, dash: true });
    text(s, "audit: chain and IPFS only", { x: 3.7, y: 4.69, w: 2.8, h: 0.25, fontSize: 10, color: C.teal, italic: true });
    text(s, "The chain decides the result; a service that stops cannot change it.", {
      x: 0.5, y: 5.0, w: 8.4, h: 0.3, fontSize: 13, bold: true, color: C.navy,
    });
    pageNo(s, ++page);
    s.addNotes("Three services around the contracts. The registrar is the one trusted party, for eligibility only. The relayer is a separate process with its own key and no access to the registrar's data. The indexer only makes pages fast. The audit deliberately uses none of them.");
  }

  // 6. Contracts and lifecycle ---------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "Elections move through fixed phases", "Contracts");
    const phases = ["Created", "Registration", "Voting", "Tallying", "Finalized"];
    const pw = 1.6;
    phases.forEach((p, i) => {
      const x = 0.5 + i * (pw + 0.25);
      s.addShape("roundRect", { x, y: 1.25, w: pw, h: 0.6, rectRadius: 0.08, fill: { color: i === 4 ? C.teal : C.navy }, line: { color: i === 4 ? C.teal : C.navy } });
      text(s, p, { x, y: 1.25, w: pw, h: 0.6, fontSize: 14, bold: true, color: C.white, align: "center", valign: "middle" });
      if (i < phases.length - 1) arrow(s, x + pw + 0.02, 1.55, x + pw + 0.23, 1.55, { color: C.muted, width: 1.25 });
    });
    const gates = [
      "anyone, once registration opens",
      "registrar publishes the list; anyone opens voting",
      "anyone, once voting closes",
      "anyone finalizes; the result is permanent",
    ];
    gates.forEach((g, i) => {
      text(s, g, { x: 0.5 + i * (pw + 0.25) + pw * 0.55, y: 1.95, w: 1.75, h: 0.55, fontSize: 10, color: C.muted, italic: true });
    });
    const rows = [
      ["Authority", "Creates the election and may cancel it before voting is under way. Cannot vote unless listed, or change a published list or the count."],
      ["Registrar", "Publishes the voter list once, after registration closes and before voting is due. The list cannot change after that."],
      ["Anyone", "Moves the election on when its time has come, closes voting and finalizes, so no one can hold the result back."],
    ];
    rows.forEach(([who, what], i) => {
      const y = 2.75 + i * 0.78;
      card(s, 0.5, y, 9.0, 0.66);
      text(s, who, { x: 0.7, y, w: 1.5, h: 0.66, fontFace: HEAD, fontSize: 15, bold: true, color: C.navy, valign: "middle" });
      text(s, what, { x: 2.2, y, w: 7.1, h: 0.66, fontSize: 12.5, valign: "middle" });
    });
    pageNo(s, ++page);
    s.addNotes("Elections are cheap clones of one implementation per tier. Phase changes are time-gated; the only role with real power is the registrar's, and it acts once. Ninety-two Foundry tests, five of them fuzz tests; Slither reports nothing apart from the deliberate timestamp checks.");
  }

  // 7. What changed ----------------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "What changed since Evaluation 1, and why", "Changes");
    const changes = [
      [I.relay, "The relayer calls the contract directly", "The proof already binds the ballot. The ERC-2771 forwarder added about a third more gas on Sepolia, so the relayer no longer uses it."],
      [I.ruler, "Constant gas per ballot", "Our own tree-depth check read storage once per level. It now takes one read, and the cost is flat to 65,536 voters."],
      [I.gas, "Sepolia's Glamsterdam upgrade", "New state now costs 1,530 gas a byte there. Deployment and gas limits had to be redone for it."],
      [I.bolt, "A room can vote at once", "The relayer sent one ballot per block. It now sends a burst back to back, as the load test showed it must."],
      [I.qr, "Voting from another device", "A simulated walkthrough found voters lose their key between devices. A QR code now carries it across."],
      [I.google, "Google sign-in", "Registration checks the institute account with Google, with emailed codes kept as a fallback."],
    ];
    changes.forEach(([ic, h, b], i) => {
      const x = 0.5 + (i % 2) * 4.6;
      const y = 1.1 + Math.floor(i / 2) * 1.37;
      card(s, x, y, 4.4, 1.2);
      iconCircle(s, ic, x + 0.18, y + 0.18, 0.5, C.teal);
      text(s, h, { x: x + 0.82, y: y + 0.12, w: 3.45, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: C.navy });
      text(s, b, { x: x + 0.82, y: y + 0.48, w: 3.45, h: 0.7, fontSize: 11, color: C.muted });
    });
    pageNo(s, ++page);
    s.addNotes("Each of these came from a measurement or a test, not a preference. Section 4 of the report lists every divergence from the Evaluation 1 design with its reason.");
  }

  // 8. C1 ------------------------------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "A ballot costs the same however many vote", "Cost (A1, C1)");
    const labels = t3cast.map((r) => rollLabel(r.roll));
    s.addChart(
      pres.charts.LINE,
      [
        { name: "Anonymous ballot", labels, values: t3cast.map((r) => r.gas / 1000) },
        { name: "Wallet ballot", labels, values: t2cast.map((r) => r.gas / 1000) },
        { name: "Publish the list", labels, values: t3publish.map((r) => r.gas / 1000) },
      ],
      {
        x: 0.4, y: 1.05, w: 6.0, h: 4.1,
        chartColors: [C.teal, C.navy, C.amber], lineSize: 2, lineDataSymbolSize: 5,
        showLegend: true, legendPos: "b", legendFontSize: 11, legendFontFace: BODY, legendColor: C.ink,
        catAxisTitle: "Voters on the list", showCatAxisTitle: true, catAxisTitleFontSize: 11, catAxisTitleColor: C.muted,
        valAxisTitle: "Gas (thousands)", showValAxisTitle: true, valAxisTitleFontSize: 11, valAxisTitleColor: C.muted,
        catAxisLabelColor: C.muted, valAxisLabelColor: C.muted, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
        catAxisLabelFontFace: BODY, valAxisLabelFontFace: BODY,
        valAxisMinVal: 0, valAxisMaxVal: 350, valGridLine: { color: C.line, size: 0.5 }, catGridLine: { style: "none" },
      },
    );
    stat(s, n0(Number(snap3.castVote)), "gas, an anonymous ballot (local, mainnet rules)", 6.7, 1.2, 2.8);
    stat(s, `± ${n0((Math.max(...flatFrom4) - Math.min(...flatFrom4)) / 2)}`, "gas of spread, 4 to 65,536 voters: calldata bytes, not list size", 6.7, 2.45, 2.8, C.navy);
    stat(s, n0(Number(snap3.publishVoterList)), "gas to publish a list of any size", 6.7, 3.7, 2.8, C.amber);
    pageNo(s, ++page);
    s.addNotes("The central claim. Each point is a real election on a local node. Only a root, a count and a content hash go on-chain, so publishing is flat; the anonymous ballot is flat because the verifier's work does not grow with the list. The wallet ballot grows a little, one hash per tree level.");
  }

  // 9. Glamsterdam ----------------------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "On Sepolia, new state now costs far more", "Cost (A1)");
    text(s, "Sepolia moved to the Glamsterdam upgrade on 6 October 2026. Its EIP-8037 charges 1,530 gas for every byte of new state, so anything that creates storage or code costs several times what it does under mainnet's rules.", {
      x: 0.5, y: 1.1, w: 9.0, h: 0.75, fontSize: 14,
    });
    const pairs = [
      ["Deploy an election contract", Number(snap2["deploy a full election contract"]), DEPLOY_MERKLE_SEPOLIA],
      ["Create an election", Number(snap3.createElection), sepoliaGas(3, "create_election")],
      ["Publish a voter list", Number(snap3.publishVoterList), sepoliaGas(3, "publish_roll")],
      ["Anonymous ballot, relayed", Number(snap3.castVote), sepoliaGas(3, "cast_vote_relayed")],
    ];
    pairs.forEach(([label, local, sep], i) => {
      const y = 2.05 + i * 0.75;
      card(s, 0.5, y, 9.0, 0.62);
      text(s, label, { x: 0.7, y, w: 3.6, h: 0.62, fontSize: 14, bold: true, color: C.navy, valign: "middle" });
      text(s, `${fig(local, label, n0)} gas`, { x: 4.4, y, w: 2.0, h: 0.62, fontSize: 14, color: C.muted, align: "right", valign: "middle" });
      text(s, `${fig(sep, `Sepolia: ${label}`, n0)} gas`, { x: 6.8, y, w: 2.5, h: 0.62, fontSize: 15, bold: true, color: C.red, align: "right", valign: "middle" });
    });
    text(s, "local, mainnet rules", { x: 4.4, y: 1.8, w: 2.0, h: 0.25, fontSize: 10, color: C.muted, align: "right" });
    text(s, "Sepolia, Glamsterdam", { x: 6.8, y: 1.8, w: 2.5, h: 0.25, fontSize: 10, color: C.red, align: "right" });
    pageNo(s, ++page);
    s.addNotes("Foundry's EVM does not model EIP-8037 yet, so forge's own gas estimates were seven times too low and our first deployment ran out of gas. We deploy with the node's estimates instead, and report both rule sets.");
  }

  // 10. C2 -----------------------------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "The voter's device does the heavy lifting", "Booth (C2)");
    const labels = prove.map((r) => rollLabel(r.roll));
    s.addChart(
      pres.charts.LINE,
      [
        { name: "Prove the ballot", labels, values: prove.map((r) => r.ms / 1000) },
        { name: "Rebuild the voter list", labels, values: rebuild.map((r) => r.ms / 1000) },
      ],
      {
        x: 0.4, y: 1.05, w: 6.0, h: 4.1,
        chartColors: [C.teal, C.amber], lineSize: 2, lineDataSymbolSize: 5,
        showLegend: true, legendPos: "b", legendFontSize: 11, legendFontFace: BODY, legendColor: C.ink,
        catAxisTitle: "Voters on the list", showCatAxisTitle: true, catAxisTitleFontSize: 11, catAxisTitleColor: C.muted,
        valAxisTitle: "Seconds (median of 5)", showValAxisTitle: true, valAxisTitleFontSize: 11, valAxisTitleColor: C.muted,
        catAxisLabelColor: C.muted, valAxisLabelColor: C.muted, catAxisLabelFontSize: 10, valAxisLabelFontSize: 10,
        catAxisLabelFontFace: BODY, valAxisLabelFontFace: BODY,
        valAxisMinVal: 0, valGridLine: { color: C.line, size: 0.5 }, catGridLine: { style: "none" },
      },
    );
    const last = (series) => series.at(-1);
    stat(s, s1(prove[0].ms), `to prove a ballot at ${prove[0].roll} voters`, 6.7, 1.2, 2.8);
    stat(s, s1(last(prove).ms), `at ${n0(last(prove).roll)} voters: proving grows with the tree's depth`, 6.7, 2.45, 2.8);
    stat(s, s1(last(rebuild).ms), `to rebuild a list of ${n0(last(rebuild).roll)}: linear, the price of not trusting the registrar`, 6.7, 3.7, 2.8, C.amber);
    pageNo(s, ++page);
    s.addNotes("The flat gas line must not hide work moved to the voter. Proving grows only with the tree's depth. Rebuilding the published list to check it against the on-chain root grows with the list; past about eight thousand voters it costs more than proving. One ARM64 core, Node.js 24; the phone figures come from the /bench page.");
  }

  // 11. B1 and C3 -------------------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "Latency, and a room voting at once", "Latency (B1, C3)");
    const b1s = stats(b1Now) ?? undefined;
    card(s, 0.5, 1.1, 4.3, 3.95);
    iconCircle(s, I.phone, 0.7, 1.3, 0.5, C.teal);
    text(s, "One voter, Sepolia (B1)", { x: 1.32, y: 1.37, w: 3.3, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: C.navy });
    stat(s, fig(b1s?.median, "B1 median, current relayer", s1), `median, click to counted (${b1s?.n ?? 0} ballots)`, 0.75, 2.0, 1.9);
    stat(s, fig(b1s?.slowest, "B1 slowest, current relayer", s1), `slowest of ${b1s?.n ?? 0}; ${b1s ? b1Now.filter((ms) => ms <= 15_000).length : 0} counted within 15 s`, 2.75, 2.0, 1.9, C.navy);
    const before = stats(b1Before);
    const burst = stats(b1Burst);
    if (!burst) missing.push("B1, ten voters at once");
    text(s, [
      { text: burst ? `Ten voters at once: all in one block, median ${s1(burst.median)} (ten browsers proving on one machine).` : "", options: { breakLine: true } },
      { text: before ? `Earlier relayer, one at a time: median ${s1(before.median)}, slowest ${s1(before.slowest)} of ${before.n}. The slow ballots wait an extra block or two; why is still open.` : "" },
    ], { x: 0.75, y: 3.4, w: 3.9, h: 1.55, fontSize: 11.5, color: C.muted, paraSpaceAfter: 6 });
    card(s, 5.2, 1.1, 4.3, 3.95);
    iconCircle(s, I.users, 5.4, 1.3, 0.5, C.amber);
    text(s, "A burst through the relayer (C3)", { x: 6.02, y: 1.37, w: 3.4, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: C.navy });
    const rows = [[
      { text: "Voters", options: { bold: true, color: C.muted } },
      { text: "Last counted", options: { bold: true, color: C.muted, align: "right" } },
      { text: "Blocks", options: { bold: true, color: C.muted, align: "right" } },
    ]];
    const b16 = c3before.find((r) => r.load === 16);
    if (b16) rows.push([{ text: "16, before", options: { color: C.red } }, { text: s1(b16.last), options: { color: C.red, align: "right" } }, { text: String(b16.blocks), options: { color: C.red, align: "right" } }]);
    for (const r of c3now) rows.push([{ text: n0(r.load) }, { text: s1(r.last), options: { align: "right" } }, { text: String(r.blocks), options: { align: "right" } }]);
    if (!c3now.length) missing.push("C3 results");
    s.addTable(rows, { x: 5.45, y: 1.95, w: 3.8, colW: [1.4, 1.4, 1.0], rowH: 0.34, fontFace: BODY, fontSize: 13, color: C.ink, border: { type: "solid", pt: 0.5, color: C.line }, margin: [0, 0.06, 0, 0.06], valign: "middle" });
    text(s, `Local node, 12-second blocks, Sepolia's gas limit. ${c3now.every((r) => r.failed === 0) ? "No ballot failed." : "Some ballots failed."}`, {
      x: 5.45, y: 4.45, w: 3.85, h: 0.5, fontSize: 11, color: C.muted,
    });
    pageNo(s, ++page);
    s.addNotes("B1 is timed by the Sepolia end-to-end test, from pressing Cast to the booth reporting the ballot counted: proving, the relayer's checks, a block, and the booth confirming on-chain. C3 found that the relayer let through one ballot per block; it now sends a burst back to back, and what limits it is checking each proof before accepting it.");
  }

  // 12. Security --------------------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "Security properties, as tested", "Security (D1–D5)");
    const props = [
      [true, "D1 One ballot per voter", "A reused nullifier is refused, also through the forwarder with a second key; the relayer refuses it before paying."],
      [true, "D2 Only listed voters", "Real proofs against another root, at the wrong depth, for another election, tampered or with a changed choice: all refused."],
      [false, "D3 Ballot secrecy", "Holds against the chain. Against the operators it holds while the relayer is run apart from the registrar."],
      [true, "D4 Anyone can verify", "The audit recounts and re-checks every proof from the chain and IPFS, and passes with our API and relayer blocked."],
      [true, "D5 The authority is contained", "It cannot change a published list or the count, or hold the result back: anyone can close and finalize."],
    ];
    props.forEach(([holds, h, b], i) => {
      const y = 1.1 + i * 0.8;
      card(s, 0.5, y, 9.0, 0.68);
      s.addImage({ data: holds ? I.check : I.half, x: 0.68, y: y + 0.17, w: 0.34, h: 0.34 });
      text(s, h, { x: 1.2, y, w: 2.9, h: 0.68, fontFace: HEAD, fontSize: 14, bold: true, color: C.navy, valign: "middle" });
      text(s, b, { x: 4.1, y, w: 5.25, h: 0.68, fontSize: 11.5, valign: "middle" });
    });
    pageNo(s, ++page);
    s.addNotes("D2's cases are each a contract test with a real proof made by the same library the booth uses. D3 is the conditional one: the relayer sees when a ballot arrives and from which address; the registrar knows who registered. Run apart, neither can link a person to a ballot.");
  }

  // 13. Usability --------------------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "What the walkthrough changed", "Usability (E1–E3)");
    const personas = [
      ["A first-year on a phone", "Votes fine in one browser; would be stuck if the link opened in another app's browser."],
      ["A privacy sceptic", "Finishes, with doubts: the privacy claim was stated, not explained."],
      ["Registers in a library, votes on a phone", "Fails: nothing said, in time, to move the voting key."],
    ];
    personas.forEach(([h, b], i) => {
      const y = 1.1 + i * 1.12;
      card(s, 0.5, y, 4.4, 0.98);
      text(s, h, { x: 0.7, y: y + 0.1, w: 4.0, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: i === 2 ? C.red : C.navy });
      text(s, b, { x: 0.7, y: y + 0.45, w: 4.0, h: 0.5, fontSize: 12, color: C.muted });
    });
    card(s, 5.2, 1.1, 4.3, 3.22, C.tealTint);
    text(s, "Changes", { x: 5.4, y: 1.22, w: 3.9, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.teal });
    text(s, [
      "A QR code and private link carry the key to another device, and ask before using it",
      "One plain explanation of what the registrar can and cannot see",
      "Each voter finds their own ballot, marked “yours”",
      "Audit checks in plain words; no wallet button for anonymous voters",
    ].map((t, i, a) => ({ text: t, options: { bullet: true, breakLine: i < a.length - 1 } })), {
      x: 5.4, y: 1.65, w: 3.95, h: 2.6, fontSize: 12.5, paraSpaceAfter: 6,
    });
    text(s, "Three simulated participants walked through every screen. This is a cognitive walkthrough, not a user study; the test with real students is reported separately.", {
      x: 0.5, y: 4.5, w: 9.0, h: 0.6, fontSize: 11.5, italic: true, color: C.muted,
    });
    pageNo(s, ++page);
    s.addNotes("E1: five actions to register with Google, three to vote. E2: no anonymous voter needs ETH or a wallet. E3: say what the real-participant test found, or that it is still to come.");
  }

  // 14. Demo -------------------------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "Live: an election on Sepolia", "Demo");
    const steps = [
      "The election and its contract",
      "You register with your phone",
      "The list goes on-chain by itself",
      "You vote, with no wallet",
      "A second ballot is refused",
      "Anyone closes and finalizes",
      "The audit, from chain and IPFS",
    ];
    steps.forEach((t, i) => {
      const x = 0.5 + (i % 4) * 2.3;
      const y = 1.2 + Math.floor(i / 4) * 1.95;
      card(s, x, y, 2.1, 1.7);
      s.addShape("ellipse", { x: x + 0.18, y: y + 0.18, w: 0.42, h: 0.42, fill: { color: C.amber }, line: { color: C.amber } });
      text(s, String(i + 1), { x: x + 0.18, y: y + 0.18, w: 0.42, h: 0.42, fontSize: 14, bold: true, color: C.navy, align: "center", valign: "middle" });
      text(s, t, { x: x + 0.18, y: y + 0.78, w: 1.8, h: 0.8, fontSize: 15, bold: true, color: C.navy });
    });
    pageNo(s, ++page);
    s.addNotes("Follow docs/demo.md. A finished election is prepared in advance in case the live one runs late.");
  }

  // 15. Limits -----------------------------------------------------------------
  {
    const s = pres.addSlide();
    title(s, "What DVote does not promise", "Limits");
    const limits = [
      [I.lock, "Coercion and vote selling", "Whoever holds a voter's key can cast that ballot."],
      [I.list, "An honest roll", "The registrar decides who is eligible; publishing fixes the list, it does not prove it right."],
      [I.eye, "The running count", "The tally is public while voting is open."],
      [I.relay, "A neutral relayer", "It sees timing and network addresses, and could drop ballots; any wallet can submit instead."],
    ];
    limits.forEach(([ic, h, b], i) => {
      const x = 0.5 + (i % 2) * 4.6;
      const y = 1.1 + Math.floor(i / 2) * 1.45;
      card(s, x, y, 4.4, 1.28);
      iconCircle(s, ic, x + 0.18, y + 0.2, 0.5, C.navy);
      text(s, h, { x: x + 0.82, y: y + 0.15, w: 3.45, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: C.navy });
      text(s, b, { x: x + 0.82, y: y + 0.52, w: 3.45, h: 0.7, fontSize: 12, color: C.muted });
    });
    card(s, 0.5, 4.1, 9.0, 0.95, C.amberTint);
    text(s, [
      { text: "Next: ", options: { bold: true, color: C.navy } },
      { text: "MACI-style re-voting against coercion, encrypted ballots until voting closes, institute single sign-on, several relayers, and pages a voter can verify." },
    ], { x: 0.7, y: 4.2, w: 8.6, h: 0.75, fontSize: 13, valign: "middle" });
    pageNo(s, ++page);
    s.addNotes("These are stated in Section 3 of the report as non-guarantees, and Section 7 says what would address each.");
  }

  // 16. Close ------------------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.navy };
    text(s, "Thank you", { x: 0.5, y: 1.6, w: 9.0, h: 0.9, fontFace: HEAD, fontSize: 44, bold: true, color: C.white, align: "center" });
    text(s, "Questions", { x: 0.5, y: 2.55, w: 9.0, h: 0.6, fontFace: HEAD, fontSize: 24, color: C.amber, align: "center" });
    text(s, "The contracts are verified on Sourcify; the report gives every address and every measurement's source.", {
      x: 1.5, y: 3.6, w: 7.0, h: 0.6, fontSize: 13, color: "C9D3DF", align: "center",
    });
  }

  if (missing.length && !DRAFT) {
    throw new Error(`Not measured yet: ${[...new Set(missing)].join("; ")}. DECK_DRAFT=1 builds anyway.`);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await pres.writeFile({ fileName: OUT });
  // pptxgenjs writes folder entries into the ZIP, which some cloud viewers refuse.
  try {
    require("child_process").execFileSync("zip", ["-dq", OUT, "*/"]);
  } catch {
    // No folder entries, or no zip tool: the file is still valid.
  }
  console.log(`Wrote ${OUT}${missing.length ? ` (draft; pending: ${[...new Set(missing)].join("; ")})` : ""}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
