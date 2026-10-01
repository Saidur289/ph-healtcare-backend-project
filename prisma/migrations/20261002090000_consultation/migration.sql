-- AlterTable
ALTER TABLE "doctor" ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "prescriptions" ADD COLUMN     "emailSentAt" TIMESTAMP(3),
ADD COLUMN     "medicines" JSONB NOT NULL DEFAULT '[]';

