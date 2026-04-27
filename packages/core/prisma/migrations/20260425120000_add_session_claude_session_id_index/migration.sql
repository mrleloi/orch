-- AddIndex
-- Enables efficient hook session lookup by claudeSessionId (Claude Code UUID).
-- The hook payload session_id is the Claude Code UUID stored in claudeSessionId,
-- NOT the Orch internal cuid stored in id. This index makes findFirst fast.
-- NOT unique: re-spawn edge case means the same UUID can appear on two rows.
CREATE INDEX "Session_claudeSessionId_idx" ON "Session"("claudeSessionId");
