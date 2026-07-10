-- CreateEnum
CREATE TYPE "GmailIntegrationStatus" AS ENUM ('CONNECTED', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "gmail_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "accessTokenEncrypted" BYTEA,
    "refreshTokenEncrypted" BYTEA,
    "tokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT NOT NULL,
    "status" "GmailIntegrationStatus" NOT NULL DEFAULT 'CONNECTED',
    "autoImportEnabled" BOOLEAN NOT NULL DEFAULT true,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gmail_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gmail_integrations_userId_key" ON "gmail_integrations"("userId");

-- AddForeignKey
ALTER TABLE "gmail_integrations" ADD CONSTRAINT "gmail_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
