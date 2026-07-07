-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT,
    CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vaId" TEXT NOT NULL,
    "workDate" DATETIME NOT NULL,
    "timeIn" DATETIME,
    "timeOut" DATETIME,
    "hoursWorked" REAL,
    "startOfDayTasks" TEXT NOT NULL,
    "urgentNeed" TEXT,
    "endOfDayTasks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeEntry_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "TimeEntry_vaId_workDate_idx" ON "TimeEntry"("vaId", "workDate");

-- CreateIndex
CREATE INDEX "TimeEntry_status_idx" ON "TimeEntry"("status");

-- CreateIndex
CREATE INDEX "TimeEntry_vaId_status_idx" ON "TimeEntry"("vaId", "status");
