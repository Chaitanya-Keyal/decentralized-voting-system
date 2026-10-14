// Builds reports/eval1-slides.pptx, the Evaluation 1 presentation.
// Run from reports/: node slides/build-deck.js
// Needs pptxgenjs, react, react-dom, react-icons and sharp on NODE_PATH.

const path = require("path");
const pptxgen = require("pptxgenjs");
const JSZip = require("jszip");
const fs = require("fs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa6");

const OUT = path.join(__dirname, "..", "eval1-slides.pptx");
const LOGO = path.join(__dirname, "..", "figures", "bits-logo.png");

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
};
const HEAD = "Cambria";
const BODY = "Calibri";

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Comp, { color: "#" + color, size: String(size) })
  );
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

const shadow = () => ({ type: "outer", color: "000000", blur: 6, offset: 1.5, angle: 90, opacity: 0.12 });

function title(slide, text, part) {
  slide.addText(text, {
    x: 0.5, y: 0.3, w: 8.2, h: 0.6, fontFace: HEAD, fontSize: 28, bold: true,
    color: C.navy, margin: 0, isTextBox: true,
  });
  if (part) {
    slide.addText(part, {
      x: 7.6, y: 0.38, w: 1.9, h: 0.3, fontFace: BODY, fontSize: 10, color: C.muted,
      align: "right", margin: 0, isTextBox: true,
    });
  }
}

function pageNo(slide, n) {
  slide.addText(String(n), {
    x: 9.1, y: 5.25, w: 0.4, h: 0.25, fontFace: BODY, fontSize: 9, color: C.muted,
    align: "right", margin: 0, isTextBox: true,
  });
}

function iconCircle(slide, data, x, y, d, fill) {
  slide.addShape("ellipse", { x, y, w: d, h: d, fill: { color: fill }, line: { color: fill } });
  const pad = d * 0.25;
  slide.addImage({ data, x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad });
}

function card(slide, x, y, w, h, fill = C.card) {
  slide.addShape("roundRect", {
    x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: fill }, shadow: shadow(),
  });
}

function text(slide, t, o) {
  slide.addText(t, Object.assign({ fontFace: BODY, fontSize: 13, color: C.ink, margin: 0, isTextBox: true, valign: "top" }, o));
}


const REFS = [
  ["helios", "B. Adida. Helios: Web-based Open-Audit Voting. USENIX Security 2008."],
  ["estonia", "D. Springall et al. Security Analysis of the Estonian Internet Voting System. ACM CCS 2014."],
  ["voatz", "M. Specter, J. Koppel, D. Weitzner. The Ballot is Busted Before the Blockchain (Voatz). USENIX Security 2020."],
  ["openvote", "P. McCorry, S. Shahandashti, F. Hao. A Smart Contract for Boardroom Voting with Maximum Voter Privacy. FC 2017."],
  ["maci", "MACI: Minimal Anti-Collusion Infrastructure documentation. maci.pse.dev"],
  ["merkle", "R. Merkle. A Digital Signature Based on a Conventional Encryption Function. CRYPTO 1987."],
  ["groth16", "J. Groth. On the Size of Pairing-Based Non-interactive Arguments. EUROCRYPT 2016."],
  ["semaphore", "Semaphore Protocol documentation, version 4. docs.semaphore.pse.dev"],
  ["erc", "ERC-1167 Minimal Proxy Contract; ERC-2771 Secure Protocol for Native Meta Transactions. eips.ethereum.org"],
  ["oz", "OpenZeppelin Contracts 5.x documentation. docs.openzeppelin.com"],
  ["sol", "Solidity 0.8.28 documentation; Foundry Book. soliditylang.org, getfoundry.sh"],
  ["sepolia", "ethereum.org: Networks (Sepolia) and Gas and Fees. ethereum.org/developers/docs"],
  ["ipfs", "IPFS documentation; Pinata documentation. docs.ipfs.tech, docs.pinata.cloud"],
  ["web", "Next.js, wagmi and viem documentation. nextjs.org, wagmi.sh, viem.sh"],
  ["backend", "Fastify, PostgreSQL and BullMQ documentation. fastify.dev, postgresql.org, docs.bullmq.io"],
];
const cite = (...keys) => "[" + keys.map((k) => REFS.findIndex((r) => r[0] === k) + 1).join(", ") + "]";

function arrowLine(slide, x1, y1, x2, y2, o = {}) {
  slide.addShape("line", {
    x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
    flipH: x2 < x1, flipV: y2 < y1,
    line: { color: o.color || C.navy, width: o.width || 1.5, dashType: o.dash ? "dash" : "solid", endArrowType: o.noHead ? undefined : "triangle" },
  });
}

function badge(slide, n, x, y) {
  slide.addShape("ellipse", { x: x - 0.12, y: y - 0.12, w: 0.24, h: 0.24, fill: { color: C.amber }, line: { color: C.amber } });
  slide.addText(String(n), { x: x - 0.12, y: y - 0.12, w: 0.24, h: 0.24, fontFace: BODY, fontSize: 9, bold: true, color: C.navy, align: "center", valign: "middle", margin: 0, isTextBox: true });
}

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";

  const I = {
    list: await icon(fa.FaListCheck, C.white),
    box: await icon(fa.FaBoxArchive, C.white),
    calc: await icon(fa.FaCalculator, C.white),
    log: await icon(fa.FaFileLines, C.white),
    id: await icon(fa.FaIdCard, C.white),
    scale: await icon(fa.FaScaleBalanced, C.white),
    eye: await icon(fa.FaEyeSlash, C.white),
    hand: await icon(fa.FaHandHoldingDollar, C.white),
    key: await icon(fa.FaKey, C.white),
    lock: await icon(fa.FaLock, C.white),
    shield: await icon(fa.FaUserShield, C.white),
    ban: await icon(fa.FaBan, C.white),
    search: await icon(fa.FaMagnifyingGlass, C.white),
    phone: await icon(fa.FaMobileScreen, C.white),
    relay: await icon(fa.FaPaperPlane, C.white),
    chain: await icon(fa.FaLink, C.white),
    bell: await icon(fa.FaBell, C.white),
    user: await icon(fa.FaUser, C.white),
    building: await icon(fa.FaBuildingColumns, C.white),
    stamp: await icon(fa.FaStamp, C.white),
    flag: await icon(fa.FaFlag, C.white),
    check: await icon(fa.FaCircleCheck, C.teal),
    cross: await icon(fa.FaCircleXmark, C.red),
    checkW: await icon(fa.FaCheck, C.white),
    warn: await icon(fa.FaTriangleExclamation, C.white),
  };

  // 1. Title ---------------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.navy };
    s.addShape("roundRect", { x: 0.5, y: 0.45, w: 4.3, h: 1.05, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.white } });
    s.addImage({ path: LOGO, altText: "BITS Pilani, Hyderabad Campus logo", x: 0.65, y: 0.56, w: 4.0, h: 4.0 * 390 / 1890 });
    text(s, "DVote", { x: 0.5, y: 1.85, w: 5.2, h: 0.95, fontFace: HEAD, fontSize: 54, bold: true, color: C.white });
    text(s, "A Decentralized Voting System", { x: 0.5, y: 2.8, w: 5.2, h: 0.5, fontFace: HEAD, fontSize: 22, color: C.amber });
    text(s, "Blockchain Technology (BITS F452)  |  Group 6\nEvaluation 1", {
      x: 0.5, y: 3.55, w: 5.2, h: 0.7, fontSize: 14, color: "C9D3DF", paraSpaceAfter: 4,
    });
    const members = [
      ["Varad Kailas Thombre", "2024A7PS0148H"],
      ["Naman Singhal", "2024A7PS0121H"],
      ["Shivam Goyal", "2024ADPS0190H"],
      ["Rishit Agarwal", "2024A7PS0101H"],
      ["Vihaan Kashyap", "2024A7PS0113H"],
      ["Palak Agarwal", "2024A7PS0041H"],
      ["Chaitanya Keyal", "2023B4A70727H"],
      ["Wamika Sehgal", "2024B4A70830H"],
    ];
    s.addShape("roundRect", { x: 5.45, y: 1.85, w: 4.05, h: 3.05, rectRadius: 0.08, fill: { color: C.navySoft }, line: { color: C.navySoft } });
    text(s, "Team", { x: 5.7, y: 1.98, w: 3.5, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.amber });
    s.addTable(members.map(([n, id]) => [
      { text: n, options: { color: C.white, fontSize: 12, fontFace: BODY } },
      { text: id, options: { color: "C9D3DF", fontSize: 12, fontFace: BODY, align: "right" } },
    ]), { x: 5.62, y: 2.38, w: 3.72, colW: [2.1, 1.62], rowH: 0.29, border: { type: "none" }, margin: [0, 0.08, 0, 0.08], valign: "middle" });
  }

  // 2. The problem ---------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "The problem: one operator, four jobs", "Problem");
    text(s, "Institutional elections usually run on one operator's database. Voters have to trust that operator with the roll, the ballot box, the count and the log, and nobody outside can check any of them.", {
      x: 0.5, y: 1.1, w: 3.6, h: 1.6, fontSize: 15, color: C.ink,
    });
    s.addShape("roundRect", { x: 0.5, y: 2.9, w: 3.6, h: 1.55, rectRadius: 0.08, fill: { color: C.amberTint }, line: { color: C.amberTint } });
    text(s, [
      { text: "Existing systems", options: { bold: true, color: C.navy, breakLine: true } },
      { text: `Helios, Estonia's i-voting and Voatz still ask voters to trust servers or apps ${cite("helios", "estonia", "voatz")}. On Ethereum, Open Vote Network suits small boardroom votes ${cite("openvote")} and MACI needs a trusted coordinator ${cite("maci")}.` },
    ], { x: 0.7, y: 3.02, w: 3.25, h: 1.35, fontSize: 11.5, paraSpaceAfter: 3 });

    const items = [
      [I.list, "Voter roll", "Fake or deleted voters are invisible from outside."],
      [I.box, "Ballot box", "Unused votes can be cast at close of polling."],
      [I.calc, "Count", "The result is whatever the database says."],
      [I.log, "Log", "The audit trail is kept by the party being audited."],
    ];
    items.forEach(([ic, h, b], i) => {
      const x = 4.5 + (i % 2) * 2.55, y = 1.1 + Math.floor(i / 2) * 1.95;
      card(s, x, y, 2.35, 1.75);
      iconCircle(s, ic, x + 0.2, y + 0.2, 0.55, C.teal);
      text(s, h, { x: x + 0.2, y: y + 0.85, w: 2.0, h: 0.3, fontFace: HEAD, fontSize: 15, bold: true, color: C.navy });
      text(s, b, { x: x + 0.2, y: y + 1.15, w: 2.0, h: 0.55, fontSize: 11.5, color: C.muted });
    });
    pageNo(s, 2);
  }

  // 3. Why a blockchain ----------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "Why a blockchain, and what it does not fix", "Problem");
    card(s, 0.5, 1.1, 4.2, 3.85, C.tealTint);
    text(s, "Worth using only when both hold", { x: 0.75, y: 1.3, w: 3.8, h: 0.35, fontFace: HEAD, fontSize: 16, bold: true, color: C.teal });
    const conds = [
      ["1", "Parties who distrust each other need a shared record that nobody can edit and none of them controls."],
      ["2", "Anyone who trusts none of the operators must be able to check it: public data, public rules."],
    ];
    conds.forEach(([n, t], i) => {
      const y = 1.85 + i * 1.05;
      s.addShape("ellipse", { x: 0.75, y, w: 0.45, h: 0.45, fill: { color: C.teal }, line: { color: C.teal } });
      text(s, n, { x: 0.75, y, w: 0.45, h: 0.45, fontSize: 16, bold: true, color: C.white, align: "center", valign: "middle" });
      text(s, t, { x: 1.35, y: y - 0.02, w: 3.15, h: 0.9, fontSize: 12.5 });
    });
    text(s, "An election meets both: the candidates are opponents, and a correct result that nobody can check does not settle a dispute.", {
      x: 0.75, y: 4.0, w: 3.8, h: 0.8, fontSize: 12, italic: true, color: C.navy,
    });

    text(s, "What it does not fix", { x: 5.1, y: 1.1, w: 4.4, h: 0.35, fontFace: HEAD, fontSize: 16, bold: true, color: C.navy });
    const gaps = [
      [I.id, "Eligibility", "The chain cannot tell a real student from a fake account. The registrar checks this off-chain."],
      [I.scale, "Ballot design", "An unfair rule stays unfair forever, so counting rules sit in a separate library."],
      [I.eye, "Privacy", "Everything is public forever, so secrecy must come from cryptography."],
      [I.hand, "Coercion", "Worse than paper: a voter can prove their vote to a buyer."],
    ];
    gaps.forEach(([ic, h, b], i) => {
      const y = 1.6 + i * 0.85;
      iconCircle(s, ic, 5.1, y, 0.5, C.navy);
      text(s, h, { x: 5.75, y: y - 0.02, w: 3.75, h: 0.28, fontSize: 13, bold: true, color: C.navy });
      text(s, b, { x: 5.75, y: y + 0.26, w: 3.75, h: 0.5, fontSize: 11, color: C.muted });
    });
    pageNo(s, 3);
  }

  // 4. How DVote works -----------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "How DVote works", "Problem");
    const steps = [
      [I.key, "Register", "A secret is created on the voter's device. The registrar only gets a commitment (a hash of it)."],
      [I.lock, "Freeze", "At close of registration: Merkle root, voter count and the list's IPFS address go on-chain."],
      [I.shield, "Prove", "The browser proves in zero knowledge \"I am on the roll\", without saying who."],
      [I.ban, "Vote once", "A nullifier, hash(secret, electionId), is the same every time, so a second ballot is rejected."],
      [I.search, "Recount", "Anyone can re-check every proof and recount the tally from chain data."],
    ];
    const w = 1.66, gap = 0.2;
    steps.forEach(([ic, h, b], i) => {
      const x = 0.5 + i * (w + gap);
      card(s, x, 1.25, w, 3.05);
      iconCircle(s, ic, x + (w - 0.7) / 2, 1.45, 0.7, C.teal);
      text(s, `${i + 1}. ${h}`, { x: x + 0.12, y: 2.3, w: w - 0.24, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: C.navy, align: "center" });
      text(s, b, { x: x + 0.14, y: 2.7, w: w - 0.28, h: 1.5, fontSize: 11, color: C.ink });
      if (i < steps.length - 1) {
        s.addShape("rightArrow", { x: x + w + 0.02, y: 2.2, w: 0.16, h: 0.25, fill: { color: C.amber }, line: { color: C.amber } });
      }
    });
    s.addShape("roundRect", { x: 0.5, y: 4.55, w: 9.0, h: 0.55, rectRadius: 0.08, fill: { color: C.navy }, line: { color: C.navy } });
    text(s, "Result: the operator is out of the ballot box and the count. The registrar is not contacted at vote time.", {
      x: 0.7, y: 4.55, w: 8.6, h: 0.55, fontSize: 13, bold: true, color: C.white, valign: "middle",
    });
    pageNo(s, 4);
  }

  // 5. Actors --------------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "Actors: what each can and cannot do", "Requirements");
    const actors = [
      [I.building, "Election Authority", "Create the election, set candidates and dates, cancel before voting", "Vote, change the roll after registration, stop the count"],
      [I.stamp, "Registrar", "Check eligibility off-chain; publish root, voter count, list", "See how anyone voted, edit the frozen roll"],
      [I.user, "Voter", "Register, cast one ballot, check it was counted", "Vote twice, vote without being on the roll"],
      [I.flag, "Candidate", "Be listed, publish a manifesto", "Anything privileged"],
      [I.search, "Auditor / Observer", "Recount the tally, check every proof, rebuild the root", "Change anything"],
      [I.relay, "Relayer", "Pay gas for voters; sees choices; can refuse to forward", "Forge, change or replay a ballot"],
    ];
    const w = 2.9, h = 1.95;
    actors.forEach(([ic, name, can, cannot], i) => {
      const x = 0.5 + (i % 3) * (w + 0.15), y = 1.05 + Math.floor(i / 3) * (h + 0.15);
      card(s, x, y, w, h);
      iconCircle(s, ic, x + 0.15, y + 0.15, 0.45, C.teal);
      text(s, name, { x: x + 0.7, y: y + 0.15, w: w - 0.8, h: 0.45, fontFace: HEAD, fontSize: 14, bold: true, color: C.navy, valign: "middle" });
      s.addImage({ data: I.check, x: x + 0.18, y: y + 0.75, w: 0.2, h: 0.2 });
      text(s, can, { x: x + 0.48, y: y + 0.72, w: w - 0.6, h: 0.6, fontSize: 11 });
      s.addImage({ data: I.cross, x: x + 0.18, y: y + 1.38, w: 0.2, h: 0.2 });
      text(s, cannot, { x: x + 0.48, y: y + 1.35, w: w - 0.6, h: 0.55, fontSize: 11, color: C.muted });
    });
    pageNo(s, 5);
  }

  // 6. Requirements --------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "Requirements", "Requirements");
    text(s, "Functional (FR1 to FR8)", { x: 0.5, y: 1.0, w: 5.0, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.teal });
    const frs = [
      ["FR1", "Authority creates the election; candidates locked once voting opens"],
      ["FR2", "Registrar checks eligibility off-chain; voter gets a signed receipt"],
      ["FR3", "Root, voter count and list address published together, then frozen"],
      ["FR4", "Phases move forward only, on schedule; anyone can close and finalize"],
      ["FR5", "Ballot needs a valid ZK proof; each nullifier once; capped at voter count"],
      ["FR6", "Booth builds its proof from the public list, never asks the registrar"],
      ["FR7", "Relayer checks, then pays gas; signed receipt; voter can bypass it"],
      ["FR8", "Tally changes only on an accepted ballot; everything readable on-chain"],
    ];
    frs.forEach(([id, t], i) => {
      const y = 1.45 + i * 0.46;
      s.addShape("roundRect", { x: 0.5, y, w: 0.6, h: 0.34, rectRadius: 0.05, fill: { color: C.navy }, line: { color: C.navy } });
      text(s, id, { x: 0.5, y, w: 0.6, h: 0.34, fontSize: 11, bold: true, color: C.white, align: "center", valign: "middle" });
      text(s, t, { x: 1.22, y, w: 4.3, h: 0.34, fontSize: 11.5, valign: "middle" });
    });

    card(s, 5.85, 1.0, 3.65, 4.15, C.tealTint);
    text(s, "Non-functional (NFR1 to NFR10)", { x: 6.05, y: 1.15, w: 3.3, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.teal });
    const nfr = [
      ["Ballot secrecy", "no link from ballot to voter (D3)"],
      ["Eligibility", "only voters on the roll (D2)"],
      ["One ballot per voter", "(D1)"],
      ["Verifiability", "recount with our backend off (D4)"],
      ["Count integrity", "nobody can change the tally (D5)"],
      ["Cost", "gas per operation reported (A1)"],
      ["Latency", "set by the chain, not our code (B1, B2)"],
      ["Scalability", "gas per operation flat in roll size (C1 to C3)"],
      ["No crypto needed", "voter holds zero ETH (E2)"],
      ["Usability", "vote without help (E1, E3)"],
    ];
    text(s, nfr.map(([a, b], i) => [
      { text: a, options: { bold: true, color: C.navy } },
      { text: b.startsWith("(") ? ` ${b}` : `: ${b}`, options: { color: C.ink, breakLine: i < nfr.length - 1 } },
    ]).flat(), { x: 6.05, y: 1.6, w: 3.3, h: 3.45, fontSize: 11.5, paraSpaceAfter: 5 });
    pageNo(s, 6);
  }

  // 7. System model -------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "System model", "Design");
    const lanes = [
      [0.5, "Users' browsers", C.tealTint],
      [3.85, "Our services", C.card],
      [7.1, "Ethereum Sepolia", C.amberTint],
    ];
    lanes.forEach(([x, l, f]) => {
      s.addShape("roundRect", { x, y: 0.95, w: 2.4, h: 4.15, rectRadius: 0.08, fill: { color: f }, line: { color: f } });
      text(s, l, { x, y: 1.0, w: 2.4, h: 0.25, fontSize: 11, bold: true, color: C.muted, align: "center" });
    });
    const box = (x, y, h, t1, t2, mono, dashed) => {
      s.addShape("roundRect", { x: x + 0.15, y, w: 2.1, h, rectRadius: 0.06, fill: { color: C.white }, line: { color: dashed ? C.muted : C.navy, width: 1, dashType: dashed ? "dash" : "solid" } });
      text(s, [
        { text: t1, options: { bold: true, color: C.navy, fontFace: mono ? "Courier New" : BODY, fontSize: mono ? 10 : 11, breakLine: !!t2 } },
        ...(t2 ? [{ text: t2, options: { color: C.muted, fontSize: 9 } }] : []),
      ], { x: x + 0.15, y, w: 2.1, h, align: "center", valign: "middle" });
    };
    // browsers
    box(0.5, 1.3, 0.55, "Election Authority", "admin console");
    box(0.5, 2.7, 0.55, "Voter", "ballot booth");
    box(0.5, 4.15, 0.55, "Auditor / observer", "audit dashboard");
    // services
    box(3.85, 1.95, 0.5, "Registrar", "checks eligibility", false, true);
    box(3.85, 2.7, 0.5, "IPFS", "published voter list", false, true);
    box(3.85, 3.45, 0.5, "Relayer", "pays gas for voters", false, true);
    box(3.85, 4.2, 0.5, "Indexer", "read cache only", false, true);
    // chain
    box(7.1, 1.3, 0.5, "ElectionFactory", "", true);
    box(7.1, 1.95, 0.5, "VoterRegistry", "root, voter count", true);
    box(7.1, 2.75, 0.45, "VoteForwarder", "", true);
    box(7.1, 3.5, 0.6, "Election", "SemaphoreVerifier, TallyLib", true);
    const lab = (t, x, y, w = 1.0) => text(s, t, { x, y, w, h: 0.25, fontSize: 8.5, italic: true, color: C.muted, align: "center", valign: "middle" });
    // 1 create
    arrowLine(s, 2.75, 1.57, 7.25, 1.55); badge(s, 1, 3.35, 1.57); lab("create, configure, open phases", 3.55, 1.27, 3.4);
    // 2 register
    arrowLine(s, 2.75, 2.85, 4.0, 2.2); badge(s, 2, 3.37, 2.53); lab("commitment", 2.9, 2.2, 0.9);
    // 3 publish
    arrowLine(s, 6.1, 2.2, 7.25, 2.2); badge(s, 3, 6.67, 2.2);
    arrowLine(s, 5.05, 2.45, 5.05, 2.7); badge(s, 3, 5.3, 2.58);
    // 4 download
    arrowLine(s, 4.0, 2.97, 2.75, 2.97); badge(s, 4, 3.37, 2.97);
    // 5 vote
    arrowLine(s, 2.75, 3.1, 4.0, 3.7); badge(s, 5, 3.37, 3.4); lab("ballot + proof", 2.85, 3.62, 1.0);
    arrowLine(s, 6.1, 3.7, 7.25, 3.0); badge(s, 5, 6.67, 3.35);
    arrowLine(s, 8.3, 3.2, 8.3, 3.5);
    // events to indexer
    arrowLine(s, 7.25, 3.95, 6.1, 4.45); lab("events", 6.25, 4.35, 0.8);
    // 6 audit
    arrowLine(s, 1.6, 4.7, 1.6, 4.95, { dash: true, noHead: true });
    arrowLine(s, 1.6, 4.95, 9.05, 4.95, { dash: true, noHead: true });
    arrowLine(s, 9.05, 4.95, 9.05, 4.1, { dash: true });
    badge(s, 6, 5.05, 4.95); lab("reads and recounts from the chain, never our backend", 5.3, 4.72, 3.6);
    pageNo(s, 7);
  }

  // 8. Contracts and lifecycle ---------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "Smart contracts and election lifecycle", "Design");
    const phases = ["Created", "Registration", "Voting", "Tallying", "Finalized"];
    const pw = 1.5, pg = 0.37;
    phases.forEach((p, i) => {
      const x = 0.5 + i * (pw + pg);
      const fill = i === 4 ? C.teal : C.navy;
      s.addShape("roundRect", { x, y: 1.1, w: pw, h: 0.5, rectRadius: 0.25, fill: { color: fill }, line: { color: fill } });
      text(s, p, { x, y: 1.1, w: pw, h: 0.5, fontSize: 12.5, bold: true, color: C.white, align: "center", valign: "middle" });
      if (i < phases.length - 1) {
        s.addShape("line", { x: x + pw + 0.04, y: 1.35, w: pg - 0.08, h: 0, line: { color: C.navy, width: 1.5, endArrowType: "triangle" } });
      }
    });
    s.addShape("roundRect", { x: 1.43, y: 2.05, w: 1.5, h: 0.45, rectRadius: 0.22, fill: { color: C.white }, line: { color: C.red, width: 1.25 } });
    text(s, "Cancelled", { x: 1.43, y: 2.05, w: 1.5, h: 0.45, fontSize: 12, bold: true, color: C.red, align: "center", valign: "middle" });
    s.addShape("line", { x: 1.25, y: 1.6, w: 0.35, h: 0.45, line: { color: C.red, width: 1, dashType: "dash", endArrowType: "triangle" } });
    s.addShape("line", { x: 2.75, y: 1.6, w: 0.1, h: 0.45, flipH: true, line: { color: C.red, width: 1, dashType: "dash", endArrowType: "triangle" } });
    text(s, "Each step needs its scheduled time to pass and an explicit transaction. Forward only. Only the authority can configure or cancel (before voting); anyone can open, close and finalize.", {
      x: 3.3, y: 1.95, w: 6.2, h: 0.65, fontSize: 11.5, italic: true, color: C.navy,
    });

    const cs = [
      ["ElectionFactory", "Only way to create an election: cheap EIP-1167 clones, listed for auditors"],
      ["Election", "Phase, candidates, used nullifiers, tally; calls the Semaphore verifier"],
      ["VoterRegistry", "Root, voter count and list's IPFS address; frozen at close of registration"],
      ["TallyLib", "Counting rules: plurality first, approval voting if time allows"],
      ["VoteForwarder", "OpenZeppelin ERC-2771 forwarder: relayed and direct ballots share one path"],
    ];
    const cw = 1.68, cg = 0.15;
    cs.forEach(([n, d], i) => {
      const x = 0.5 + i * (cw + cg);
      card(s, x, 2.95, cw, 2.1);
      text(s, n, { x: x + 0.1, y: 3.1, w: cw - 0.2, h: 0.35, fontFace: "Courier New", fontSize: 11, bold: true, color: C.teal, align: "center" });
      text(s, d, { x: x + 0.15, y: 3.55, w: cw - 0.3, h: 1.4, fontSize: 11 });
    });
    pageNo(s, 8);
  }

  // 9. One ballot end to end -----------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "One ballot, end to end", "Design");
    const steps = [
      [I.phone, "Booth", "Loads the secret from the browser, downloads the voter list from IPFS, rebuilds the tree locally."],
      [I.shield, "Proof", "A background thread builds the proof, the nullifier and the encoded choice. Slowest step; B2 measures it on phones."],
      [I.relay, "Relayer", "Gets the ballot signed with a throwaway key, checks the proof and nullifier, then pays the gas."],
      [I.chain, "castVote", "Voting phase only. Checks the proof against the frozen root, rejects a used nullifier or a ballot over the cap, then counts it."],
    ];
    steps.forEach(([ic, h, b], i) => {
      const y = 1.05 + i * 0.9;
      s.addShape("ellipse", { x: 0.5, y, w: 0.6, h: 0.6, fill: { color: C.navy }, line: { color: C.navy } });
      text(s, String(i + 1), { x: 0.5, y, w: 0.6, h: 0.6, fontSize: 18, bold: true, color: C.white, align: "center", valign: "middle" });
      if (i < steps.length - 1) s.addShape("line", { x: 0.8, y: y + 0.6, w: 0, h: 0.3, line: { color: C.line, width: 2 } });
      iconCircle(s, ic, 1.3, y + 0.05, 0.5, C.teal);
      text(s, h, { x: 1.95, y: y + 0.02, w: 1.4, h: 0.55, fontFace: HEAD, fontSize: 15, bold: true, color: C.navy, valign: "middle" });
      text(s, b, { x: 3.35, y: y - 0.02, w: 3.3, h: 0.7, fontSize: 11.5, valign: "middle" });
    });
    card(s, 7.0, 1.05, 2.5, 3.9, C.navy);
    text(s, [
      { text: "All or nothing", options: { bold: true, color: C.amber, fontSize: 15, fontFace: HEAD, breakLine: true } },
      { text: "If any check fails, the whole transaction reverts: a ballot is either counted or has no effect.", options: { color: C.white, fontSize: 12, breakLine: true } },
      { text: " ", options: { fontSize: 6, breakLine: true } },
      { text: "Privacy", options: { bold: true, color: C.amber, fontSize: 15, fontFace: HEAD, breakLine: true } },
      { text: "The secret never leaves the device, and the registrar is not contacted at vote time.", options: { color: C.white, fontSize: 12, breakLine: true } },
      { text: " ", options: { fontSize: 6, breakLine: true } },
      { text: "No wallet", options: { bold: true, color: C.amber, fontSize: 15, fontFace: HEAD, breakLine: true } },
      { text: "Eligibility comes from the proof, so the signing key is throwaway and the voter holds zero ETH.", options: { color: C.white, fontSize: 12 } },
    ], { x: 7.2, y: 1.25, w: 2.15, h: 3.55, paraSpaceAfter: 4 });
    pageNo(s, 9);
  }

  // 10. Anonymity and double voting ----------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "Anonymity and one vote per voter", "Design");
    // Merkle tree diagram
    card(s, 0.5, 1.05, 4.45, 4.05, C.card);
    text(s, "The roll on-chain is one Merkle root", { x: 0.7, y: 1.18, w: 4.1, h: 0.3, fontFace: HEAD, fontSize: 13.5, bold: true, color: C.navy });
    const node = (x, y, w, label, fill, fg, bold) => {
      s.addShape("roundRect", { x, y, w, h: 0.4, rectRadius: 0.06, fill: { color: fill }, line: { color: fill === C.white ? C.line : fill, width: 0.75 } });
      text(s, label, { x, y, w, h: 0.4, fontSize: 11, bold: !!bold, color: fg, align: "center", valign: "middle" });
    };
    const edge = (x1, y1, x2, y2, hot) => {
      const flipH = x2 < x1;
      s.addShape("line", { x: Math.min(x1, x2), y: y1, w: Math.abs(x2 - x1), h: y2 - y1, flipH, line: { color: hot ? C.amber : C.line, width: hot ? 2.25 : 1.25 } });
    };
    // levels
    const rootX = 2.12, rootY = 1.65;
    const midY = 2.5, leafY = 3.35;
    const mids = [1.2, 3.05], leaves = [0.7, 1.55, 2.75, 3.6];
    edge(2.72, rootY + 0.4, 1.8, midY, true);
    edge(2.72, rootY + 0.4, 3.65, midY, false);
    edge(1.8, midY + 0.4, 1.01, leafY, false);
    edge(1.8, midY + 0.4, 2.0, leafY, true);
    edge(3.65, midY + 0.4, 3.06, leafY, false);
    edge(3.65, midY + 0.4, 3.91, leafY, false);
    node(rootX, rootY, 1.2, "Root", C.navy, C.white, true);
    node(mids[0], midY, 1.2, "hash", C.white, C.ink);
    node(mids[1], midY, 1.2, "hash", C.white, C.ink);
    const lab = ["c1", "c2 (you)", "c3", "c4"];
    leaves.forEach((x, i) => node(x, leafY, 0.62 + (i === 1 ? 0.3 : 0), lab[i], i === 1 ? C.teal : C.white, i === 1 ? C.white : C.ink, i === 1));
    text(s, `Each leaf is a voter's commitment (a hash of their secret). Only the 32-byte root goes on-chain, so registration costs the same at any roll size. The browser proves in zero knowledge that it knows the secret behind one leaf on the highlighted path, without revealing which leaf. ${cite("merkle", "groth16", "semaphore")}`, {
      x: 0.7, y: 3.95, w: 4.1, h: 1.1, fontSize: 10.5, color: C.ink,
    });

    // Nullifier properties
    text(s, "nullifier = hash(secret, electionId)", { x: 5.25, y: 1.1, w: 4.25, h: 0.35, fontFace: "Courier New", fontSize: 12.5, bold: true, color: C.teal });
    const props = [
      ["Same every time", "A second ballot from the same voter carries the same nullifier, so the contract rejects it."],
      ["One-way", "It reveals nothing about the secret or who the voter is."],
      ["Per election", "A voter's ballots in two elections cannot be linked."],
    ];
    props.forEach(([h, b], i) => {
      const y = 1.55 + i * 0.72;
      s.addImage({ data: I.check, x: 5.25, y: y + 0.03, w: 0.24, h: 0.24 });
      text(s, h, { x: 5.6, y, w: 3.9, h: 0.28, fontSize: 12.5, bold: true, color: C.navy });
      text(s, b, { x: 5.6, y: y + 0.28, w: 3.9, h: 0.4, fontSize: 11, color: C.muted });
    });
    card(s, 5.25, 3.8, 4.25, 1.3, C.amberTint);
    text(s, [
      { text: "Why not a simple hasVoted[address]?", options: { bold: true, color: C.navy, breakLine: true } },
      { text: "Every ballot would show the voter's address next to their choice, and the registrar knows who owns which address: a public record of how everyone voted.", options: { color: C.ink } },
    ], { x: 5.45, y: 3.92, w: 3.9, h: 1.1, fontSize: 11 });
    pageNo(s, 10);
  }

  // 11. Tech stack ---------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "Technology choices", "Design");
    const rows = [
      ["Contracts", `Solidity 0.8.28 + Foundry ${cite("sol")}`, "Largest ecosystem; tests and gas snapshots in Solidity"],
      ["Libraries", `OpenZeppelin 5.x ${cite("oz")}`, "Audited access control, forwarder, clones, Merkle proofs"],
      ["Elections", `EIP-1167 clones ${cite("erc")}`, "Cheap to deploy; cannot be upgraded mid-vote"],
      ["Anonymity", `Semaphore v4 ${cite("semaphore", "groth16")}`, "Audited proofs and nullifiers; custom circuits too risky"],
      ["Gasless voting", `ERC-2771 forwarder ${cite("erc")}`, "Voter needs no cryptocurrency; direct submission as fallback"],
      ["Testbed", `Ethereum Sepolia ${cite("sepolia")}`, "Free test ETH, behaves like mainnet; recommended testnet"],
      ["Frontend", `Next.js, wagmi, viem ${cite("web")}`, "Typed contract bindings; static export"],
      ["Backend", `Fastify, PostgreSQL, BullMQ ${cite("backend")}`, "Relational indexer data, reliable job queue"],
      ["Storage", `IPFS via Pinata ${cite("ipfs")}`, "Tamper-evident content for far less gas"],
    ];
    const hdr = (t) => ({ text: t, options: { bold: true, color: C.white, fill: { color: C.navy }, fontFace: BODY, fontSize: 12 } });
    const body = rows.map((r, i) => r.map((c, j) => ({
      text: c,
      options: {
        fontFace: j === 1 ? BODY : BODY, fontSize: 11.5, bold: j === 1, color: j === 0 ? C.muted : C.ink,
        fill: { color: i % 2 ? C.white : C.card },
      },
    })));
    s.addTable([[hdr("Layer"), hdr("Choice"), hdr("Why")], ...body], {
      x: 0.5, y: 1.0, w: 9.0, colW: [1.5, 3.1, 4.4], rowH: 0.36, border: { type: "none" }, margin: [0.03, 0.1, 0.03, 0.1], valign: "middle",
    });
    text(s, "Gas is deterministic, so gas is measured on a local node (Anvil). Sepolia is used for end-to-end latency and the live demo.", {
      x: 0.5, y: 4.75, w: 9.0, h: 0.4, fontSize: 11, italic: true, color: C.navy,
    });
    pageNo(s, 11);
  }

  // 12. Evaluation parameters ----------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "Evaluation parameters: 14 in five groups", "Evaluation");
    const stats = [
      ["Cost of anonymity", "Gas per ballot, tier 2 vs tier 3", "A1"],
      ["Latency", "Median and 95th percentile, next to block time", "B1, B2"],
      ["Flat gas", "Registration and tier 3 ballot as the roll grows", "C1"],
      ["Attacks fail", "Double vote, wrong root, deanonymize, overreach", "D1 to D5"],
      ["Zero ETH", "The voter needs no cryptocurrency", "E2"],
    ];
    const sw = 1.66, sg = 0.18;
    stats.forEach(([n, l, id], i) => {
      const x = 0.5 + i * (sw + sg);
      card(s, x, 1.05, sw, 1.55);
      text(s, n, { x: x + 0.08, y: 1.15, w: sw - 0.16, h: 0.5, fontFace: HEAD, fontSize: 15, bold: true, color: C.teal, align: "center", valign: "middle" });
      text(s, l, { x: x + 0.1, y: 1.68, w: sw - 0.2, h: 0.6, fontSize: 10.5, color: C.ink, align: "center" });
      text(s, id, { x, y: 2.28, w: sw, h: 0.25, fontSize: 10, bold: true, color: C.muted, align: "center" });
    });
    const groups = [
      ["Cost", "A1", "Gas per operation, measured locally"],
      ["Performance", "B1, B2", "Vote latency on Sepolia; proving time per device"],
      ["Scalability", "C1 to C3", "Gas vs roll size; booth time vs roll size; load limit"],
      ["Security", "D1 to D5", "An attack that must fail: double vote, wrong root, deanonymize, audit with backend off, authority overreach"],
      ["Usability", "E1 to E3", "Steps to vote; zero ETH; unaided test with new users"],
    ];
    groups.forEach(([g, ids, d], i) => {
      const y = 2.85 + i * 0.44;
      text(s, g, { x: 0.5, y, w: 1.5, h: 0.38, fontSize: 12.5, bold: true, color: C.navy, valign: "middle" });
      s.addShape("roundRect", { x: 2.0, y: y + 0.04, w: 1.0, h: 0.3, rectRadius: 0.05, fill: { color: C.tealTint }, line: { color: C.tealTint } });
      text(s, ids, { x: 2.0, y: y + 0.04, w: 1.0, h: 0.3, fontSize: 10.5, bold: true, color: C.teal, align: "center", valign: "middle" });
      text(s, d, { x: 3.15, y, w: 6.35, h: 0.38, fontSize: 11.5, valign: "middle" });
    });
    text(s, "Nothing is built yet, so there are no numeric targets. Evaluation 2 reports measured values.", {
      x: 0.5, y: 5.08, w: 8.5, h: 0.3, fontSize: 10.5, italic: true, color: C.muted,
    });
    pageNo(s, 12);
  }

  // 13. Implementation plan ------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "Implementation plan", "Plan");
    text(s, "Implementation starts after midsems.", { x: 0.5, y: 0.92, w: 6, h: 0.28, fontSize: 11, italic: true, color: C.muted });
    const ph = [
      ["Phase 1", "M1: a vote works end to end (tier 2)", ["Contracts and Merkle voting", "Admin console, ballot screen", "Local voters vote end to end", "Tests; first gas snapshot"]],
      ["Phase 2", "M2: anonymous and gasless (tier 3)", ["Proofs in the browser", "Relayer and forwarder", "Cap at the voter count", "Zero-ETH vote on Sepolia"]],
      ["Phase 3", "Feature freeze and hardening", ["TallyLib (plurality)", "Clean Slither report", "Reorgs; audit with backend off", "Usability test (E3)"]],
      ["Phase 4", "Measurement", ["All 14 parameters", "Repeated runs per point", "Median and 95th percentile", "Missed targets reported"]],
      ["Phase 5", "Rehearsal", ["Three demo runs on Sepolia", "Pre-cast ballots first", "Buffer for slippage"]],
    ];
    const tw = 1.66, tg = 0.18;
    s.addShape("line", { x: 0.8, y: 1.47, w: 8.4, h: 0, line: { color: C.line, width: 3 } });
    ph.forEach(([p, m, items], i) => {
      const x = 0.5 + i * (tw + tg);
      const fill = i < 2 ? C.teal : C.navy;
      s.addShape("ellipse", { x: x + tw / 2 - 0.17, y: 1.3, w: 0.34, h: 0.34, fill: { color: fill }, line: { color: C.white, width: 2 } });
      card(s, x, 1.8, tw, 2.25);
      text(s, p, { x: x + 0.12, y: 1.9, w: tw - 0.24, h: 0.28, fontFace: HEAD, fontSize: 13, bold: true, color: fill });
      text(s, m, { x: x + 0.12, y: 2.18, w: tw - 0.24, h: 0.5, fontSize: 10.5, bold: true, color: C.navy });
      text(s, items.map((t, k) => ({ text: t, options: { bullet: { indent: 10 }, breakLine: k < items.length - 1 } })), {
        x: x + 0.1, y: 2.7, w: tw - 0.16, h: 1.25, fontSize: 9.5, color: C.ink, paraSpaceAfter: 2,
      });
    });

    card(s, 0.5, 4.2, 4.4, 0.95, C.tealTint);
    text(s, [
      { text: "Build order: tier 2, then tier 3. ", options: { bold: true, color: C.teal } },
      { text: "Tier 2 is a Merkle root with no anonymity; tier 3 adds zero-knowledge proofs and gasless voting. The gas difference is the cost of anonymity (A1, C1).", options: { color: C.ink } },
    ], { x: 0.65, y: 4.28, w: 4.1, h: 0.8, fontSize: 10.5, valign: "middle" });
    card(s, 5.1, 4.2, 4.4, 0.95, C.amberTint);
    text(s, [
      { text: "Go/no-go. ", options: { bold: true, color: C.navy } },
      { text: "One week after M1: if phones cannot prove, proving moves to the server (weaker, and reported). Before the freeze: if tier 3 is not ready, we demo tier 2.", options: { color: C.ink } },
    ], { x: 5.25, y: 4.28, w: 4.1, h: 0.8, fontSize: 10.5, valign: "middle" });
    pageNo(s, 13);
  }

  // 14. Guarantees and limits ----------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "What we guarantee, and what we do not", "Limits");
    card(s, 0.5, 1.05, 4.3, 4.05, C.tealTint);
    text(s, "Five guarantees", { x: 0.75, y: 1.2, w: 3.8, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.teal });
    const g = [
      ["Eligibility", "ZK proof against the frozen root"],
      ["One voter, one ballot", "each nullifier used once; ballots capped at the voter count"],
      ["Ballot secrecy", "the proof reveals only that the voter is on the roll"],
      ["Verifiability", "anyone can recount from the chain, with our backend off"],
      ["Integrity of the count", "only an accepted ballot changes the tally; anyone can finalize"],
    ];
    g.forEach(([h, b], i) => {
      const y = 1.65 + i * 0.68;
      s.addImage({ data: I.check, x: 0.75, y: y + 0.03, w: 0.26, h: 0.26 });
      text(s, h, { x: 1.12, y, w: 3.5, h: 0.28, fontSize: 12.5, bold: true, color: C.navy });
      text(s, b, { x: 1.12, y: y + 0.28, w: 3.5, h: 0.36, fontSize: 10.5, color: C.muted });
    });
    card(s, 5.1, 1.05, 4.4, 4.05, C.card);
    text(s, "Seven stated non-guarantees", { x: 5.35, y: 1.2, w: 3.9, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.red });
    const ng = [
      "Coercion and vote selling",
      "Fake voters added by the registrar",
      "Roll correctness",
      "Privacy from the relayer; selective censorship",
      "Network-level anonymity (IP addresses)",
      "Secrecy of the running tally",
      "Recovery of a lost secret",
    ];
    ng.forEach((t, i) => {
      const y = 1.7 + i * 0.47;
      s.addImage({ data: I.cross, x: 5.35, y: y + 0.03, w: 0.24, h: 0.24 });
      text(s, t, { x: 5.72, y, w: 3.65, h: 0.4, fontSize: 12.5 });
    });
    pageNo(s, 14);
  }

  // 15. References --------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "References", "");
    const half = Math.ceil(REFS.length / 2);
    [REFS.slice(0, half), REFS.slice(half)].forEach((col, c) => {
      text(s, col.map(([, t], i) => [
        { text: `[${c * half + i + 1}] `, options: { bold: true, color: C.teal } },
        { text: t, options: { color: C.ink, breakLine: i < col.length - 1 } },
      ]).flat(), { x: 0.5 + c * 4.6, y: 1.05, w: 4.4, h: 4.1, fontSize: 9.5, paraSpaceAfter: 5 });
    });
    pageNo(s, 15);
  }

  // Save without speaker notes or document metadata: drop the notes slides,
  // blank the core properties and remove the application and company fields.
  const zip = await JSZip.loadAsync(await pres.write({ outputType: "nodebuffer" }));
  zip.remove("ppt/notesSlides");
  for (const name of Object.keys(zip.files).filter((n) => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(n))) {
    const rels = await zip.file(name).async("string");
    zip.file(name, rels.replace(/<Relationship [^>]*relationships\/notesSlide"[^>]*\/>/g, ""));
  }
  const types = await zip.file("[Content_Types].xml").async("string");
  zip.file("[Content_Types].xml", types.replace(/<Override PartName="\/ppt\/notesSlides\/[^>]*\/>/g, ""));
  zip.file("docProps/core.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"></cp:coreProperties>');
  const app = await zip.file("docProps/app.xml").async("string");
  zip.file("docProps/app.xml", app
    .replace(/\s*<Application>[^<]*<\/Application>/, "")
    .replace(/\s*<Company>[^<]*<\/Company>/, "")
    .replace(/\s*<AppVersion>[^<]*<\/AppVersion>/, "")
    .replace(/<Notes>\d+<\/Notes>/, "<Notes>0</Notes>"));
  for (const name of Object.keys(zip.files)) {
    zip.files[name].date = new Date(Date.UTC(1980, 0, 1));
    if (!zip.files[name].dir && /\.(xml|rels)$/.test(name)) {
      const xml = await zip.file(name).async("string");
      if (xml.includes(process.env.HOME || "/home/")) throw new Error(`local path leaked into ${name}`);
    }
  }
  fs.writeFileSync(OUT, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log("wrote", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
