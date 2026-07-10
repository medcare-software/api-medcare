-- AlterTable
ALTER TABLE "medications" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "medications_idempotencyKey_key" ON "medications"("idempotencyKey");
