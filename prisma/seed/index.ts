import 'dotenv/config'

import { PrismaClient } from '@prisma/client'

import { seedMedications } from './medications.seed.js'
import { SEED_PASSWORD, seedStoreReviewUsers, seedUsers } from './users.seed.js'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...\n')

  console.log('👤 Seeding usuários demo (um por perfil)...')
  const { credentials } = await seedUsers(db)

  console.log('📱 Seeding contas App Store / Play review...')
  const { credentials: storeCredentials } = await seedStoreReviewUsers(db)

  console.log('💊 Seeding medicamentos demo (relatório admin de Medicamentos)...')
  const { medicationsCreated, doseRecordsCreated } = await seedMedications(db)
  console.log(`   ${medicationsCreated} medicamentos, ${doseRecordsCreated} registros de dose`)

  console.log('\n✅ Seed concluído com sucesso!')
  console.log('\n📋 Credenciais de acesso (senha padrão para todos):', SEED_PASSWORD)
  for (const cred of credentials) {
    console.log(`   ${cred.role.padEnd(32)} : ${cred.email}${cred.extra ? ` (${cred.extra})` : ''}`)
  }

  console.log('\n📋 Contas de review (App Store / Play):')
  for (const cred of storeCredentials) {
    console.log(`   ${cred.role.padEnd(28)} : ${cred.email} / ${cred.password}`)
  }
}

main()
  .catch((err) => {
    console.error('❌ Erro durante o seed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
