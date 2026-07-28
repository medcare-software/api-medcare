-- AlterTable
ALTER TABLE "users" ADD COLUMN "professionalCommitmentAcceptedAt" TIMESTAMP(3),
ADD COLUMN "professionalSecurityPolicyAcceptedAt" TIMESTAMP(3),
ADD COLUMN "professionalTermsVersion" TEXT;
