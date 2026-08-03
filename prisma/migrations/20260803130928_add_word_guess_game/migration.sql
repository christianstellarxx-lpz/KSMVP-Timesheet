-- CreateTable
CREATE TABLE "WordPuzzle" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "answer" TEXT NOT NULL,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WordPuzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordEntry" (
    "id" TEXT NOT NULL,
    "vaId" TEXT NOT NULL,
    "puzzleId" TEXT NOT NULL,
    "guesses" JSONB NOT NULL DEFAULT '[]',
    "guessPatterns" JSONB NOT NULL DEFAULT '[]',
    "solved" BOOLEAN NOT NULL DEFAULT false,
    "guessCount" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WordPuzzle_date_key" ON "WordPuzzle"("date");

-- CreateIndex
CREATE INDEX "WordPuzzle_organizationId_idx" ON "WordPuzzle"("organizationId");

-- CreateIndex
CREATE INDEX "WordEntry_vaId_idx" ON "WordEntry"("vaId");

-- CreateIndex
CREATE INDEX "WordEntry_puzzleId_idx" ON "WordEntry"("puzzleId");

-- CreateIndex
CREATE INDEX "WordEntry_organizationId_idx" ON "WordEntry"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WordEntry_vaId_puzzleId_key" ON "WordEntry"("vaId", "puzzleId");

-- AddForeignKey
ALTER TABLE "WordEntry" ADD CONSTRAINT "WordEntry_vaId_fkey" FOREIGN KEY ("vaId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordEntry" ADD CONSTRAINT "WordEntry_puzzleId_fkey" FOREIGN KEY ("puzzleId") REFERENCES "WordPuzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
