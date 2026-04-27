-- AddUniqueConstraint
-- Enforces I-8: prevents double-enqueue of the same plan file for the same project.
-- dedupKey is computed as sha256(absolutePath + ':' + mtime) by the file-watcher.
-- Scoped per project: the same file in two different projects can coexist.
CREATE UNIQUE INDEX "QueueItem_projectId_dedupKey_key" ON "QueueItem"("projectId", "dedupKey");
