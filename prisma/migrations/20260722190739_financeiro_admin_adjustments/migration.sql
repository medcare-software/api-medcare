-- AlterEnum
ALTER TYPE "AccountPayableStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMethod_new" AS ENUM ('PIX', 'BOLETO');
ALTER TABLE "subscriptions" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod_new" USING ("paymentMethod"::text::"PaymentMethod_new");
ALTER TABLE "payments" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod_new" USING ("paymentMethod"::text::"PaymentMethod_new");
ALTER TABLE "accounts_payable" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod_new" USING ("paymentMethod"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "public"."PaymentMethod_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SupplierCategory" ADD VALUE 'EQUIPMENT';
ALTER TYPE "SupplierCategory" ADD VALUE 'SOFTWARE';
ALTER TYPE "SupplierCategory" ADD VALUE 'RENT';
ALTER TYPE "SupplierCategory" ADD VALUE 'UTILITIES';

-- AlterTable
ALTER TABLE "accounts_payable" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "cancelReason" TEXT;

