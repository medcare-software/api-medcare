# api-medcare

Backend compartilhado por dois frontends:
- **app-medcare** (React Native/Expo) — app da família: gestão de medicações, vacinas, exames, diagnósticos, adesão, cuidadores.
- **web-medcare** (React/Vite) — portal médico (login por CRM), portal de clínica e admin da plataforma (usuários, planos, financeiro, relatórios).

O núcleo que conecta os dois é o **prontuário do paciente** + **`MedicalAccessGrant`** (código de 6-8 dígitos que o paciente gera no app e o médico usa no portal web para abrir o prontuário).

## Stack

Fastify 5 · Prisma 6 · PostgreSQL 16 · Redis 7 · MinIO (S3-compatible) · Zod · TypeScript · Biome · Vitest · Docker

## Setup

\`\`\`bash
cp .env.example .env
# gerar segredos reais para JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, FIELD_ENCRYPTION_KEY, BLIND_INDEX_PEPPER
# openssl rand -hex 32

docker compose up -d
npm install
npm run db:migrate
npm run db:seed
npm run dev
\`\`\`

Veja o [CLAUDE.md](./CLAUDE.md) para convenções de arquitetura e regras de segurança do projeto.
