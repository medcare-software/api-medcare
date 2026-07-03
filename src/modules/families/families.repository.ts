import type { BiologicalSex } from '@prisma/client'

import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'

type CreateFamilyWithAdminData = {
  email: string
  passwordHash: string
  phone?: string
  cpfEncrypted: Buffer<ArrayBuffer>
  cpfHash: string
  fullNameEncrypted: Buffer<ArrayBuffer>
  displayName: string
  birthDate: Date
  biologicalSex?: BiologicalSex
}

type CreateFamilyMemberData = {
  fullNameEncrypted: Buffer<ArrayBuffer>
  displayName: string
  relationship: string
  birthDate: Date
  biologicalSex?: BiologicalSex
  cpfEncrypted?: Buffer<ArrayBuffer>
  cpfHash?: string
}

type UpdateFamilyMemberData = Partial<CreateFamilyMemberData>

type UpsertHealthProfileData = {
  weightKg?: number
  heightM?: number
  bloodType?: string
  conditions: string[]
  allergies: string[]
  notesEncrypted?: Buffer<ArrayBuffer>
}

export const familiesRepository = {
  findUserByEmail(email: string) {
    return db.user.findUnique({ where: { email: email.toLowerCase() } })
  },

  // Pré-checagem de unicidade de CPF antes de gravar — cpfHash é @unique tanto em
  // User quanto em FamilyMember, e sem essa checagem uma colisão vira um 500 cru
  // (P2002) em vez de um 409 CONFLICT tratado.
  findUserByCpfHash(cpfHash: string) {
    return db.user.findUnique({ where: { cpfHash } })
  },

  findMemberByCpfHash(cpfHash: string) {
    return db.familyMember.findUnique({ where: { cpfHash } })
  },

  // Transação única: User(role=PATIENT_ADMIN) + Family + FamilyMember(isAdmin=true).
  // O admin familiar é ao mesmo tempo o dono da conta e o primeiro FamilyMember.
  createFamilyWithAdmin(input: CreateFamilyWithAdminData) {
    return db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: omitUndefined({
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
          role: 'PATIENT_ADMIN',
          phone: input.phone,
          cpfEncrypted: input.cpfEncrypted,
          cpfHash: input.cpfHash,
          status: 'ACTIVE',
        }),
      })

      const family = await tx.family.create({
        data: { name: `Família de ${input.displayName}` },
      })

      const member = await tx.familyMember.create({
        data: omitUndefined({
          familyId: family.id,
          userId: user.id,
          fullNameEncrypted: input.fullNameEncrypted,
          displayName: input.displayName,
          relationship: 'Você',
          birthDate: input.birthDate,
          biologicalSex: input.biologicalSex,
          cpfEncrypted: input.cpfEncrypted,
          cpfHash: input.cpfHash,
          isAdmin: true,
        }),
      })

      return { user, family, member }
    })
  },

  findManyByFamilyId(familyId: string) {
    return db.familyMember.findMany({
      where: { familyId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    })
  },

  // familyIds vem de resolveAccessibleFamilyIds — escopa a busca por família
  // direto no WHERE (defense-in-depth: mesmo que o caller esqueça de checar o
  // escopo antes, a query nunca retorna um morador de outra família).
  findByIdScoped(id: string, familyIds: string[]) {
    return db.familyMember.findFirst({
      where: { id, familyId: { in: familyIds }, deletedAt: null },
      include: { healthProfile: true },
    })
  },

  createMember(familyId: string, input: CreateFamilyMemberData) {
    return db.familyMember.create({
      data: { familyId, ...omitUndefined(input) },
      include: { healthProfile: true },
    })
  },

  updateMember(id: string, data: UpdateFamilyMemberData) {
    return db.familyMember.update({
      where: { id },
      data: omitUndefined(data),
      include: { healthProfile: true },
    })
  },

  softDeleteMember(id: string) {
    return db.familyMember.update({ where: { id }, data: { deletedAt: new Date() } })
  },

  upsertHealthProfile(memberId: string, data: UpsertHealthProfileData) {
    return db.healthProfile.upsert({
      where: { memberId },
      create: { memberId, ...omitUndefined(data) },
      update: omitUndefined(data),
    })
  },
}
