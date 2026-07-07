-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT,
    CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("clientId", "createdAt", "email", "id", "name", "passwordHash", "role") SELECT "clientId", "createdAt", "email", "id", "name", "passwordHash", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_clientId_idx" ON "User"("clientId");
CREATE INDEX "User_role_idx" ON "User"("role");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
