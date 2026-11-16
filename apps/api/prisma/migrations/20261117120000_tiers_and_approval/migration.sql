-- Elections record their tier and counting rule; a ballot keeps its choice as cast, which under
-- approval voting is a bitmask of candidates that can exceed a 64-bit integer.
ALTER TABLE "Election" ADD COLUMN "tier" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Election" ADD COLUMN "countingRule" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Ballot" RENAME COLUMN "candidate" TO "choice";
ALTER TABLE "Ballot" ALTER COLUMN "choice" SET DATA TYPE TEXT USING "choice"::TEXT;
