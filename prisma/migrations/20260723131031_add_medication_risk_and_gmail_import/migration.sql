-- CreateEnum
CREATE TYPE "GmailImportStatus" AS ENUM ('PENDING', 'AUTO_LINKED', 'IGNORED');

-- AlterTable
ALTER TABLE "medications" ADD COLUMN     "riskAcknowledgedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "gmail_imported_exams" (
    "id" TEXT NOT NULL,
    "gmailIntegrationId" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "suggestedMemberId" TEXT,
    "fileId" TEXT,
    "extractedSummary" JSONB NOT NULL,
    "status" "GmailImportStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedExamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "gmail_imported_exams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gmail_imported_exams_status_idx" ON "gmail_imported_exams"("status");

-- CreateIndex
CREATE UNIQUE INDEX "gmail_imported_exams_gmailIntegrationId_gmailMessageId_key" ON "gmail_imported_exams"("gmailIntegrationId", "gmailMessageId");

-- AddForeignKey
ALTER TABLE "gmail_imported_exams" ADD CONSTRAINT "gmail_imported_exams_gmailIntegrationId_fkey" FOREIGN KEY ("gmailIntegrationId") REFERENCES "gmail_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
