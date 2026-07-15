-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "devicesPerDoctor" INTEGER,
ADD COLUMN     "extraMemberFee" DECIMAL(10,2),
ADD COLUMN     "includedDoctors" INTEGER;
