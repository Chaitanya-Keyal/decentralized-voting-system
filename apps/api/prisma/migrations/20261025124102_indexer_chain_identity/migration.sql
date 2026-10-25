-- AlterTable
ALTER TABLE "IndexerCursor" ADD COLUMN     "blockHash" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "genesisHash" TEXT NOT NULL DEFAULT '';
