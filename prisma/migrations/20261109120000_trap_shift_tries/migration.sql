-- Trap Shift (rotating game #4), November 2026: one MiniGameRun row per TRY.
--
-- Nothing is dropped except the old unique index, which is replaced by a wider
-- one. Every Stretch Goal row stays queryable so September still resolves on the
-- wall of fame. Existing rows get attemptNo = 1 from the column DEFAULT, which
-- Postgres applies to every pre-existing row — that is the backfill.

-- AlterTable
ALTER TABLE "MiniGameRun" ADD COLUMN     "attemptNo" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "cause" TEXT,
ADD COLUMN     "cleared" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ended" TEXT,
ADD COLUMN     "flagReason" TEXT,
ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "frames" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "levelReached" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "routes" JSONB;

-- One row per (VA, game, day, try). One-run games only ever write attemptNo 1,
-- so for them this is exactly the old one-row-a-day rule.
CREATE UNIQUE INDEX "MiniGameRun_userId_gameKey_playedOn_attemptNo_key" ON "MiniGameRun"("userId", "gameKey", "playedOn", "attemptNo");
DROP INDEX "MiniGameRun_userId_gameKey_playedOn_key";

-- With the unique index above, no VA can ever hold a 4th try for a day, even
-- with parallel requests or a bug in the application code. Prisma does not
-- model CHECK constraints; it lives here.
ALTER TABLE "MiniGameRun" ADD CONSTRAINT "MiniGameRun_attemptNo_check" CHECK ("attemptNo" BETWEEN 1 AND 3);
