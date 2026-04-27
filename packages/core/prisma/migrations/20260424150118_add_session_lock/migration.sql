-- CreateTable
CREATE TABLE "SessionLock" (
    "sessionKey" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "SessionLock_expiresAt_idx" ON "SessionLock"("expiresAt");
