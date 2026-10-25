// Mock data for building the booth and results screens before they are wired
// to the contracts. The types mirror what the contracts and API will return,
// so swapping the mock for real data should not change the components.

export type Phase = "created" | "registration" | "voting" | "tallying" | "finalized" | "cancelled";

export interface Candidate {
  id: number;
  name: string;
  /** IPFS address of the candidate's manifesto. */
  manifestoCid: string;
}

export interface Election {
  /** On-chain address of this election's contract. */
  address: `0x${string}`;
  title: string;
  description: string;
  phase: Phase;
  candidates: Candidate[];
  /** Unix timestamps, in seconds. */
  votingOpensAt: number;
  votingClosesAt: number;
}

export interface Receipt {
  electionAddress: `0x${string}`;
  transactionHash: `0x${string}`;
  /** Block explorer link for the transaction. */
  explorerUrl: string;
}

export type Tally = {
  candidateId: number;
  votes: number;
}[];

/** Steps the booth shows while a ballot is being cast. */
export const CAST_STEPS = [
  "Downloading the voter list",
  "Building your proof",
  "Submitting your ballot",
  "Confirmed",
] as const;

export const mockElection: Election = {
  address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  title: "Student Senate 2026",
  description: "Elect the student senate president for the coming year.",
  phase: "voting",
  candidates: [
    {
      id: 0,
      name: "Aarav Mehta",
      manifestoCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
    },
    {
      id: 1,
      name: "Diya Nair",
      manifestoCid: "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
    },
    {
      id: 2,
      name: "Kabir Rao",
      manifestoCid: "bafybeiemxf5abjwjbikoz4mc3a3dla6ual3jsgpdr4cjr3oz3evfyavhwq",
    },
  ],
  votingOpensAt: 1795000000,
  votingClosesAt: 1795086400,
};

export const mockReceipt: Receipt = {
  electionAddress: mockElection.address,
  transactionHash: "0x3f1c9a7e2b8d4c6f0a1e5b7d9c2f4a6e8b0d2c4f6a8e0b2d4c6f8a0e2b4d6c8f",
  explorerUrl:
    "https://sepolia.etherscan.io/tx/0x3f1c9a7e2b8d4c6f0a1e5b7d9c2f4a6e8b0d2c4f6a8e0b2d4c6f8a0e2b4d6c8f",
};

export const mockTally: Tally = [
  { candidateId: 0, votes: 42 },
  { candidateId: 1, votes: 57 },
  { candidateId: 2, votes: 31 },
];
