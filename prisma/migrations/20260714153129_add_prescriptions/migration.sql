-- CreateEnum
CREATE TYPE "PrescriptionValidity" AS ENUM ('DAYS_30', 'DAYS_60', 'DAYS_90', 'CONTINUOUS_USE');

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "doctorId" TEXT,
    "linkedDiagnosticId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "validity" "PrescriptionValidity" NOT NULL,
    "generalInstructionsEncrypted" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_items" (
    "id" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "posology" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "instructionsEncrypted" BYTEA,
    "stripeColor" "MedicationStripeColor" NOT NULL DEFAULT 'NONE',

    CONSTRAINT "prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prescriptions_memberId_idx" ON "prescriptions"("memberId");

-- CreateIndex
CREATE INDEX "prescriptions_doctorId_idx" ON "prescriptions"("doctorId");

-- CreateIndex
CREATE INDEX "prescription_items_prescriptionId_idx" ON "prescription_items"("prescriptionId");

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "family_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_linkedDiagnosticId_fkey" FOREIGN KEY ("linkedDiagnosticId") REFERENCES "diagnostics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_items" ADD CONSTRAINT "prescription_items_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
