-- CreateTable
CREATE TABLE "OperatorActionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "confirmed" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traceId" TEXT
);

-- CreateIndex
CREATE INDEX "OperatorActionLog_action_createdAt_idx" ON "OperatorActionLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "OperatorActionLog_actor_idx" ON "OperatorActionLog"("actor");
