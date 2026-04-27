-- Task 4.1: SessionManager Schema Extension (#10 carryforward)
-- Adds commit_sha and session_log_path to HandoffContext for real value capture.
--
-- Migration is additive (nullable columns — SQLite compatible down-step: DROP COLUMN).
-- Down-step: DROP COLUMN "commit_sha"; DROP COLUMN "session_log_path";
-- (SQLite 3.35+ supports DROP COLUMN; reversible for dev resets via prisma migrate reset)

-- AddColumn: HandoffContext.commit_sha
-- Stores the 40-char hex git commit SHA captured via `git rev-parse HEAD` at session end.
-- Nullable: existing rows remain compatible; new rows set a real value after Task 4.1.
ALTER TABLE "HandoffContext" ADD COLUMN "commit_sha" TEXT;

-- AddColumn: HandoffContext.session_log_path
-- Stores the absolute path to the session log file (YYYY-MM-DD-session-N.md).
-- Nullable: existing rows remain compatible; new rows set a real value after Task 4.1.
ALTER TABLE "HandoffContext" ADD COLUMN "session_log_path" TEXT;
