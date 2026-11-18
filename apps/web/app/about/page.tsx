import type { Metadata } from "next";
import Link from "next/link";

import { Prose } from "@/components/prose";

export const metadata: Metadata = { title: "How it works" };

export default function AboutPage() {
  return (
    <Prose title="How DVote works">
      <p>
        DVote runs elections whose result anyone can check for themselves. It is a student project
        for BITS F452 (Blockchain Technology) at BITS Pilani, Hyderabad Campus. This site runs it on
        Sepolia, an Ethereum test network, so nothing here costs real money.
      </p>

      <h2>The problem</h2>
      <p>
        In an ordinary online poll, whoever runs the server holds the voter list, the ballot box and
        the count, and nobody else can check any of them. DVote puts the rules and the count in a
        smart contract on a blockchain: a program everyone can read and nobody can change, whose
        every step is public.
      </p>

      <h2>An anonymous election, step by step</h2>
      <ol>
        <li>
          <strong>The organiser creates it</strong> from their wallet: the title, the candidates and
          the schedule. All three are recorded in the election&apos;s contract; the schedule is
          fixed once registration opens, and the candidates once voting opens.
        </li>
        <li>
          <strong>Voters register.</strong> Each voter&apos;s browser makes a voting key, and they
          sign in with their institute Google account. The registrar checks that the address is an
          institute one and records the key&apos;s public code. The key itself never leaves the
          voter&apos;s devices.
        </li>
        <li>
          <strong>The voter list is fixed.</strong> When registration closes, the registrar puts the
          list on IPFS and records its fingerprint in the contract. Nobody can add or remove a voter
          after that, and every voter can check that they are on it.
        </li>
        <li>
          <strong>Voters vote.</strong> The browser makes a zero-knowledge proof: it shows the
          ballot comes from someone on the list without showing who. A relayer sends it to the
          contract and pays the fee, so voters need no wallet and no cryptocurrency.
        </li>
        <li>
          <strong>The contract counts.</strong> It checks the proof, refuses a second ballot from
          the same key, and adds the vote to the total.
        </li>
        <li>
          <strong>Anyone checks the result.</strong> When voting closes, anyone can close the
          election and finalize the result. Anyone can then run the audit on the election&apos;s
          page: the browser recounts every ballot from the blockchain and IPFS alone, without asking
          our servers anything.
        </li>
      </ol>

      <h2>What is public, and what stays private</h2>
      <ul>
        <li>
          <strong>Public:</strong> the candidates, the voter list (the voting keys&apos; public
          codes only, never names or email addresses), every ballot and the count.
        </li>
        <li>
          <strong>Private:</strong> who cast which ballot. The registrar knows who registered but
          cannot tell which ballot is whose. The relayer sees each ballot and the network address it
          came from, but not whose key made it.
        </li>
        <li>
          <strong>Kept by the registrar only:</strong> email addresses, to stop anyone registering
          twice. They never go on the blockchain.
        </li>
      </ul>

      <h2>What you still have to trust</h2>
      <p>
        The registrar decides who may vote, so it could add voters who should not be there.
        Publishing the list freezes it where everyone can see it, but checking it against the
        institute&apos;s own records is up to people outside DVote. Everything after that, from the
        ballots to the count, anyone can check.
      </p>

      <h2>Checking it without trusting this site</h2>
      <p>
        You do not have to take this site&apos;s word for anything. Each election page links to its
        contract on Blockscout and Etherscan, block explorers run by others that read the blockchain
        for themselves. There you can see every step sent to the election, every ballot (by its
        ballot ID alone), the voter list&apos;s fingerprint, and the totals and winner. Every
        election of the same kind runs the same contract code, which is verified on Sourcify and
        readable on Blockscout.
      </p>

      <p>
        Voter lists, descriptions and manifestos are on IPFS, where a document&apos;s address is a
        hash of its contents. Besides this site&apos;s own IPFS node, the registrar copies them to
        Pinata, a pinning service that offers them to the whole IPFS network, so any IPFS gateway or
        node can fetch them. If a copy doesn&apos;t match the address recorded in the contract, it
        isn&apos;t the published document.
      </p>

      <h2>Two kinds of election</h2>
      <ul>
        <li>
          <strong>Anonymous ballots</strong>, as above.
        </li>
        <li>
          <strong>Wallet ballots:</strong> voters register a wallet and vote from it, paying a small
          network fee (gas). They cost less to run, but anyone can see which wallet voted for whom.
        </li>
      </ul>

      <p>
        What this site keeps about you is on the <Link href="/privacy">privacy</Link> page.
      </p>
    </Prose>
  );
}
