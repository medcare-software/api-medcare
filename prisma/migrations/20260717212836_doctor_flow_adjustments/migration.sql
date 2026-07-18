-- CreateEnum
CREATE TYPE "MedicationSource" AS ENUM ('MANUAL', 'DOCTOR');

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "observationsEncrypted" BYTEA,
ADD COLUMN     "requestingDoctorName" TEXT;

-- AlterTable
ALTER TABLE "medications" ADD COLUMN     "diagnosticId" TEXT,
ADD COLUMN     "doctorId" TEXT,
ADD COLUMN     "source" "MedicationSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourcePrescriptionItemId" TEXT;

-- AlterTable
ALTER TABLE "prescription_items" ADD COLUMN     "continuousUse" BOOLEAN,
ADD COLUMN     "dosageUnit" TEXT,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "form" "MedicationForm",
ADD COLUMN     "scheduleTimes" TEXT[],
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "weekDays" TEXT[];

-- AlterTable
ALTER TABLE "procedures" ADD COLUMN     "statusChangeReasonEncrypted" BYTEA;

-- AlterTable
ALTER TABLE "vaccine_doses" ALTER COLUMN "batchNumber" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "medications_sourcePrescriptionItemId_key" ON "medications"("sourcePrescriptionItemId");

-- CreateIndex
CREATE INDEX "medications_doctorId_idx" ON "medications"("doctorId");

-- CreateIndex
CREATE INDEX "medications_diagnosticId_idx" ON "medications"("diagnosticId");

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_diagnosticId_fkey" FOREIGN KEY ("diagnosticId") REFERENCES "diagnostics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medications" ADD CONSTRAINT "medications_sourcePrescriptionItemId_fkey" FOREIGN KEY ("sourcePrescriptionItemId") REFERENCES "prescription_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

