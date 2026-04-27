-- AlterTable
ALTER TABLE "QueueItem" ADD COLUMN "claimExpiresAt" DATETIME;
ALTER TABLE "QueueItem" ADD COLUMN "claimedBy" TEXT;

-- CreateIndex
CREATE INDEX "QueueItem_claimedBy_claimExpiresAt_idx" ON "QueueItem"("claimedBy", "claimExpiresAt");
