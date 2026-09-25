// Builds reports/eval1-slides.pptx, the Evaluation 1 presentation.
// Run from reports/: node slides/build-deck.js
// Needs pptxgenjs, react, react-dom, react-icons and sharp on NODE_PATH.

const path = require("path");
const pptxgen = require("pptxgenjs");
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

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.title = "DVote: A Decentralized Voting System";
  pres.company = "BITS Pilani, Hyderabad Campus";

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
    s.addImage({ path: LOGO, x: 0.65, y: 0.56, w: 4.0, h: 4.0 * 390 / 1890 });
    text(s, "DVote", { x: 0.5, y: 1.85, w: 5.2, h: 0.95, fontFace: HEAD, fontSize: 54, bold: true, color: C.white });
    text(s, "A Decentralized Voting System", { x: 0.5, y: 2.8, w: 5.2, h: 0.5, fontFace: HEAD, fontSize: 22, color: C.amber });
    text(s, "Blockchain Technology (BITS F452)  |  Group 6\nEvaluation 1", {
      x: 0.5, y: 3.55, w: 5.2, h: 0.7, fontSize: 14, color: "C9D3DF", paraSpaceAfter: 4,
    });
    const members = [
      "Varad Kailas Thombre", "Naman Singhal", "Shivam Goyal", "Rishit Agarwal",
      "Vihaan Kashyap", "Palak Agarwal", "Chaitanya Keyal", "Wamika Sehgal",
    ];
    s.addShape("roundRect", { x: 6.2, y: 1.85, w: 3.3, h: 2.85, rectRadius: 0.08, fill: { color: C.navySoft }, line: { color: C.navySoft } });
    text(s, "Team", { x: 6.45, y: 2.0, w: 2.8, h: 0.35, fontFace: HEAD, fontSize: 15, bold: true, color: C.amber });
    text(s, members.map((m, i) => ({ text: m, options: { breakLine: i < members.length - 1 } })), {
      x: 6.45, y: 2.4, w: 2.9, h: 2.5, fontSize: 13, color: C.white, paraSpaceAfter: 3,
    });
    s.addNotes("Introduce the project: DVote is a voting application where smart contracts hold the voter roll, the schedule and the count, so nobody has to trust the organiser for a correct result. Nothing is built yet; this evaluation covers the problem, requirements, design and plan. Implementation starts after midsems.");
  }

  // 2. The problem ---------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "The problem: one operator, four jobs", "Problem");
    text(s, "Institutional elections usually run on one operator's database. Voters have to trust that operator with the roll, the ballot box, the count and the log, and nobody outside can check any of them.", {
      x: 0.5, y: 1.1, w: 3.6, h: 1.9, fontSize: 16, color: C.ink,
    });
    s.addShape("roundRect", { x: 0.5, y: 3.6, w: 3.6, h: 1.25, rectRadius: 0.08, fill: { color: C.amberTint }, line: { color: C.amberTint } });
    text(s, [
      { text: "Why not paper?", options: { bold: true, color: C.navy, breakLine: true } },
      { text: "It takes the operator out of the box and the count, but costs too much at this scale, and a voter still cannot check their own vote." },
    ], { x: 0.7, y: 3.72, w: 3.2, h: 1.05, fontSize: 12.5 });

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
    s.addNotes("A hosted system asks voters to trust one operator with four separate jobs. Any ordinary administrator can abuse each one: add or remove voters without anyone noticing, use unused votes at the end once they know how many are needed, and show the voter a confirmation screen from the same system that could have dropped the ballot. Paper fixes the box and count but is too expensive here, and the secret ballot means a voter cannot check their own vote. Scope: student senates, clubs, shareholder votes; a few hundred to a hundred thousand voters. National elections are out of scope.");
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
    s.addNotes("A blockchain is slow and expensive, so it has to earn its place. It does when parties who distrust each other need a record none of them controls, and outsiders must be able to check it. Otherwise a normal database is cheaper. A private chain run by the authority and candidates fails the second test: only node operators can check it. Be upfront about what it does not fix: eligibility is still an off-chain check, a bad counting rule is permanent, privacy needs cryptography, and on coercion we are worse than paper.");
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
    s.addNotes("Walk through the five steps. Key terms: a commitment is a hash of the voter's secret; the Merkle root is one 32-byte value that commits to the whole list; the zero-knowledge proof shows the voter owns one commitment without revealing which; the nullifier is deterministic per voter per election, so a repeat is rejected, but it reveals nothing about who. The booth downloads the public list from IPFS and builds the proof itself, so the registrar never learns who is voting.");
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
    s.addNotes("Every power is justified. The Authority sets up the election but anyone can close voting and publish the result once the time passes, so it cannot stall an election it is losing. The Registrar checks institute email plus OTP off-chain, because personal data must never go on a public chain, and it plays no part in voting. Candidates get no special powers because every power affects the result they compete for. Anyone can audit, without our backend. The relayer exists so voters need no cryptocurrency; it cannot change a ballot because the choice is locked inside the proof.");
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
      ["Cost", "ballot under 400k gas (A1)"],
      ["Latency", "95% on-chain within 30 s (B1, B2)"],
      ["Scalability", "gas per operation flat in roll size (C1 to C3)"],
      ["No crypto needed", "voter holds zero ETH (E2)"],
      ["Usability", "over 80% vote unaided (E1, E3)"],
    ];
    text(s, nfr.map(([a, b], i) => [
      { text: a, options: { bold: true, color: C.navy } },
      { text: b.startsWith("(") ? ` ${b}` : `: ${b}`, options: { color: C.ink, breakLine: i < nfr.length - 1 } },
    ]).flat(), { x: 6.05, y: 1.6, w: 3.3, h: 3.45, fontSize: 11.5, paraSpaceAfter: 5 });
    pageNo(s, 6);
    s.addNotes("Each functional requirement comes from an actor and has a reason in the report. Highlight FR4 (permissionless closing so the authority cannot stall), FR5 (proof plus nullifier gives one ballot per voter without recording addresses), and FR6 (the booth never asks the registrar, otherwise registrar plus relayer could link voter to vote). Every non-functional requirement is tested by a Section 5 parameter. NFR2, NFR3 and NFR8 matter most.");
  }

  // 7. Architecture --------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "System architecture", "Design");
    const bands = [
      { y: 1.0, h: 0.8, label: "Browser", sub: "Next.js, wagmi, viem", fill: C.tealTint, boxes: ["Ballot booth", "Admin console", "Audit dashboard"] },
      { y: 2.2, h: 0.8, label: "Off-chain services", sub: "never a source of truth", fill: C.card, boxes: ["Relayer", "Registrar", "Indexer", "IPFS metadata"] },
      { y: 3.4, h: 1.3, label: "Contracts", sub: "on Ethereum Sepolia", fill: C.amberTint, boxes: ["VoteForwarder", "VoterRegistry", "Election", "ElectionFactory", "SemaphoreVerifier", "TallyLib"] },
    ];
    const bx0 = 2.15, bxEnd = 9.2;
    bands.forEach((b) => {
      s.addShape("roundRect", { x: 0.5, y: b.y, w: 9.0, h: b.h, rectRadius: 0.08, fill: { color: b.fill }, line: { color: b.fill } });
      text(s, [
        { text: b.label, options: { bold: true, color: C.navy, fontSize: 13, breakLine: true } },
        { text: b.sub, options: { color: C.muted, fontSize: 10, italic: true } },
      ], { x: 0.65, y: b.y, w: 1.45, h: b.h, valign: "middle" });
      const perRow = b.boxes.length === 6 ? 3 : b.boxes.length;
      const gap = 0.18;
      const w = (bxEnd - bx0 - gap * (perRow - 1)) / perRow;
      b.boxes.forEach((name, i) => {
        const row = Math.floor(i / perRow), col = i % perRow;
        const x = bx0 + col * (w + gap);
        const y = b.y + 0.15 + row * 0.55;
        s.addShape("roundRect", { x, y, w, h: 0.45 + (b.boxes.length === 6 ? 0 : 0.05), rectRadius: 0.06, fill: { color: C.white }, line: { color: C.line, width: 0.75 } });
        text(s, name, { x, y, w, h: 0.45 + (b.boxes.length === 6 ? 0 : 0.05), fontSize: 11.5, bold: true, color: C.ink, align: "center", valign: "middle", fontFace: b.boxes.length === 6 ? "Courier New" : BODY });
      });
    });
    const arrow = (x, y1, y2, label, lx, dash) => {
      s.addShape("line", { x, y: y1, w: 0, h: y2 - y1, line: { color: C.navy, width: 1.5, endArrowType: "triangle", dashType: dash ? "dash" : "solid" } });
      if (label) text(s, label, { x: lx, y: y1 + 0.02, w: 1.9, h: 0.36, fontSize: 9.5, italic: true, color: C.muted, valign: "middle" });
    };
    arrow(3.0, 1.75, 2.35, "signed ballot + proof", 3.08);
    arrow(5.15, 2.95, 3.55, "root, voter count, list address", 5.23);
    arrow(3.0, 2.95, 3.55, "submits via forwarder", 3.08);
    s.addShape("line", { x: 7.05, y: 2.95, w: 0, h: 0.6, line: { color: C.navy, width: 1.5, beginArrowType: "triangle" } });
    text(s, "VoteCast events", { x: 7.13, y: 2.97, w: 1.6, h: 0.36, fontSize: 9.5, italic: true, color: C.muted, valign: "middle" });
    text(s, "The audit dashboard reads the chain through a public RPC endpoint, never our backend. With every service off, anyone can still recount.", {
      x: 0.5, y: 4.82, w: 9.0, h: 0.4, fontSize: 11, italic: true, color: C.navy,
    });
    pageNo(s, 7);
    s.addNotes("Three layers. The browser app has the admin console, the ballot booth and the audit dashboard. Four Node services have no say over the result: the relayer pays gas, the registrar checks eligibility, the indexer is only a cache, and the metadata service pins files to IPFS. The contracts hold everything that decides the election. Registrar is needed only to register; relayer only for voters without gas, and a voter with gas can submit directly. The relayer must run separately from the registrar, with its own database and logs, otherwise the two logs together could link a voter to their vote.");
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
    s.addShape("line", { x: 2.85, y: 1.6, w: -0.1, h: 0.45, flipH: true, line: { color: C.red, width: 1, dashType: "dash", endArrowType: "triangle" } });
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
    s.addNotes("Why both a time check and a transaction: time alone leaves the current phase unclear; transactions alone would let the authority close voting once the count turned against it. Cancel is only possible before voting opens. Clones are cheap to deploy and cannot be upgraded, so the authority cannot change the rules mid-vote. The forwarder is a convenience, not a security measure: the proof stops a relayer changing a ballot, and the nullifier stops a replay. Each ballot uses a fresh signing key.");
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
    s.addNotes("This is the path the examiner is most likely to probe. The booth never asks the registrar for anything, because a registrar that supplied the proof data would learn who is voting. The relayer checks the proof and that the nullifier is unused before paying gas, so it cannot be drained with junk ballots. The signing key is throwaway: eligibility comes from the proof, so the voter needs no wallet. castVote emits a VoteCast event that the indexer and auditors read.");
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
    text(s, "Each leaf is a voter's commitment (a hash of their secret). Only the 32-byte root goes on-chain, so registration costs the same for 10 or 100,000 voters. The browser proves in zero knowledge that it knows the secret behind one leaf on the highlighted path, without revealing which leaf.", {
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
    s.addNotes("This is Semaphore v4. The candidate choice is locked into the proof, so a relayer cannot change it. A voter hides among everyone on the roll, no more: in a small election, or for the very first ballot, the anonymity is weak, so the demo pre-casts several ballots. Groth16 needs a trusted setup; we use Semaphore's published setup files and check their hashes. The nullifier costs the same storage write as a hasVoted flag plus the proof check; A1 measures that price. The tree has to be rebuilt in the browser from the public list, which grows with the roll; C2 measures that.");
  }

  // 11. Tech stack ---------------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "Technology choices", "Design");
    const rows = [
      ["Contracts", "Solidity 0.8.28 + Foundry", "Largest ecosystem; tests and gas snapshots in Solidity"],
      ["Libraries", "OpenZeppelin 5.x", "Audited access control, forwarder, clones, Merkle proofs"],
      ["Elections", "EIP-1167 clones", "Cheap to deploy; cannot be upgraded mid-vote"],
      ["Anonymity", "Semaphore v4 (Groth16)", "Audited proofs and nullifiers; custom circuits too risky"],
      ["Gasless voting", "ERC-2771 forwarder", "Voter needs no cryptocurrency; direct submission as fallback"],
      ["Testbed", "Ethereum Sepolia", "Free test ETH, behaves like mainnet; recommended testnet"],
      ["Frontend", "Next.js, wagmi, viem", "Typed contract bindings; static export"],
      ["Backend", "Fastify, PostgreSQL, BullMQ", "Relational indexer data, reliable job queue"],
      ["Storage", "IPFS via Pinata", "Tamper-evident content for far less gas"],
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
      x: 0.5, y: 1.0, w: 9.0, colW: [1.6, 2.6, 4.8], rowH: 0.36, border: { type: "none" }, margin: [0.03, 0.1, 0.03, 0.1], valign: "middle",
    });
    text(s, "Gas is deterministic, so gas is measured on a local node (Anvil). Sepolia is used for end-to-end latency and the live demo.", {
      x: 0.5, y: 4.75, w: 9.0, h: 0.4, fontSize: 11, italic: true, color: C.navy,
    });
    pageNo(s, 11);
    s.addNotes("Alternatives we rejected: Vyper (few libraries), non-EVM chains (lose running the same code locally and on the testnet), Hardhat 3 (wagmi types Foundry output anyway), custom circom circuits (too long, unaudited crypto at the centre of a security project), MACI (adds coercion resistance but needs a trusted coordinator). IPFS guarantees content has not changed but not that it stays available, so we and auditors pin the voter list. We do not use Semaphore's on-chain groups because they cost one transaction per voter; we store only the root.");
  }

  // 12. Evaluation parameters ----------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "Evaluation parameters: 14 in five groups", "Evaluation");
    const stats = [
      ["< 400k", "gas per ballot", "A1"],
      ["< 30 s", "95% of votes on-chain", "B1"],
      ["< 5 s", "proof on a mid-range phone", "B2"],
      ["0 ETH", "needed by the voter", "E2"],
      ["> 80%", "vote unaided", "E3"],
    ];
    const sw = 1.66, sg = 0.18;
    stats.forEach(([n, l, id], i) => {
      const x = 0.5 + i * (sw + sg);
      card(s, x, 1.05, sw, 1.55);
      text(s, n, { x, y: 1.15, w: sw, h: 0.65, fontFace: HEAD, fontSize: 28, bold: true, color: C.teal, align: "center", valign: "middle" });
      text(s, l, { x: x + 0.1, y: 1.8, w: sw - 0.2, h: 0.45, fontSize: 11, color: C.ink, align: "center" });
      text(s, id, { x, y: 2.25, w: sw, h: 0.25, fontSize: 10, bold: true, color: C.muted, align: "center" });
    });
    const groups = [
      ["Cost", "A1", "Gas per operation, measured locally"],
      ["Performance", "B1, B2", "Vote latency on Sepolia; proving time per device"],
      ["Scalability", "C1 to C3", "Gas vs roll size (10 to 100,000); booth time; load limit"],
      ["Security", "D1 to D5", "An attack that must fail: double vote, wrong root, deanonymize, audit with backend off, authority overreach"],
      ["Usability", "E1 to E3", "At most 4 steps; zero ETH; 10-user test"],
    ];
    groups.forEach(([g, ids, d], i) => {
      const y = 2.85 + i * 0.44;
      text(s, g, { x: 0.5, y, w: 1.5, h: 0.38, fontSize: 12.5, bold: true, color: C.navy, valign: "middle" });
      s.addShape("roundRect", { x: 2.0, y: y + 0.04, w: 1.0, h: 0.3, rectRadius: 0.05, fill: { color: C.tealTint }, line: { color: C.tealTint } });
      text(s, ids, { x: 2.0, y: y + 0.04, w: 1.0, h: 0.3, fontSize: 10.5, bold: true, color: C.teal, align: "center", valign: "middle" });
      text(s, d, { x: 3.15, y, w: 6.35, h: 0.38, fontSize: 11.5, valign: "middle" });
    });
    text(s, "All are targets for Evaluation 2, not measurements. Missed targets will be reported.", {
      x: 0.5, y: 5.08, w: 8.5, h: 0.3, fontSize: 10.5, italic: true, color: C.muted,
    });
    pageNo(s, 12);
    s.addNotes("C1 is the central claim, stated narrowly: publishing the roll and casting a tier 3 ballot should cost the same gas at any roll size; a tier 2 ballot rises slowly; tier 3 costs more than tier 2 throughout, which is the price of anonymity. C2 checks the cost did not just move to the browser: tree rebuild under 5 s at 10,000 voters on a phone, reported at 100,000. B1 allows for Sepolia's 12-second blocks. Rupee cost is not graded because it depends on gas price and exchange rate. A failure in D1, D2 or D5 stops the live demo.");
  }

  // 13. Implementation plan ------------------------------------------------
  {
    const s = pres.addSlide();
    s.background = { color: C.white };
    title(s, "Implementation plan", "Plan");
    text(s, "Implementation starts after midsems.", { x: 0.5, y: 0.92, w: 6, h: 0.28, fontSize: 11, italic: true, color: C.muted });
    const ph = [
      ["Phase 1", "M1: a vote works end to end (tier 2)", ["Contracts and Merkle voting", "Admin console, ballot screen", "5 local voters vote", "Tests above 80%; gas snapshot"]],
      ["Phase 2", "M2: anonymous and gasless (tier 3)", ["Proofs in the browser", "Relayer and forwarder", "Cap at the voter count", "Zero-ETH vote on Sepolia"]],
      ["Phase 3", "Feature freeze and hardening", ["TallyLib (plurality)", "Slither clean; tests above 90%", "Reorgs; audit with backend off", "Usability test (E3)"]],
      ["Phase 4", "Measurement", ["All 14 parameters", "30+ runs per point", "Median and 95th percentile", "Missed targets reported"]],
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
    s.addNotes("Phase 1 is a complete vote end to end, because leaving integration to the end is how projects fail. Phase 2 takes the two hardest parts early: proofs in the browser and the relayer. Phase 3 is finishing, not new features. Phase 4 gives every parameter a number or a reason there is none. Risks: browser proving on phones (the go/no-go), relayer down on the day (voters with gas submit directly), relayer drained (it checks the proof and nullifier before paying), not enough Sepolia ETH (load and gas tests run on a local node). Server-side proving is weaker because the secret leaves the device; tier 2 alone is still a complete voting system.");
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
    s.addNotes("State the limits before being asked. Eligibility depends on Semaphore's published trusted setup; we check the hashes but did not run it. One registrar still decides who may vote: publishing the voter count fixes it before any ballot, and the contract refuses ballots beyond it, but it cannot detect fake voters. Secrecy from our own operator holds only if the relayer runs separately from the registrar, or the voter submits directly. All seven non-guarantees are future work.");
  }

  await pres.writeFile({ fileName: OUT });
  console.log("wrote", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
