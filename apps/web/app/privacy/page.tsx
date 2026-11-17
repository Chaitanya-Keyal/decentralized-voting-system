import type { Metadata } from "next";

import { Prose } from "@/components/prose";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <Prose title="Privacy">
      <p>
        DVote is a student project for BITS F452 (Blockchain Technology) at BITS Pilani, Hyderabad
        Campus. This demo runs on Sepolia, an Ethereum test network. This page says what it
        collects, and why.
      </p>

      <h2>When you register to vote</h2>
      <ul>
        <li>
          <strong>Your institute email address</strong>, to check that you may vote and that you
          register only once in each election. You prove it by signing in with your institute Google
          account. From Google we read only your email address and that it belongs to the institute;
          we keep no name or photo.
        </li>
        <li>
          <strong>What you register with</strong>: in an anonymous election, the public part of a
          voting key made on your device; in a wallet election, your wallet address. It is kept with
          your email address.
        </li>
        <li>
          <strong>Your voting key stays on your device.</strong> Nobody else, us included, can vote
          with it or tell which ballot is yours.
        </li>
      </ul>

      <h2>What becomes public</h2>
      <ul>
        <li>
          The voter list, on IPFS and fixed on the blockchain when registration closes. It holds the
          public keys or wallet addresses, never email addresses.
        </li>
        <li>
          Ballots, on the blockchain. In an anonymous election a ballot carries a proof, not who
          cast it. In a wallet election it shows the wallet that cast it.
        </li>
        <li>Nothing on the blockchain or IPFS can be deleted, by us or anyone.</li>
      </ul>

      <h2>Your connection</h2>
      <p>
        As with any website, the servers that carry and answer your requests see your IP address,
        and the registrar&apos;s request logs record it. The relayer, which sends ballots, does not
        log it: it keeps a scrambled form for two minutes, only to limit how many ballots one
        connection can send.
      </p>

      <h2>Your browser</h2>
      <p>
        DVote sets no cookies and has no analytics or ads. Your browser keeps your voting key and
        receipts in this site&apos;s storage so that you can vote and check your ballot; clearing
        the site&apos;s data removes them. Google&apos;s sign-in button is Google&apos;s, and
        Google&apos;s privacy policy covers it.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We use your email address only to run the demo&apos;s elections, and we never sell or share
        it. The database and logs are deleted when the demo is taken down after the course.
      </p>
    </Prose>
  );
}
