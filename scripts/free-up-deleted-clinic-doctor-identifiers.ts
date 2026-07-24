/**
 * Destrava CNPJ/CPF/CRM/e-mail de clínicas e médicos já excluídos (soft-delete)
 * ANTES da correção que passou a liberar esses campos automaticamente no
 * momento da exclusão (ver clinics.repository.ts/doctors.repository.ts#deactivateTx).
 * Sem isso, um registro excluído antes da correção continua com o documento
 * ou e-mail "presos" — recadastrar com o mesmo CNPJ/CPF/CRM/e-mail falha com
 * "já cadastrado" mesmo o registro antigo estando excluído.
 *
 * Idempotente: já pula clínicas/médicos cujo hash/CRM já foi liberado.
 *
 * Uso:
 *   DATABASE_URL=... npx tsx scripts/free-up-deleted-clinic-doctor-identifiers.ts
 *   DATABASE_URL=... npx tsx scripts/free-up-deleted-clinic-doctor-identifiers.ts --dry-run
 */
import 'dotenv/config'

import { PrismaClient } from '@prisma/client'

const isDryRun = process.argv.includes('--dry-run')
const db = new PrismaClient()

async function main() {
  const clinics = await db.clinic.findMany({
    where: { deletedAt: { not: null }, NOT: { cnpjHash: { startsWith: 'deleted:' } } },
    select: { id: true, tradeName: true },
  })
  console.log(`Clínicas excluídas com CNPJ ainda preso: ${clinics.length}`)
  for (const clinic of clinics) {
    console.log(
      `${isDryRun ? '[dry-run] ' : ''}Clínica ${clinic.id} (${clinic.tradeName}) → libera CNPJ`,
    )
    if (!isDryRun) {
      await db.clinic.update({
        where: { id: clinic.id },
        data: { cnpjHash: `deleted:${clinic.id}` },
      })
    }
  }

  const doctors = await db.doctor.findMany({
    where: { deletedAt: { not: null }, NOT: { crmNumber: { startsWith: 'deleted:' } } },
    select: {
      id: true,
      userId: true,
      crmNumber: true,
      crmState: true,
      user: { select: { name: true } },
    },
  })
  console.log(`Médicos excluídos com CRM ainda preso: ${doctors.length}`)
  for (const doctor of doctors) {
    console.log(
      `${isDryRun ? '[dry-run] ' : ''}Médico ${doctor.id} (${doctor.user.name}, CRM/${doctor.crmState} ${doctor.crmNumber}) → libera CRM e CPF`,
    )
    if (!isDryRun) {
      await db.$transaction([
        db.doctor.update({ where: { id: doctor.id }, data: { crmNumber: `deleted:${doctor.id}` } }),
        db.user.update({ where: { id: doctor.userId }, data: { cpfHash: null } }),
      ])
    }
  }

  // E-mail (User.email) também é @unique — cobre tanto o User do médico quanto
  // o admin de uma clínica excluída, nos dois casos preso desde antes da correção.
  const staleUsers = await db.user.findMany({
    where: {
      deletedAt: { not: null },
      NOT: { email: { startsWith: 'deleted+' } },
      OR: [{ doctor: { isNot: null } }, { clinicAdminProfile: { isNot: null } }],
    },
    select: { id: true, email: true, name: true },
  })
  console.log(
    `Usuários (médico/admin de clínica) excluídos com e-mail ainda preso: ${staleUsers.length}`,
  )
  for (const user of staleUsers) {
    const freedEmail = `deleted+${user.id}.${Date.now()}@deleted.local`
    console.log(
      `${isDryRun ? '[dry-run] ' : ''}User ${user.id} (${user.name}) ${user.email} → ${freedEmail}`,
    )
    if (!isDryRun) {
      await db.user.update({ where: { id: user.id }, data: { email: freedEmail } })
    }
  }

  console.log(isDryRun ? 'Dry-run: nenhuma alteração persistida.' : 'Concluído.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
