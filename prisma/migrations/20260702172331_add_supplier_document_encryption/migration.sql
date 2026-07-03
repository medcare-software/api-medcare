-- AlterTable
ALTER TABLE "suppliers" DROP COLUMN "document",
ADD COLUMN     "documentEncrypted" BYTEA NOT NULL,
ADD COLUMN     "documentHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_documentHash_key" ON "suppliers"("documentHash");

