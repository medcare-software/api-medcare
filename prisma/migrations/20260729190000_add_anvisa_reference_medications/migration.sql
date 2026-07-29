-- CreateEnum
CREATE TYPE "AnvisaListType" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "AnvisaMedicationStatus" AS ENUM ('ACTIVE', 'EXCLUDED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AnvisaImportOperation" AS ENUM ('ADDITION', 'REMOVAL');

-- CreateEnum
CREATE TYPE "AnvisaImportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "anvisa_list_imports" (
    "id" TEXT NOT NULL,
    "listType" "AnvisaListType" NOT NULL,
    "operation" "AnvisaImportOperation" NOT NULL,
    "fileId" TEXT NOT NULL,
    "sourceFilename" TEXT NOT NULL,
    "parsedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "deactivatedCount" INTEGER NOT NULL DEFAULT 0,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "AnvisaImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "errorMessage" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "anvisa_list_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anvisa_reference_medications" (
    "id" TEXT NOT NULL,
    "listType" "AnvisaListType" NOT NULL,
    "substance" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "concentration" TEXT NOT NULL,
    "pharmaceuticalForm" TEXT NOT NULL,
    "includedAt" TIMESTAMP(3),
    "excludedAt" TIMESTAMP(3),
    "exclusionReason" TEXT,
    "status" "AnvisaMedicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastImportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anvisa_reference_medications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anvisa_list_imports_listType_createdAt_idx" ON "anvisa_list_imports"("listType", "createdAt");

-- CreateIndex
CREATE INDEX "anvisa_reference_medications_listType_status_idx" ON "anvisa_reference_medications"("listType", "status");

-- CreateIndex
CREATE INDEX "anvisa_reference_medications_substance_idx" ON "anvisa_reference_medications"("substance");

-- CreateIndex
CREATE INDEX "anvisa_reference_medications_medicationName_idx" ON "anvisa_reference_medications"("medicationName");

-- CreateIndex
CREATE INDEX "anvisa_reference_medications_registrationNumber_idx" ON "anvisa_reference_medications"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "anvisa_reference_medications_listType_registrationNumber_concentration_pharmaceuticalForm_key" ON "anvisa_reference_medications"("listType", "registrationNumber", "concentration", "pharmaceuticalForm");

-- AddForeignKey
ALTER TABLE "anvisa_reference_medications" ADD CONSTRAINT "anvisa_reference_medications_lastImportId_fkey" FOREIGN KEY ("lastImportId") REFERENCES "anvisa_list_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
