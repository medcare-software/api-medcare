-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "doctorId" TEXT;

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "deviceLabel" TEXT;

-- CreateIndex
CREATE INDEX "exams_doctorId_idx" ON "exams"("doctorId");

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
