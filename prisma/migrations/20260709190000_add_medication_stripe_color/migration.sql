-- CreateEnum
CREATE TYPE "MedicationStripeColor" AS ENUM ('BLACK', 'RED', 'ORANGE', 'NONE');

-- AlterTable
ALTER TABLE "medications" ADD COLUMN "stripeColor" "MedicationStripeColor" NOT NULL DEFAULT 'NONE';
