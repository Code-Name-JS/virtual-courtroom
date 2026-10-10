-- CreateTable
CREATE TABLE "advocate_recommendation" (
    "id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "side" "Side" NOT NULL,
    "participation_id" TEXT,
    "rationale" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "request" TEXT,
    "response" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advocate_recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "advocate_recommendation_round_side_key" ON "advocate_recommendation"("round", "side");

-- AddForeignKey
ALTER TABLE "advocate_recommendation" ADD CONSTRAINT "advocate_recommendation_participation_id_fkey" FOREIGN KEY ("participation_id") REFERENCES "participation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

