# Demo walkthrough

This is the script for the Evaluation 2 demo. It runs a real anonymous election on Ethereum
Sepolia, with the people in the room as voters, and then audits the result in the browser. With
the schedule below it takes about 20 minutes, from the room registering to the audit. Voting
cannot be closed before its scheduled end, so the voting window sets the length: confirm the
slot length beforehand and size the windows to it. A finished election, prepared in advance,
covers any step that runs late.

The order follows the plan from Evaluation 1. Everyone in the room registers first. The ballots
of voters who registered beforehand go in before any live ballot, so no live ballot is the only
one cast in its block.

## What the demo shows

| Step | What the audience sees | What it shows |
|---|---|---|
| 1 | An election created from the authority's wallet, and its contract on a block explorer | The rules and the count are in a contract nobody controls (FR1) |
| 2 | People in the room make a voting key on their phone and sign in with their institute Google account | Only a commitment leaves the phone; the registrar never sees the key (FR2) |
| 3 | The registrar publishes the voter list by itself when registration closes | The root, the voter count and the list's IPFS address go on-chain in one transaction, and the list cannot change after that (FR3) |
| 4 | During the gap before voting, a voter checks they are on the list | The booth rebuilds the list in the browser and checks it against the on-chain root |
| 5 | Voters cast ballots from phones with no wallet and no ETH | The proof is made on the phone, and the relayer pays the gas (FR5, FR7, E2) |
| 6 | A voter who has voted opens the booth again and is told so | The nullifier stops a second ballot, without saying who cast the first |
| 7 | Someone other than the authority closes voting and finalizes | The authority cannot hold the result back (D5) |
| 8 | Run the audit | The count is recomputed from the chain and IPFS, every proof is checked again, and no request goes to our API (FR8, D4) |

## Before the day

**The election list.** The demo serves only elections created by the wallets in its
`AUTHORITIES` setting: it lists them, registers their voters and pays for their ballots. List there
only the wallets that will create the demo's elections; test elections made from other wallets
then stay off the list.

**Wallets.** Prepare these:

- the authority's wallet, in a browser wallet on Sepolia, and listed in `AUTHORITIES` on the
  demo, since the registrar serves only elections created by those wallets;
- a second wallet with a little Sepolia ETH, to close voting and finalize, which shows that
  anyone can;
- the relayer's account, funded, and a funded backup key;
- two or three funded wallets for direct submission, in case the relayer is down.

**Sign-in.** Voters register by signing in with their institute Google account, so check it with
a real institute account the day before. If it is not working by then, show the finished
election and the backup video instead.

**A finished election.** Run one complete anonymous election the day before, with a few
voters. Its result page and audit can then be shown at once if the live election runs late. A
finished wallet election makes a useful comparison: its ballots table shows who voted for whom.

**Rehearsals.** Rehearse three times on the presentation laptop and the room's network, timing
each step. A backup video, [demo-backup.mp4](demo-backup.mp4), tells the whole story in under
two and a half minutes: a scripted run on a local chain, in dark mode, narrated, with a caption and
a visible pointer for each step. Its voters sign in through the browser tests' stand-in for Google
(`e2e/google.ts`), which shows an address box where Google's button would be.
`E2E_VIDEO=1 E2E_VIDEO_OUT=<file> pnpm e2e --grep "backup video"` records it again after a change;
the comment at the top of `e2e/video.spec.ts` says how the narration is laid over it.

## Setting up the live election

Create the live election from the authority's wallet about 30 minutes before the demo. Times
are relative to the start of the demo slot, T:

| Step | Time | Why |
|---|---|---|
| Registration opens | T − 15 min | The voters who vote first register before the demo starts |
| Registration closes | T + 6 min | About five minutes for the room to register |
| Voting opens | T + 9 min | Three minutes for the registrar to publish and for voters to check the list |
| Voting closes | T + 18 min | Long enough for everyone, with a margin for slow phones |

The schedule cannot change once registration has opened, so adjust these times to the slot
before then. Use anonymous ballots, with plurality counting and three or four candidates.

## During the demo

1. **The election.** Open the election page and show the phase, the schedule and the contract
   address. Press the address and choose **Blockscout**, a public explorer run by others; the same
   menu offers Etherscan, in case one is down. Blockscout's **Logs** tab names every event: the
   voter list's publication, each `VoteCast`, `Finalized` with the tally, and Etherscan shows the
   same events. Each election is a minimal-proxy clone, so its own page shows only a few
   bytes of code; under the audit, **The contract's source code** opens the shared contract it
   copies, whose Solidity source is verified on Sourcify and Etherscan.
2. **Registration.** Put the registration page's address on the projector as a QR code. Each
   person opens it on their phone, creates a voting key, signs in with Google and registers. Point
   out the line explaining what the registrar can and cannot see. Anyone who will vote from
   another device can carry the key across with the QR code on the page.
3. **The list.** When registration closes, the page shows the voter count, the root, and a link
   to the full list on IPFS, without anyone pressing a button. A voter opens the booth, and it
   reports them as "on the voter list, checked in this browser".
4. **The first ballots.** When voting opens, someone presses **Open voting** (any wallet can).
   The voters who registered beforehand cast their ballots first.
5. **The room votes.** Everyone else opens the booth, marks a candidate and presses **Cast my
   ballot, no wallet needed**. The booth shows the proving progress, then the relayer's signed
   receipt, then "You have voted", usually within 10 to 25 seconds, one or two blocks after the
   click. Show the tally moving on the election page.
6. **No second ballot.** One voter opens the booth again. It says they have voted, and it offers
   no button to vote again.
7. **The result.** Once voting closes, the second wallet presses **Close voting** and then
   **Finalize the result**. The page names the winner.
8. **The audit.** Press **Run the audit** and wait for "Every check passed". Show the ballots
   table: each ballot appears under its ballot ID only, and a voter finds their own ballot marked
   "yours".

If there is time, open a wallet election's ballots table next to this one. It shows the
difference between the tiers: there, every ballot appears beside the wallet that cast it.

## When something goes wrong

| Problem | What to do |
|---|---|
| The relayer stops answering, or reports a failure | In the booth, open **Advanced: send it from a wallet of your own instead**, connect one of the funded wallets and press **Submit from my wallet**. The proof still hides the voter; only the wallet is visible |
| Voting closes within five minutes | The booth warns about this and suggests submitting from a wallet, which is quicker |
| The voter list is not published a minute after registration closes | Press **Ask the registrar to publish it now** on the election page. If voting's start time passes without a list, this election cannot go ahead: switch to the finished election |
| A page seems stuck on an old phase | Wait for the next block (12 s). The page refreshes itself, and the browser falls back to another public RPC endpoint |
| Someone cannot sign in with Google | They watch; the voters who registered beforehand are enough for every step |
| The room registers too slowly | Let registration close on schedule. Show the result and the audit on the finished election |
| The network fails | Play the backup video ([demo-backup.mp4](demo-backup.mp4)). If there is time, run the same steps on a local chain on the laptop, as in [CONTRIBUTING.md](../CONTRIBUTING.md#trying-an-election-in-the-browser), where **Move the chain's clock** skips the waits |

## Questions worth preparing for

- *Can the registrar tell who voted for whom?* No. It sees an email address and a commitment.
  The ballot carries a proof and a nullifier, and neither can be linked to a commitment without
  the voter's key. See [architecture.md](architecture.md) for what the relayer can see.
- *What stops the registrar adding fake voters?* Nothing on-chain. Eligibility is the one thing
  the system trusts the registrar with. Publishing the voter count does not reveal padding,
  because registration is voluntary and nobody else knows the true number. What it does is fix
  that number in public before any ballot is cast, after which the contract refuses extra
  ballots. See voter list correctness in [architecture.md](architecture.md), section 2.
- *Why does creating an election cost so much more on Sepolia?* Sepolia runs Glamsterdam, whose
  EIP-8037 prices new state several times higher than mainnet. Creating an election costs about
  five times as much there, and a ballot, which writes one new storage slot, about a third more.
  Section 6 of the report gives both.
- *What if a voter loses their key?* They cannot vote, and nobody can vote for them. The key
  is offered as a backup file and as a QR code at registration for this reason.
