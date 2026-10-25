-- CreateTable
CREATE TABLE "EmailCode" (
    "id" SERIAL NOT NULL,
    "election" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" SERIAL NOT NULL,
    "election" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "voter" TEXT NOT NULL,
    "voterSignature" TEXT NOT NULL,
    "receiptSignature" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoterListPublication" (
    "election" TEXT NOT NULL,
    "root" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "cid" TEXT NOT NULL DEFAULT '',
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoterListPublication_pkey" PRIMARY KEY ("election")
);

-- CreateIndex
CREATE INDEX "EmailCode_election_email_idx" ON "EmailCode"("election", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_election_email_key" ON "Registration"("election", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_election_voter_key" ON "Registration"("election", "voter");
