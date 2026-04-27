-- AddColumn: HandoffContext.status
-- Stores lifecycle state for the handoff queue dispatcher (CRITICAL-2/3 fix).
-- Default READY_FOR_AUTO_SPAWN keeps existing rows compatible.
ALTER TABLE "HandoffContext" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'READY_FOR_AUTO_SPAWN';

-- AddColumn: HandoffContext.seedPrompt
-- Stores the rendered RenderedPrompt.text in a dedicated column so contextJson
-- (the structured HandoffContext blob) is never overwritten after creation (CRITICAL-2 fix).
-- Default '' keeps existing rows compatible; new rows always set a real value.
ALTER TABLE "HandoffContext" ADD COLUMN "seedPrompt" TEXT NOT NULL DEFAULT '';

-- CreateIndex: HandoffContext.status
-- Enables the queue dispatcher to efficiently find READY_FOR_AUTO_SPAWN rows.
CREATE INDEX "HandoffContext_status_idx" ON "HandoffContext"("status");
