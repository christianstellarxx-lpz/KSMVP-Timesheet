-- Stretch Goal (monthly rotating game #3), September 2026.
--
-- Purely additive. Nothing is dropped: WordPuzzle and WordEntry keep every
-- Daily Word Guess row so August still resolves on the wall of fame, and no
-- GameScore row is deleted or re-pointed.
--
-- Backfill note: GameScore.gameKey is backfilled 'flappy', not 'wordle'. This
-- table has only ever held Daily Flappy scores — the Word game never wrote a
-- score row at all (its points are computed at read time from WordEntry). The
-- explicit UPDATE below is redundant with the column DEFAULT, which Postgres
-- already applies to existing rows; it is here so the backfill is visible.

-- AlterTable
ALTER TABLE "GameScore" ADD COLUMN     "gameKey" TEXT NOT NULL DEFAULT 'flappy';

-- Backfill: every pre-existing score row is Daily Flappy.
UPDATE "GameScore" SET "gameKey" = 'flappy' WHERE "gameKey" IS NULL OR "gameKey" = '';

-- CreateTable
CREATE TABLE "MiniGameRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameKey" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "playedOn" TIMESTAMP(3) NOT NULL,
    "seed" INTEGER NOT NULL,
    "holds" JSONB NOT NULL DEFAULT '[]',
    "score" INTEGER NOT NULL DEFAULT 0,
    "perfects" INTEGER NOT NULL DEFAULT 0,
    "tier" INTEGER NOT NULL DEFAULT 0,
    "replayVersion" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "submittedAt" TIMESTAMP(3),
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiniGameRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MiniGameRun_gameKey_season_idx" ON "MiniGameRun"("gameKey", "season");

-- CreateIndex
CREATE INDEX "MiniGameRun_userId_idx" ON "MiniGameRun"("userId");

-- CreateIndex
CREATE INDEX "MiniGameRun_organizationId_idx" ON "MiniGameRun"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MiniGameRun_userId_gameKey_playedOn_key" ON "MiniGameRun"("userId", "gameKey", "playedOn");

-- CreateIndex
CREATE INDEX "GameScore_gameKey_idx" ON "GameScore"("gameKey");

-- AddForeignKey
ALTER TABLE "MiniGameRun" ADD CONSTRAINT "MiniGameRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

