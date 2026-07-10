/**
 * Soft-delete de User por e-mail: libera @unique (email/cpfHash), revoga tokens
 * e soft-deleta FamilyMember vinculado.
 *
 * Uso:
 *   DATABASE_URL=... npx tsx scripts/soft-delete-user-by-email.ts LopesSouzaN03@outlook.com
 */
import 'dotenv/config'

import { PrismaClient } from '@prisma/client'

const emailArg = process.argv[2]?.trim()
if (!emailArg) {
  console.error('Uso: npx tsx scripts/soft-delete-user-by-email.ts <email>')
  process.exit(1)
}

const email = emailArg.toLowerCase()
const db = new PrismaClient()

async function main() {
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    include: { familyMember: true },
  })

  if (!user) {
    console.error(`Usuário não encontrado: ${email}`)
    process.exit(1)
  }

  if (user.deletedAt) {
    console.log(`Usuário já soft-deletado: ${user.id} (${user.email})`)
    // Ainda assim renomeia se o e-mail original estiver ocupando o unique.
    if (!user.email.startsWith('deleted+')) {
      const now = new Date()
      await db.user.update({
        where: { id: user.id },
        data: {
          email: `deleted+${user.id}.${now.getTime()}@deleted.local`,
          cpfHash: null,
        },
      })
      console.log('E-mail renomeado para liberar @unique.')
    }
    return
  }

  const now = new Date()
  const freedEmail = `deleted+${user.id}.${now.getTime()}@deleted.local`

  await db.$transaction(async (tx) => {
    if (user.familyMember && !user.familyMember.deletedAt) {
      await tx.familyMember.update({
        where: { id: user.familyMember.id },
        data: { deletedAt: now, cpfHash: null },
      })
    }

    await tx.user.update({
      where: { id: user.id },
      data: {
        deletedAt: now,
        status: 'INACTIVE',
        email: freedEmail,
        cpfHash: null,
      },
    })

    await tx.refreshToken.updateMany({
      where: { userId: user.id, revoked: false },
      data: { revoked: true, revokedAt: now },
    })
  })

  console.log(`Soft-delete ok: ${user.id}`)
  console.log(`  role=${user.role}`)
  console.log(`  email ${email} → ${freedEmail}`)
  if (user.familyMember) {
    console.log(`  familyMember=${user.familyMember.id}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
