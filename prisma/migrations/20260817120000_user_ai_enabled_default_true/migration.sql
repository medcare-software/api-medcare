-- Novos usuários começam com IA ativa; admin desativa quando necessário.
ALTER TABLE "users" ALTER COLUMN "aiEnabled" SET DEFAULT true;

-- Contas já existentes também passam a ativas (antes o default era false).
UPDATE "users" SET "aiEnabled" = true;
