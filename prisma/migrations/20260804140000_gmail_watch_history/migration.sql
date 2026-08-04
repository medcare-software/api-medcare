-- AlterTable
ALTER TABLE "gmail_integrations" ADD COLUMN "historyId" TEXT;
ALTER TABLE "gmail_integrations" ADD COLUMN "watchExpiration" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "gmail_integrations_googleEmail_idx" ON "gmail_integrations"("googleEmail");
