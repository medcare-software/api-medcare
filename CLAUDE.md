# api-medcare

Backend compartilhado por dois frontends:
- **app-medcare** (React Native/Expo) — app da família: gestão de medicações, vacinas, exames, diagnósticos, adesão, cuidadores.
- **web-medcare** (React/Vite) — portal médico (login por CRM), portal de clínica e admin da plataforma (usuários, planos, financeiro, relatórios).

O núcleo que conecta os dois é o **prontuário do paciente** + **`MedicalAccessGrant`** (código de 6-8 dígitos que o paciente gera no app e o médico usa no portal web para abrir o prontuário).

Projeto irmão de referência de convenções: `api-unioncondo` (mesmo autor, mesma stack).

## Stack

Fastify 5 · Prisma 6 · PostgreSQL 16 · Redis 7 · MinIO (S3-compatible) · Zod · TypeScript · Biome · Vitest · Docker

## Arquitetura de pastas

```
src/
├── app.ts, server.ts        # bootstrap: error handler, plugins, registro de rotas
├── config/                  # env.ts (validação Zod), database.ts (Prisma singleton), redis.ts
├── shared/
│   ├── errors/               # AppError + ErrorCode (union de strings)
│   ├── security/              # field-encryption, blind-index, mask, audit — ver seção Segurança
│   ├── types/                 # auth.types.ts, fastify.d.ts, jwt.d.ts
│   ├── plugins/                # jwt, cors, helmet, rate-limit, swagger, multipart
│   ├── middlewares/            # authenticate.ts, authorize.ts
│   ├── auth/issue-tokens.ts    # emite access+refresh, persiste RefreshToken
│   └── utils/
└── modules/<feature>/
    ├── <feature>.routes.ts     # rotas Fastify, chama service, monta a resposta { data: ... }
    ├── <feature>.schema.ts     # validação Zod de entrada
    ├── <feature>.service.ts    # regra de negócio, lança AppError
    └── <feature>.repository.ts # única camada que fala com o Prisma
```

Cada módulo novo segue esse mesmo padrão de 4 arquivos (repository → service → routes, schema é usado pela rota).

## Estado atual

Implementado: infraestrutura completa (Docker, Prisma com **todas** as entidades do domínio já mapeadas, plugins Fastify, auth/RBAC, criptografia/masking, auditoria) + módulo `auth` funcional (login por e-mail ou CRM, refresh, logout, `/me`) + seed com um usuário por perfil.

**Pendente** (schema já existe no banco, faltam rotas/service/repository): `medications`, `vaccines`, `exams`, `diagnostics`, `procedures`, `medical-access` (geração/validação do código), `doctors`, `clinics`, `plans`, `financial` (suppliers/accounts-payable), `notifications`, `files` (upload MinIO). Construir cada um seguindo exatamente o padrão do módulo `auth`.

## Prisma — convenções

- IDs: `@id @default(cuid())`
- Auditoria padrão: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
- Soft delete via `deletedAt DateTime?` em entidades com ciclo de vida (`User`, `FamilyMember`, `Doctor`, `Clinic`) — nunca hard delete essas tabelas
- Enums: `UPPER_SNAKE_CASE`
- Tabelas: `@@map` em snake_case
- Índices em FKs, `status`, `email`, campos `*Hash`
- Toda migração roda com `npm run db:migrate` (dev) — nunca editar uma migration já aplicada, criar uma nova

## Segurança — regras obrigatórias

Este é um sistema de prontuário eletrônico. CPF, CNPJ, razão social, diagnóstico/conduta e observações clínicas são dados sigilosos (LGPD / PHI). Regras que **não podem ser quebradas**:

1. **Nunca persistir CPF, CNPJ, razão social, descrição de diagnóstico/conduta ou observações clínicas em texto plano.** Sempre usar `encryptField()` (`src/shared/security/field-encryption.ts`, AES-256-GCM) antes de gravar. A chave vem de `env.FIELD_ENCRYPTION_KEY` — nunca hardcoded, nunca logada.
2. **Busca por CPF/CNPJ nunca decripta a tabela inteira.** Usar `hashForLookup()` (HMAC-SHA256 + `env.BLIND_INDEX_PEPPER`) e comparar contra a coluna `*Hash` (`cpfHash`, `cnpjHash`).
3. **Toda resposta de API mascara CPF/CNPJ por padrão.** Usar `maskCpf()`/`maskCnpj()`/`maskEmail()`/`maskPhone()` (`src/shared/security/mask.ts`) no schema de serialização de saída de cada módulo. Só retornar o valor completo quando: (a) o próprio usuário está vendo seu próprio dado, (b) há um `MedicalAccessGrant` ativo entre o solicitante e o paciente, ou (c) é `PLATFORM_ADMIN` com justificativa.
4. **Toda decriptação para alguém que não é o dono do dado grava um `AuditLog`** via `recordSensitiveAccess()` (`src/shared/security/audit.ts`). Isso vale para médico/clínica/admin acessando prontuário de paciente.
5. **RBAC + row-level scoping**: todo repository deve filtrar por `memberId`/`clinicId`/`doctorId` do token — nunca fazer `findMany` sem escopo, mesmo que o schema permita.
6. **Senha**: hash com `bcrypt` (`env.BCRYPT_ROUNDS`, mínimo 10). Nunca comparar senha em texto plano.
7. **Logs**: `app.ts` tem `redact` configurado para nunca logar `req.body`/`Authorization`. Não adicionar `console.log` de payloads de request em nenhum módulo novo — pode vazar CPF/PHI.
8. **Uploads** (exames, prescrições) vão para o bucket MinIO privado (`env.MINIO_BUCKET`) — nunca público, sempre via URL assinada de curta duração.
9. **Refresh tokens** são armazenados como `tokenHash` (HMAC), nunca em texto plano — ver `RefreshToken.tokenHash`.

Antes de adicionar um campo sigiloso novo em qualquer `model` do Prisma, decidir explicitamente: `*Encrypted Bytes` (cifrado) vs. campo aberto — e documentar a escolha no schema com um comentário `//`.

## Scripts

```
npm run dev              # tsx watch src/server.ts
npm run build / start    # produção
npm run lint / lint:fix  # Biome
npm run db:migrate       # prisma migrate dev
npm run db:generate      # prisma generate
npm run db:seed          # popula os 6 usuários demo
npm run db:studio        # prisma studio
```

## Ambiente (Docker)

`docker compose up -d` sobe `postgres` (5432), `redis` (6379) e `minio` (9000 API / 9001 console). Copiar `.env.example` para `.env` e gerar segredos reais:

```
openssl rand -hex 32   # JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, FIELD_ENCRYPTION_KEY, BLIND_INDEX_PEPPER
```

## Credenciais do seed (`npm run db:seed`)

Senha padrão para todos: **`appmedcare123`**

| Perfil | Role | Login |
|---|---|---|
| Admin familiar | `PATIENT_ADMIN` | admin@medcare.dev |
| Membro da família | `FAMILY_MEMBER` | membro@medcare.dev |
| Cuidador | `CAREGIVER` | cuidador@medcare.dev |
| Médico | `DOCTOR` | CRM 123456/SP (ou doutor@medcare.dev) |
| Admin de clínica | `CLINIC_ADMIN` | clinica@medcare.dev |
| Admin da plataforma | `PLATFORM_ADMIN` | plataforma@medcare.dev |

Essas credenciais são só para ambiente local/demo — nunca usar em produção.
