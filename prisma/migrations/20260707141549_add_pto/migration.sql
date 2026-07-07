-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vaId" TEXT NOT NULL,
    "workDate" DATETIME NOT NULL,
    "timeIn" DATETIME,
    "timeOut" DATETIME,
    "hoursWorked" REAL,
    "startOfDayTasks" TEXT NOT NULL,
    "urgentNeed" TEXT,
    "endOfDayTasks" TEXT,
    "entryType" TEXT NOT NULL DEFAULT 'WORK',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeEntry_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimeEntry" ("createdAt", "endOfDayTasks", "hoursWorked", "id", "startOfDayTasks", "status", "timeIn", "timeOut", "updatedAt", "urgentNeed", "vaId", "workDate") SELECT "createdAt", "endOfDayTasks", "hoursWorked", "id", "startOfDayTasks", "status", "timeIn", "timeOut", "updatedAt", "urgentNeed", "vaId", "workDate" FROM "TimeEntry";
DROP TABLE "TimeEntry";
ALTER TABLE "new_TimeEntry" RENAME TO "TimeEntry";
CREATE INDEX "TimeEntry_vaId_workDate_idx" ON "TimeEntry"("vaId", "workDate");
CREATE INDEX "TimeEntry_status_idx" ON "TimeEntry"("status");
CREATE INDEX "TimeEntry_vaId_status_idx" ON "TimeEntry"("vaId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
