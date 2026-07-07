-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'GENERAL',
    "body" TEXT NOT NULL,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "TimeEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Comment_entryId_idx" ON "Comment"("entryId");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");
