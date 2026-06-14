CREATE TABLE IF NOT EXISTS "FeedbackReport" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "userEmail" TEXT,
  "pageUrl" TEXT NOT NULL,
  "userAgent" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "details" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'ORTA',
  "screenshotUrl" TEXT,
  "errorContext" TEXT,
  "status" TEXT NOT NULL DEFAULT 'open',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FeedbackReport_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FeedbackReport"
  ADD CONSTRAINT "FeedbackReport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "FeedbackReport_status_createdAt_idx" ON "FeedbackReport"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "FeedbackReport_priority_createdAt_idx" ON "FeedbackReport"("priority", "createdAt");
CREATE INDEX IF NOT EXISTS "FeedbackReport_userId_createdAt_idx" ON "FeedbackReport"("userId", "createdAt");
