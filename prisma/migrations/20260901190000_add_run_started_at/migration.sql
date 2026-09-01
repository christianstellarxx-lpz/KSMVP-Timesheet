-- One try a day, not one submission a day.
--
-- The attempt is now spent the moment the player presses Start (status
-- "started"), not when a score is submitted. Without this, reloading mid-run
-- returned the same seed and let a player rehearse the identical layout as many
-- times as they liked, submitting only their best attempt.
--
-- Purely additive; existing rows keep a NULL startedAt.

-- AlterTable
ALTER TABLE "MiniGameRun" ADD COLUMN     "startedAt" TIMESTAMP(3);
