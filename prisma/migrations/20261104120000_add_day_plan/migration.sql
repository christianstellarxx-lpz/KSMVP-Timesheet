-- Weekly planner: one row per VA per workday. It only prefills that day's
-- Start of Day; the VA still reviews and submits it.
--
-- Purely additive. TimeEntry's timeIn / timeOut / hoursWorked are retired in
-- the app but deliberately NOT dropped here, so past rows keep their data.

-- CreateTable
CREATE TABLE "DayPlan" (
    "id" TEXT NOT NULL,
    "vaId" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "startOfDayTasks" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DayPlan_vaId_workDate_key" ON "DayPlan"("vaId", "workDate");

-- AddForeignKey
ALTER TABLE "DayPlan" ADD CONSTRAINT "DayPlan_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
