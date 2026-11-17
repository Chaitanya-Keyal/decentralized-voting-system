import type { Metadata } from "next";
import Link from "next/link";

import { Prose } from "@/components/prose";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <Prose title="Terms of use">
      <p>
        DVote is a student project for BITS F452 (Blockchain Technology) at BITS Pilani, Hyderabad
        Campus. This demo runs on Sepolia, an Ethereum test network, whose ether has no value.
      </p>
      <ul>
        <li>
          Use it to try the system and to take part in demo elections, not for an election whose
          result binds anyone.
        </li>
        <li>Register only with your own institute account.</li>
        <li>
          A ballot is final once cast: it is on the blockchain, and nobody can change or withdraw
          it.
        </li>
        <li>Do not try to disrupt the service or other voters.</li>
        <li>
          It comes as is, with no warranty. It may be down, reset or changed at any time, and an
          election may fail.
        </li>
      </ul>
      <p>
        What it collects is on the <Link href="/privacy">privacy</Link> page.
      </p>
    </Prose>
  );
}
