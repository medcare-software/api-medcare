import type { PrismaClient } from '@prisma/client'

import { encryptField } from '../../src/shared/security/index.js'

const FAMILY_ID = 'seed-family-001'

type MedicationForm = 'TABLET' | 'CAPSULE' | 'DROPS' | 'INJECTION' | 'SYRUP' | 'OINTMENT' | 'PATCH' | 'OTHER'
type MedicationStripeColor = 'NONE' | 'BLACK' | 'RED' | 'ORANGE'
type DoseState = 'TAKEN' | 'LATE' | 'MISSED'

interface SeedMedicationInput {
  id: string
  memberId: string
  name: string
  dosage: string
  dosageUnit: string
  form: MedicationForm
  stripeColor: MedicationStripeColor
  continuousUse: boolean
  doctorId?: string
  source?: 'MANUAL' | 'DOCTOR'
}

/**
 * Popula medicamentos + registros de dose pra exercitar a tela admin de
 * relatórios de Medicamentos: agrupamento por nome (case-insensitive) + mg,
 * fallback de estado pro admin da família (dependente sem login próprio),
 * filtro por médico/clínica, e aderência ao horário (TAKEN/LATE/MISSED).
 */
export async function seedMedications(db: PrismaClient) {
  const family = await db.family.findUniqueOrThrow({ where: { id: FAMILY_ID } })
  const adminMember = await db.familyMember.findFirstOrThrow({
    where: { familyId: family.id, isAdmin: true },
  })
  const spouseMember = await db.familyMember.findFirstOrThrow({
    where: { familyId: family.id, isAdmin: false, userId: { not: null } },
  })
  const doctor = await db.doctor.findUniqueOrThrow({
    where: { crmNumber_crmState: { crmNumber: '123456', crmState: 'SP' } },
  })

  // Admin da família precisa ter estado/cidade preenchidos pra exercitar o
  // fallback do dependente sem login (ver buildFilteredMedicationsCte em
  // reports.repository.ts) — sem isso o teste do fallback não tem o que herdar.
  await db.user.update({
    where: { id: adminMember.userId as string },
    data: { state: 'SP', city: 'São Paulo' },
  })

  // Dependente sem login próprio (ex.: menor de idade) — userId propositalmente
  // ausente, é exatamente o caso que quebra o "Estado" sem o fallback.
  const dependentMember = await db.familyMember.upsert({
    where: { id: 'seed-member-dependente-miguel' },
    create: {
      id: 'seed-member-dependente-miguel',
      familyId: family.id,
      fullNameEncrypted: encryptField('Miguel Affonso'),
      displayName: 'Miguel Affonso',
      relationship: 'Filho',
      birthDate: new Date('2018-04-10'),
      biologicalSex: 'MALE',
      isAdmin: false,
    },
    update: {},
  })

  const medications: SeedMedicationInput[] = [
    {
      id: 'seed-med-losartana-gabriel',
      memberId: adminMember.id,
      name: 'Losartana',
      dosage: '50',
      dosageUnit: 'mg',
      form: 'TABLET',
      stripeColor: 'RED',
      continuousUse: true,
    },
    {
      id: 'seed-med-losartana-maria',
      memberId: spouseMember.id,
      name: 'losartana',
      dosage: '50',
      dosageUnit: 'mg',
      form: 'TABLET',
      stripeColor: 'RED',
      continuousUse: true,
    },
    {
      id: 'seed-med-metformina-miguel',
      memberId: dependentMember.id,
      name: 'Metformina',
      dosage: '850',
      dosageUnit: 'mg',
      form: 'TABLET',
      stripeColor: 'NONE',
      continuousUse: true,
    },
    {
      id: 'seed-med-amoxicilina-miguel',
      memberId: dependentMember.id,
      name: 'Amoxicilina',
      dosage: '500',
      dosageUnit: 'mg',
      form: 'CAPSULE',
      stripeColor: 'ORANGE',
      continuousUse: false,
    },
    {
      id: 'seed-med-paracetamol-gabriel',
      memberId: adminMember.id,
      name: 'Paracetamol',
      dosage: '750',
      dosageUnit: 'mg',
      form: 'TABLET',
      stripeColor: 'NONE',
      continuousUse: false,
    },
    {
      id: 'seed-med-paracetamol-maria',
      memberId: spouseMember.id,
      name: 'paracetamol',
      dosage: '750',
      dosageUnit: 'mg',
      form: 'TABLET',
      stripeColor: 'NONE',
      continuousUse: false,
    },
    {
      id: 'seed-med-rivotril-gabriel',
      memberId: adminMember.id,
      name: 'Rivotril',
      dosage: '2',
      dosageUnit: 'mg',
      form: 'TABLET',
      stripeColor: 'BLACK',
      continuousUse: true,
      doctorId: doctor.id,
      source: 'DOCTOR',
    },
  ]

  for (const med of medications) {
    await db.medication.upsert({
      where: { id: med.id },
      create: {
        id: med.id,
        memberId: med.memberId,
        name: med.name,
        dosage: med.dosage,
        dosageUnit: med.dosageUnit,
        form: med.form,
        stripeColor: med.stripeColor,
        continuousUse: med.continuousUse,
        frequency: '1x ao dia',
        scheduleTimes: ['08:00'],
        weekDays: [],
        startDate: new Date('2026-01-01'),
        doctorId: med.doctorId,
        source: med.source ?? 'MANUAL',
      },
      update: {},
    })
  }

  // Só TAKEN/LATE contam pra "aderência ao horário" — MISSED (nunca tomado)
  // fica de fora de propósito (ver doseAdherenceDistribution). Losartana e
  // Rivotril ficam com dados de sobra pra popular o gráfico; Amoxicilina e
  // Paracetamol ficam sem nenhum registro, pra exercitar o onTimePercent null.
  const doseStatesByMedication: Record<string, DoseState[]> = {
    'seed-med-losartana-gabriel': [
      'TAKEN',
      'TAKEN',
      'TAKEN',
      'TAKEN',
      'TAKEN',
      'TAKEN',
      'TAKEN',
      'LATE',
      'LATE',
      'MISSED',
    ],
    'seed-med-metformina-miguel': [
      'TAKEN',
      'TAKEN',
      'TAKEN',
      'TAKEN',
      'TAKEN',
      'TAKEN',
      'TAKEN',
      'TAKEN',
      'TAKEN',
      'LATE',
    ],
    'seed-med-rivotril-gabriel': ['TAKEN', 'TAKEN', 'TAKEN', 'LATE', 'LATE', 'LATE'],
  }

  let doseRecordsCreated = 0
  for (const [medicationId, states] of Object.entries(doseStatesByMedication)) {
    for (const [index, state] of states.entries()) {
      const id = `${medicationId}-dose-${index}`
      const scheduledAt = new Date(Date.now() - (states.length - index) * 12 * 60 * 60 * 1000)
      await db.medicationDoseRecord.upsert({
        where: { id },
        create: {
          id,
          medicationId,
          scheduledAt,
          takenAt: state === 'MISSED' ? null : scheduledAt,
          state,
          recordedById: adminMember.userId as string,
        },
        update: {},
      })
      doseRecordsCreated += 1
    }
  }

  return { medicationsCreated: medications.length, doseRecordsCreated }
}
