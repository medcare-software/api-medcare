import type { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

import { encryptField, hashForLookup, onlyDigits } from '../../src/shared/security/index.js'

export const SEED_PASSWORD = 'appmedcare123'
const BCRYPT_ROUNDS = 12

function cpfFields(cpf: string) {
  const digits = onlyDigits(cpf)
  return { cpfEncrypted: encryptField(digits), cpfHash: hashForLookup(digits) }
}

function cnpjFields(cnpj: string) {
  const digits = onlyDigits(cnpj)
  return { cnpjEncrypted: encryptField(digits), cnpjHash: hashForLookup(digits) }
}

/**
 * Cria um usuário de cada perfil (Role) com senha padrão `appmedcare123`, mais
 * os registros de apoio (família, prontuário demo, clínica, vínculo médico)
 * necessários para exercitar o fluxo de acesso ponta a ponta.
 *
 * CPF/CNPJ nunca são gravados em texto plano — sempre via encryptField() +
 * hashForLookup() (ver src/shared/security).
 */
export async function seedUsers(db: PrismaClient) {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS)

  // ── Família demo (admin familiar + membro) ──────────────────────────────
  const family = await db.family.upsert({
    where: { id: 'seed-family-001' },
    create: { id: 'seed-family-001', name: 'Família Affonso (demo)' },
    update: {},
  })

  const adminUser = await db.user.upsert({
    where: { email: 'admin@medcare.dev' },
    create: {
      email: 'admin@medcare.dev',
      passwordHash,
      role: 'PATIENT_ADMIN',
      phone: '(11) 98765-4321',
      status: 'ACTIVE',
      ...cpfFields('456.789.123-00'),
    },
    update: { passwordHash, status: 'ACTIVE' },
  })

  const adminMember = await db.familyMember.upsert({
    where: { userId: adminUser.id },
    create: {
      familyId: family.id,
      userId: adminUser.id,
      fullNameEncrypted: encryptField('Gabriel Henrique Prado Affonso'),
      displayName: 'Gabriel Affonso',
      relationship: 'Você',
      birthDate: new Date('2004-06-07'),
      biologicalSex: 'MALE',
      isAdmin: true,
      ...cpfFields('456.789.123-00'),
    },
    update: {},
  })

  await db.healthProfile.upsert({
    where: { memberId: adminMember.id },
    create: {
      memberId: adminMember.id,
      weightKg: 72,
      heightM: 1.75,
      bloodType: 'A+',
      conditions: ['Hipertensão arterial'],
      allergies: ['Dipirona'],
      notesEncrypted: encryptField('Uso bombinha antes de atividades físicas intensas.'),
    },
    update: {},
  })

  const memberUser = await db.user.upsert({
    where: { email: 'membro@medcare.dev' },
    create: {
      email: 'membro@medcare.dev',
      passwordHash,
      role: 'FAMILY_MEMBER',
      phone: '(11) 91234-5678',
      status: 'ACTIVE',
      ...cpfFields('987.654.321-00'),
    },
    update: { passwordHash, status: 'ACTIVE' },
  })

  const familyMember = await db.familyMember.upsert({
    where: { userId: memberUser.id },
    create: {
      familyId: family.id,
      userId: memberUser.id,
      fullNameEncrypted: encryptField('Maria Silva Affonso'),
      displayName: 'Maria Silva',
      relationship: 'Esposa',
      birthDate: new Date('2002-03-15'),
      biologicalSex: 'FEMALE',
      isAdmin: false,
      ...cpfFields('987.654.321-00'),
    },
    update: {},
  })

  await db.healthProfile.upsert({
    where: { memberId: familyMember.id },
    create: {
      memberId: familyMember.id,
      weightKg: 61,
      heightM: 1.65,
      bloodType: 'O+',
      conditions: [],
      allergies: ['Penicilina'],
    },
    update: {},
  })

  // ── Cuidador (acessa a família demo) ────────────────────────────────────
  const caregiverUser = await db.user.upsert({
    where: { email: 'cuidador@medcare.dev' },
    create: {
      email: 'cuidador@medcare.dev',
      passwordHash,
      role: 'CAREGIVER',
      phone: '(11) 90000-1111',
      status: 'ACTIVE',
    },
    update: { passwordHash, status: 'ACTIVE' },
  })

  const existingCaregiverAccess = await db.caregiverAccess.findFirst({
    where: { caregiverId: caregiverUser.id, familyId: family.id },
  })
  if (!existingCaregiverAccess) {
    await db.caregiverAccess.create({
      data: {
        caregiverId: caregiverUser.id,
        familyId: family.id,
        status: 'ACTIVE',
        grantedAt: new Date(),
      },
    })
  }

  // ── Médico (login por CRM) ──────────────────────────────────────────────
  const doctorUser = await db.user.upsert({
    where: { email: 'doutor@medcare.dev' },
    create: {
      email: 'doutor@medcare.dev',
      passwordHash,
      role: 'DOCTOR',
      phone: '(11) 93333-4444',
      status: 'ACTIVE',
      ...cpfFields('321.654.987-11'),
    },
    update: { passwordHash, status: 'ACTIVE' },
  })

  const doctor = await db.doctor.upsert({
    where: { crmNumber_crmState: { crmNumber: '123456', crmState: 'SP' } },
    create: {
      userId: doctorUser.id,
      crmNumber: '123456',
      crmState: 'SP',
      specialties: ['Clínica Geral'],
      status: 'ACTIVE',
    },
    update: { status: 'ACTIVE' },
  })

  // ── Clínica + admin de clínica ───────────────────────────────────────────
  const clinic = await db.clinic.upsert({
    where: { id: 'seed-clinic-001' },
    create: {
      id: 'seed-clinic-001',
      legalNameEncrypted: encryptField('MedCare Clínica Demo LTDA'),
      tradeName: 'MedCare Clínica Demo',
      email: 'clinica@medcare.dev',
      phone: '(11) 3000-0000',
      address: { city: 'São Paulo', state: 'SP' },
      status: 'ACTIVE',
      ...cnpjFields('12.345.678/0001-90'),
    },
    update: {},
  })

  const clinicAdminUser = await db.user.upsert({
    where: { email: 'clinica@medcare.dev' },
    create: {
      email: 'clinica@medcare.dev',
      passwordHash,
      role: 'CLINIC_ADMIN',
      phone: '(11) 3000-0001',
      status: 'ACTIVE',
      ...cpfFields('111.222.333-44'),
    },
    update: { passwordHash, status: 'ACTIVE' },
  })

  await db.clinicAdminProfile.upsert({
    where: { userId: clinicAdminUser.id },
    create: { userId: clinicAdminUser.id, clinicId: clinic.id },
    update: {},
  })

  const existingLink = await db.clinicDoctorLink.findFirst({
    where: { clinicId: clinic.id, doctorId: doctor.id },
  })
  if (!existingLink) {
    await db.clinicDoctorLink.create({
      data: { clinicId: clinic.id, doctorId: doctor.id, active: true },
    })
  }

  // ── Admin da plataforma ──────────────────────────────────────────────────
  await db.user.upsert({
    where: { email: 'plataforma@medcare.dev' },
    create: {
      email: 'plataforma@medcare.dev',
      passwordHash,
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
    },
    update: { passwordHash, status: 'ACTIVE' },
  })

  return {
    credentials: [
      { role: 'PATIENT_ADMIN (admin familiar)', email: 'admin@medcare.dev' },
      { role: 'FAMILY_MEMBER (membro)', email: 'membro@medcare.dev' },
      { role: 'CAREGIVER (cuidador)', email: 'cuidador@medcare.dev' },
      { role: 'DOCTOR (médico)', email: 'doutor@medcare.dev', extra: 'CRM 123456/SP' },
      { role: 'CLINIC_ADMIN (admin clínico)', email: 'clinica@medcare.dev' },
      { role: 'PLATFORM_ADMIN (admin plataforma)', email: 'plataforma@medcare.dev' },
    ],
  }
}
