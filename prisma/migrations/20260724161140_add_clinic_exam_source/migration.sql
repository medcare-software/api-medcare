-- AlterEnum
ALTER TYPE "ExamSource" ADD VALUE 'CLINIC';

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "clinicId" TEXT;

-- CreateIndex
CREATE INDEX "exams_clinicId_idx" ON "exams"("clinicId");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;
