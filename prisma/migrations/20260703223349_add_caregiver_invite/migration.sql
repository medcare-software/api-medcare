-- CreateTable
CREATE TABLE "caregiver_invites" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" "AccessStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caregiver_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caregiver_invites_codeHash_key" ON "caregiver_invites"("codeHash");

-- CreateIndex
CREATE INDEX "caregiver_invites_familyId_idx" ON "caregiver_invites"("familyId");

-- AddForeignKey
ALTER TABLE "caregiver_invites" ADD CONSTRAINT "caregiver_invites_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
