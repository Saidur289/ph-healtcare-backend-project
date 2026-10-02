-- AlterTable
ALTER TABLE "reviews" ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hiddenReason" VARCHAR(300),
ADD COLUMN "hiddenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "reviews_doctorId_isHidden_idx" ON "reviews"("doctorId", "isHidden");
