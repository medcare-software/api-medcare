import type { BiologicalSex, Role } from '@prisma/client'

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

// CPF sempre presente aqui — o schema (CreateFamilyMemberSchema.superRefine)
// garante cpf junto de email antes de chegar no service/repository.
type CreateFamilyMemberWithUserData = Omit<CreateFamilyMemberData, 'cpfEncrypted' | 'cpfHash'> & {
  cpfEncrypted: Buffer<ArrayBuffer>
  cpfHash: string
  email: string
  passwordHash: string
}

type UpdateFamilyMemberData = Partial<CreateFamilyMemberData> & { isAdmin?: boolean }

type UpsertHealthProfileData = {
  weightKg?: number
  heightM?: number
  bloodType?: string
  conditions: string[]
  allergies: string[]
  notesEncrypted?: Buffer<ArrayBuffer>
}

export const familiesRepository = {
  // Inclui familyMember (familyId/isAdmin) para permitir mensagem de conflito
  // contextual em createMemberWithLogin — quem só checa truthiness (registerAdmin)
  // não é afetado por isso.
  findUserByEmail(email: string) {
    return db.user.findUnique({
      where: { email: email.toLowerCase(), deletedAt: null },
      include: { familyMember: { select: { familyId: true, isAdmin: true } } },
    })
  },

  // Pré-checagem de unicidade de CPF antes de gravar — cpfHash é @unique tanto em
  // User quanto em FamilyMember, e sem essa checagem uma colisão vira um 500 cru
  // (P2002) em vez de um 409 CONFLICT tratado.
  findUserByCpfHash(cpfHash: string) {
    return db.user.findUnique({
      where: { cpfHash, deletedAt: null },
      include: { familyMember: { select: { familyId: true, isAdmin: true } } },
    })
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
          name: input.displayName,
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

  countAdmins(familyId: string) {
    return db.familyMember.count({ where: { familyId, isAdmin: true, deletedAt: null } })
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

  // Transação: User(role=FAMILY_MEMBER) + FamilyMember linkado por userId. Mesmo
  // padrão de createFamilyWithAdmin, mas a Family já existe (não cria uma nova).
  createMemberWithUser(familyId: string, input: CreateFamilyMemberWithUserData) {
    return db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.displayName,
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
          role: 'FAMILY_MEMBER',
          cpfEncrypted: input.cpfEncrypted,
          cpfHash: input.cpfHash,
          status: 'ACTIVE',
        },
      })

      const member = await tx.familyMember.create({
        data: omitUndefined({
          familyId,
          userId: user.id,
          fullNameEncrypted: input.fullNameEncrypted,
          displayName: input.displayName,
          relationship: input.relationship,
          birthDate: input.birthDate,
          biologicalSex: input.biologicalSex,
          cpfEncrypted: input.cpfEncrypted,
          cpfHash: input.cpfHash,
        }),
        include: { healthProfile: true },
      })

      return { user, member }
    })
  },

  updateMember(id: string, data: UpdateFamilyMemberData) {
    return db.familyMember.update({
      where: { id },
      data: omitUndefined(data),
      include: { healthProfile: true },
    })
  },

  // isAdmin (FamilyMember) e role (User) precisam mudar juntos pra promoção/rebaixamento
  // de admin ter efeito real (poder de escrita vem de User.role, não de isAdmin) — ver
  // families.service.ts:updateMember.
  updateMemberAndRole(id: string, userId: string, data: UpdateFamilyMemberData, role: Role) {
    return db.$transaction(async (tx) => {
      const member = await tx.familyMember.update({
        where: { id },
        data: omitUndefined(data),
        include: { healthProfile: true },
      })
      await tx.user.update({ where: { id: userId }, data: { role } })
      return member
    })
  },

  // Soft-delete do FamilyMember é sempre seguro (evita cascatear a exclusão para
  // Medication/Vaccine/Exam/etc.); quando o membro tem login próprio (userId),
  // desativa o User junto e revoga sessões — mesmo padrão de doctors.repository.ts#deactivateTx —
  // e renomeia email/cpfHash pra liberar os @unique (findUserByEmail filtra
  // deletedAt, mas user.create ainda estoura P2002 se o e-mail original ficar).
  softDeleteMember(id: string, userId: string | null) {
    const now = new Date()
    if (!userId) {
      return db.familyMember.update({
        where: { id },
        data: { deletedAt: now, cpfHash: null },
      })
    }
    return db.$transaction(async (tx) => {
      await tx.familyMember.update({
        where: { id },
        data: { deletedAt: now, cpfHash: null },
      })
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          status: 'INACTIVE',
          email: `deleted+${userId}.${now.getTime()}@deleted.local`,
          cpfHash: null,
        },
      })
      await tx.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: now },
      })
    })
  },

  upsertHealthProfile(memberId: string, data: UpsertHealthProfileData) {
    return db.healthProfile.upsert({
      where: { memberId },
      create: { memberId, ...omitUndefined(data) },
      update: omitUndefined(data),
    })
  },
}
