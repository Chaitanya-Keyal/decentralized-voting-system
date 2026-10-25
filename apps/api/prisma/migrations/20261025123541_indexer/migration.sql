-- CreateTable
CREATE TABLE "Election" (
    "address" TEXT NOT NULL,
    "authority" TEXT NOT NULL,
    "registrar" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "metadataCid" TEXT NOT NULL DEFAULT '',
    "registrationStart" BIGINT NOT NULL DEFAULT 0,
    "registrationEnd" BIGINT NOT NULL DEFAULT 0,
    "votingStart" BIGINT NOT NULL DEFAULT 0,
    "votingEnd" BIGINT NOT NULL DEFAULT 0,
    "phase" INTEGER NOT NULL DEFAULT 0,
    "voterRoot" TEXT,
    "voterCount" INTEGER,
    "voterListCid" TEXT,
    "finalTally" INTEGER[],
    "winners" INTEGER[],
    "createdAtBlock" BIGINT NOT NULL,
    "createdTxHash" TEXT NOT NULL,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "electionAddress" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "manifestoCid" TEXT NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("electionAddress","index")
);

-- CreateTable
CREATE TABLE "Ballot" (
    "id" SERIAL NOT NULL,
    "electionAddress" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "candidate" INTEGER NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "Ballot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndexerCursor" (
    "chainId" INTEGER NOT NULL,
    "block" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerCursor_pkey" PRIMARY KEY ("chainId")
);

-- CreateIndex
CREATE INDEX "Ballot_electionAddress_idx" ON "Ballot"("electionAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Ballot_txHash_logIndex_key" ON "Ballot"("txHash", "logIndex");

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_electionAddress_fkey" FOREIGN KEY ("electionAddress") REFERENCES "Election"("address") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ballot" ADD CONSTRAINT "Ballot_electionAddress_fkey" FOREIGN KEY ("electionAddress") REFERENCES "Election"("address") ON DELETE CASCADE ON UPDATE CASCADE;
