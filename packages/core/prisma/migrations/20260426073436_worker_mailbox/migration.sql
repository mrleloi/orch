-- CreateTable
CREATE TABLE "WorkerMailbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toWorker" TEXT NOT NULL,
    "fromWorker" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "WorkerMailbox_toWorker_read_createdAt_idx" ON "WorkerMailbox"("toWorker", "read", "createdAt");
