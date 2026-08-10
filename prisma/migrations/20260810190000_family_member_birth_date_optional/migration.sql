-- Cadastro parcial: FamilyMember pode nascer sem data de nascimento.
ALTER TABLE "family_members" ALTER COLUMN "birthDate" DROP NOT NULL;
