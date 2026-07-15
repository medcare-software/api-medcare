-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('LABORATORIAL', 'IMAGEM', 'OUTROS');

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "clinicName" TEXT,
ADD COLUMN     "examType" "ExamType" NOT NULL DEFAULT 'OUTROS';

-- AlterTable
ALTER TABLE "vaccines" ADD COLUMN     "doctorId" TEXT;

-- CreateIndex
CREATE INDEX "vaccines_doctorId_idx" ON "vaccines"("doctorId");

-- AddForeignKey
ALTER TABLE "vaccines" ADD CONSTRAINT "vaccines_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
