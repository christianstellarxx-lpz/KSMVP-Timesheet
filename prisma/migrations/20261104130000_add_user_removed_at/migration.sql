-- Removing a team member is a soft remove: removedAt is set and the row stays,
-- so their reports and the feedback they wrote are kept and they can be
-- restored. Purely additive; every existing member stays active (NULL).

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "removedAt" TIMESTAMP(3);
