-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rootPath" TEXT NOT NULL,
    "profileJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Idle',
    "model" TEXT,
    "claudeSessionId" TEXT,
    "tokensUsed" INTEGER,
    "endReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    CONSTRAINT "Session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dedupKey" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "sessionId" TEXT,
    CONSTRAINT "QueueItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QueueItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" TEXT NOT NULL,
    "dedupKey" TEXT NOT NULL,
    CONSTRAINT "HookEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HandoffContext" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromSessionId" TEXT NOT NULL,
    "toSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contextJson" TEXT NOT NULL,
    CONSTRAINT "HandoffContext_fromSessionId_fkey" FOREIGN KEY ("fromSessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HandoffContext_toSessionId_fkey" FOREIGN KEY ("toSessionId") REFERENCES "Session" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_rootPath_key" ON "Project"("rootPath");

-- CreateIndex
CREATE INDEX "Session_projectId_state_idx" ON "Session"("projectId", "state");

-- CreateIndex
CREATE INDEX "QueueItem_projectId_state_priority_createdAt_idx" ON "QueueItem"("projectId", "state", "priority", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HookEvent_dedupKey_key" ON "HookEvent"("dedupKey");

-- CreateIndex
CREATE INDEX "HookEvent_sessionId_receivedAt_idx" ON "HookEvent"("sessionId", "receivedAt");

-- CreateIndex
CREATE INDEX "HandoffContext_fromSessionId_idx" ON "HandoffContext"("fromSessionId");
