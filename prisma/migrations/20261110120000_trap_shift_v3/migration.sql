-- Trap Shift v3: 5 tries a day and daily save points.
--
-- Additive only. Live v1 code keeps working against this schema: it never
-- writes the new columns (defaults apply) and still caps itself at 3 tries.

-- Save points: where a try started (chosen by the server) and the furthest one
-- its replay reached. v1 rows keep startCp 0 and checkpointReached NULL.
ALTER TABLE "MiniGameRun" ADD COLUMN "startCp" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN "checkpointReached" SMALLINT;
ALTER TABLE "MiniGameRun" ADD CONSTRAINT "MiniGameRun_startCp_check" CHECK ("startCp" BETWEEN 0 AND 5);

-- 5 tries per VA per day. The UNIQUE (userId, gameKey, playedOn, attemptNo)
-- index is unchanged; with this CHECK no sixth row can exist.
ALTER TABLE "MiniGameRun" DROP CONSTRAINT "MiniGameRun_attemptNo_check";
ALTER TABLE "MiniGameRun" ADD CONSTRAINT "MiniGameRun_attemptNo_check" CHECK ("attemptNo" BETWEEN 1 AND 5);

-- One-time "new rules" banner, dismissed per VA.
ALTER TABLE "User" ADD COLUMN "trapShiftV3SeenAt" TIMESTAMP(3);
