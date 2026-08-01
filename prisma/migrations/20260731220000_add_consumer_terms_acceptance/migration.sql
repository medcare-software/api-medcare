-- AlterTable
ALTER TABLE "users" ADD COLUMN "termsOfUseAcceptedAt" TIMESTAMP(3),
ADD COLUMN "privacyPolicyAcceptedAt" TIMESTAMP(3),
ADD COLUMN "lgpdConsentAcceptedAt" TIMESTAMP(3),
ADD COLUMN "consumerTermsVersion" TEXT;
