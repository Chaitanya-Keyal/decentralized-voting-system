//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// ElectionFactory
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const electionFactoryAbi = [
  {
    type: "constructor",
    inputs: [{ name: "implementation_", internalType: "address", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "registrar", internalType: "address", type: "address" },
      { name: "title", internalType: "string", type: "string" },
      { name: "metadataCid", internalType: "string", type: "string" },
      {
        name: "schedule",
        internalType: "struct Election.Schedule",
        type: "tuple",
        components: [
          { name: "registrationStart", internalType: "uint64", type: "uint64" },
          { name: "registrationEnd", internalType: "uint64", type: "uint64" },
          { name: "votingStart", internalType: "uint64", type: "uint64" },
          { name: "votingEnd", internalType: "uint64", type: "uint64" },
        ],
      },
      {
        name: "candidates",
        internalType: "struct Election.Candidate[]",
        type: "tuple[]",
        components: [
          { name: "name", internalType: "string", type: "string" },
          { name: "manifestoCid", internalType: "string", type: "string" },
        ],
      },
    ],
    name: "createElection",
    outputs: [{ name: "election", internalType: "address", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "index", internalType: "uint256", type: "uint256" }],
    name: "electionAt",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "electionCount",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "elections",
    outputs: [{ name: "", internalType: "address[]", type: "address[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "implementation",
    outputs: [{ name: "", internalType: "address", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "election", internalType: "address", type: "address" }],
    name: "isElection",
    outputs: [{ name: "created", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "election", internalType: "address", type: "address", indexed: true },
      { name: "authority", internalType: "address", type: "address", indexed: true },
      { name: "registrar", internalType: "address", type: "address", indexed: true },
    ],
    name: "ElectionCreated",
  },
  { type: "error", inputs: [], name: "FailedDeployment" },
  {
    type: "error",
    inputs: [
      { name: "balance", internalType: "uint256", type: "uint256" },
      { name: "needed", internalType: "uint256", type: "uint256" },
    ],
    name: "InsufficientBalance",
  },
  { type: "error", inputs: [], name: "ZeroAddress" },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// MerkleElection
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const merkleElectionAbi = [
  {
    type: "function",
    inputs: [],
    name: "AUTHORITY_ROLE",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "DEFAULT_ADMIN_ROLE",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "MAX_CANDIDATES",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "REGISTRAR_ROLE",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "key", internalType: "bytes32", type: "bytes32" }],
    name: "ballotKeyUsed",
    outputs: [{ name: "used", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "ballotsCast",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  { type: "function", inputs: [], name: "cancel", outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    inputs: [],
    name: "candidateCount",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "candidates",
    outputs: [
      {
        name: "",
        internalType: "struct Election.Candidate[]",
        type: "tuple[]",
        components: [
          { name: "name", internalType: "string", type: "string" },
          { name: "manifestoCid", internalType: "string", type: "string" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "candidate", internalType: "uint256", type: "uint256" },
      { name: "proof", internalType: "bytes32[]", type: "bytes32[]" },
    ],
    name: "castVote",
    outputs: [],
    stateMutability: "nonpayable",
  },
  { type: "function", inputs: [], name: "closeVoting", outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    inputs: [
      { name: "title_", internalType: "string", type: "string" },
      { name: "metadataCid_", internalType: "string", type: "string" },
      {
        name: "schedule_",
        internalType: "struct Election.Schedule",
        type: "tuple",
        components: [
          { name: "registrationStart", internalType: "uint64", type: "uint64" },
          { name: "registrationEnd", internalType: "uint64", type: "uint64" },
          { name: "votingStart", internalType: "uint64", type: "uint64" },
          { name: "votingEnd", internalType: "uint64", type: "uint64" },
        ],
      },
    ],
    name: "configure",
    outputs: [],
    stateMutability: "nonpayable",
  },
  { type: "function", inputs: [], name: "finalize", outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    inputs: [{ name: "role", internalType: "bytes32", type: "bytes32" }],
    name: "getRoleAdmin",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "role", internalType: "bytes32", type: "bytes32" },
      { name: "account", internalType: "address", type: "address" },
    ],
    name: "grantRole",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "role", internalType: "bytes32", type: "bytes32" },
      { name: "account", internalType: "address", type: "address" },
    ],
    name: "hasRole",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "authority", internalType: "address", type: "address" },
      { name: "registrar", internalType: "address", type: "address" },
      { name: "title_", internalType: "string", type: "string" },
      { name: "metadataCid_", internalType: "string", type: "string" },
      {
        name: "schedule_",
        internalType: "struct Election.Schedule",
        type: "tuple",
        components: [
          { name: "registrationStart", internalType: "uint64", type: "uint64" },
          { name: "registrationEnd", internalType: "uint64", type: "uint64" },
          { name: "votingStart", internalType: "uint64", type: "uint64" },
          { name: "votingEnd", internalType: "uint64", type: "uint64" },
        ],
      },
      {
        name: "candidates_",
        internalType: "struct Election.Candidate[]",
        type: "tuple[]",
        components: [
          { name: "name", internalType: "string", type: "string" },
          { name: "manifestoCid", internalType: "string", type: "string" },
        ],
      },
    ],
    name: "initialize",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "isVoterListPublished",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "metadataCid",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "openRegistration",
    outputs: [],
    stateMutability: "nonpayable",
  },
  { type: "function", inputs: [], name: "openVoting", outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    inputs: [],
    name: "phase",
    outputs: [{ name: "", internalType: "enum Election.Phase", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      { name: "root", internalType: "bytes32", type: "bytes32" },
      { name: "count", internalType: "uint256", type: "uint256" },
      { name: "cid", internalType: "string", type: "string" },
    ],
    name: "publishVoterList",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "role", internalType: "bytes32", type: "bytes32" },
      { name: "callerConfirmation", internalType: "address", type: "address" },
    ],
    name: "renounceRole",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [
      { name: "role", internalType: "bytes32", type: "bytes32" },
      { name: "account", internalType: "address", type: "address" },
    ],
    name: "revokeRole",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [],
    name: "schedule",
    outputs: [
      { name: "registrationStart", internalType: "uint64", type: "uint64" },
      { name: "registrationEnd", internalType: "uint64", type: "uint64" },
      { name: "votingStart", internalType: "uint64", type: "uint64" },
      { name: "votingEnd", internalType: "uint64", type: "uint64" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [
      {
        name: "candidates_",
        internalType: "struct Election.Candidate[]",
        type: "tuple[]",
        components: [
          { name: "name", internalType: "string", type: "string" },
          { name: "manifestoCid", internalType: "string", type: "string" },
        ],
      },
    ],
    name: "setCandidates",
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    inputs: [{ name: "interfaceId", internalType: "bytes4", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ name: "", internalType: "bool", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "tally",
    outputs: [{ name: "", internalType: "uint256[]", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "title",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "voterCount",
    outputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [{ name: "voter", internalType: "address", type: "address" }],
    name: "voterLeaf",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "pure",
  },
  {
    type: "function",
    inputs: [],
    name: "voterListCid",
    outputs: [{ name: "", internalType: "string", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "voterRoot",
    outputs: [{ name: "", internalType: "bytes32", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    inputs: [],
    name: "winners",
    outputs: [{ name: "", internalType: "uint256[]", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [{ name: "count", internalType: "uint256", type: "uint256", indexed: false }],
    name: "CandidatesSet",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "title", internalType: "string", type: "string", indexed: false },
      { name: "metadataCid", internalType: "string", type: "string", indexed: false },
      {
        name: "schedule",
        internalType: "struct Election.Schedule",
        type: "tuple",
        components: [
          { name: "registrationStart", internalType: "uint64", type: "uint64" },
          { name: "registrationEnd", internalType: "uint64", type: "uint64" },
          { name: "votingStart", internalType: "uint64", type: "uint64" },
          { name: "votingEnd", internalType: "uint64", type: "uint64" },
        ],
        indexed: false,
      },
    ],
    name: "Configured",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "tally", internalType: "uint256[]", type: "uint256[]", indexed: false },
      { name: "winners", internalType: "uint256[]", type: "uint256[]", indexed: false },
    ],
    name: "Finalized",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [{ name: "version", internalType: "uint64", type: "uint64", indexed: false }],
    name: "Initialized",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "from", internalType: "enum Election.Phase", type: "uint8", indexed: true },
      { name: "to", internalType: "enum Election.Phase", type: "uint8", indexed: true },
    ],
    name: "PhaseChanged",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "role", internalType: "bytes32", type: "bytes32", indexed: true },
      { name: "previousAdminRole", internalType: "bytes32", type: "bytes32", indexed: true },
      { name: "newAdminRole", internalType: "bytes32", type: "bytes32", indexed: true },
    ],
    name: "RoleAdminChanged",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "role", internalType: "bytes32", type: "bytes32", indexed: true },
      { name: "account", internalType: "address", type: "address", indexed: true },
      { name: "sender", internalType: "address", type: "address", indexed: true },
    ],
    name: "RoleGranted",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "role", internalType: "bytes32", type: "bytes32", indexed: true },
      { name: "account", internalType: "address", type: "address", indexed: true },
      { name: "sender", internalType: "address", type: "address", indexed: true },
    ],
    name: "RoleRevoked",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "key", internalType: "bytes32", type: "bytes32", indexed: true },
      { name: "candidate", internalType: "uint256", type: "uint256", indexed: true },
    ],
    name: "VoteCast",
  },
  {
    type: "event",
    anonymous: false,
    inputs: [
      { name: "root", internalType: "bytes32", type: "bytes32", indexed: true },
      { name: "voterCount", internalType: "uint256", type: "uint256", indexed: false },
      { name: "voterListCid", internalType: "string", type: "string", indexed: false },
    ],
    name: "VoterRootPublished",
  },
  { type: "error", inputs: [], name: "AccessControlBadConfirmation" },
  {
    type: "error",
    inputs: [
      { name: "account", internalType: "address", type: "address" },
      { name: "neededRole", internalType: "bytes32", type: "bytes32" },
    ],
    name: "AccessControlUnauthorizedAccount",
  },
  {
    type: "error",
    inputs: [{ name: "key", internalType: "bytes32", type: "bytes32" }],
    name: "AlreadyVoted",
  },
  { type: "error", inputs: [], name: "BallotCapReached" },
  { type: "error", inputs: [], name: "InvalidCandidates" },
  { type: "error", inputs: [], name: "InvalidInitialization" },
  { type: "error", inputs: [], name: "InvalidSchedule" },
  { type: "error", inputs: [], name: "InvalidTitle" },
  { type: "error", inputs: [], name: "InvalidVoterList" },
  { type: "error", inputs: [], name: "NotEligible" },
  { type: "error", inputs: [], name: "NotInitializing" },
  {
    type: "error",
    inputs: [{ name: "allowedFrom", internalType: "uint64", type: "uint64" }],
    name: "TooEarly",
  },
  {
    type: "error",
    inputs: [{ name: "deadline", internalType: "uint64", type: "uint64" }],
    name: "TooLate",
  },
  {
    type: "error",
    inputs: [{ name: "candidate", internalType: "uint256", type: "uint256" }],
    name: "UnknownCandidate",
  },
  { type: "error", inputs: [], name: "VoterListAlreadyPublished" },
  { type: "error", inputs: [], name: "VoterListNotPublished" },
  { type: "error", inputs: [], name: "VotingClosed" },
  {
    type: "error",
    inputs: [{ name: "current", internalType: "enum Election.Phase", type: "uint8" }],
    name: "WrongPhase",
  },
  { type: "error", inputs: [], name: "ZeroAddress" },
] as const;

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Deployments
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const deployments = {
  "31337": {
    chainId: 31337,
    electionFactory: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    merkleElection: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    startBlock: 0,
  },
} as const;
