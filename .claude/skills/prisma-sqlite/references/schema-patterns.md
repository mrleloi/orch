# Schema Patterns

Full Prisma schema sample (Project, QueueItem, Session, HookEvent, Decision).

## Schema Location

`packages/core/prisma/schema.prisma`.

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native"]
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL") // e.g., file:/home/user/.orch/data/orch.db
}

model Project {
  id                    String   @id @default(cuid())
  name                  String   @unique
  path                  String
  profileSnapshot       Json     @map("profile_snapshot")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  queueItems            QueueItem[]
  sessions              Session[]

  @@map("project")
}

model QueueItem {
  id                String    @id @default(cuid())
  projectId         String    @map("project_id")
  planId            String    @map("plan_id")
  planPath          String?   @map("plan_path")
  sessionType       String    @map("session_type")
  priority          Int       @default(0)
  status            String
  retryCount        Int       @default(0) @map("retry_count")
  enqueuedAt        DateTime  @default(now()) @map("enqueued_at")
  startedAt         DateTime? @map("started_at")
  endedAt           DateTime? @map("ended_at")
  sessionId         String?   @map("session_id")
  lastError         String?   @map("last_error")

  project           Project   @relation(fields: [projectId], references: [id])
  session           Session?  @relation(fields: [sessionId], references: [id])

  @@unique([projectId, planId], name: "project_plan_idempotency")
  @@index([projectId, status])
  @@index([status, priority, enqueuedAt])
  @@map("queue_item")
}

model Session {
  id                 String    @id @default(cuid())
  queueItemId        String?   @map("queue_item_id")
  projectId          String    @map("project_id")
  claudeSessionId    String?   @unique @map("claude_session_id")
  ccsProfile         String    @map("ccs_profile")
  state              String
  pid                Int?
  startedAt          DateTime  @default(now()) @map("started_at")
  endedAt            DateTime? @map("ended_at")
  endReason          String?   @map("end_reason")
  tokensUsed         Int?      @map("tokens_used")
  profileSnapshot    Json      @map("profile_snapshot")
  traceId            String?   @map("trace_id")

  project            Project   @relation(fields: [projectId], references: [id])
  queueItem          QueueItem?
  hookEvents         HookEvent[]

  @@index([projectId, startedAt])
  @@index([state])
  @@index([claudeSessionId])
  @@map("session")
}

model HookEvent {
  id          String   @id @default(cuid())
  sessionId   String   @map("session_id")
  hookType    String   @map("hook_type")
  payload     Json
  dedupKey    String   @unique @map("dedup_key")
  receivedAt  DateTime @default(now()) @map("received_at")

  session     Session  @relation(fields: [sessionId], references: [id])

  @@index([sessionId, receivedAt])
  @@index([hookType])
  @@map("hook_event")
}

model Decision {
  id         String   @id @default(cuid())
  projectId  String?  @map("project_id")
  sessionId  String?  @map("session_id")
  context    String
  choice     String
  rationale  String
  createdAt  DateTime @default(now()) @map("created_at")

  @@index([projectId, createdAt])
  @@map("decision")
}
```
