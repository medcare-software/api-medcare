-- CreateEnum
CREATE TYPE "ClinicInstitutionType" AS ENUM ('CLINICA', 'CONSULTORIO', 'HOSPITAL', 'LABORATORIO');

-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "institutionType" "ClinicInstitutionType" NOT NULL DEFAULT 'CLINICA';
