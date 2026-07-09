-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN "publishAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TimeEntry_publishAt_idx" ON "TimeEntry"("publishAt");
