# ── Estágio 1: builder ────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Instala dependências (inclui devDependencies para compilar)
COPY package*.json ./
RUN npm ci

# Gera o Prisma Client
COPY prisma ./prisma
RUN npx prisma generate

# Compila o TypeScript
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# ── Estágio 2: runner ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Executa como usuário non-root
RUN addgroup -S medcare && adduser -S medcare -G medcare

# Instala apenas dependências de produção
COPY package*.json ./
RUN npm ci --omit=dev

# Gera o Prisma Client no estágio de produção
COPY prisma ./prisma
RUN npx prisma generate

# Copia o artefato compilado
COPY --from=builder /app/dist ./dist

USER medcare

EXPOSE 3000

CMD ["node", "dist/server.js"]
