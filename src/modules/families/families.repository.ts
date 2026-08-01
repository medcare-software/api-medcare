import type { BiologicalSex, Role } from '@prisma/client'

import { db } from '../../config/database.js'
import { familyNameFromFullName, omitUndefined } from '../../shared/utils/index.js'

type ConsumerTermsAcceptance = {
  termsOfUseAcceptedAt: Date
  privacyPolicyAcceptedAt: Date
  lgpdConsentAcceptedAt: Date
  consumerTermsVersion: string
}

type CreateFamilyWithAdminData = {
  email: string
  passwordHash: string
  phone?: string
  state?: string
  city?: string
  cpfEncrypted: Buffer<ArrayBuffer>
  cpfHash: string
  fullNameEncrypted: Buffer<ArrayBuffer>
  /** Nome completo em claro — usado só para derivar Family.name (não é persistido). */
  fullName: string
  displayName: string
  birthDate: Date
  biologicalSex?: BiologicalSex
} & ConsumerTermsAcceptance

type CreateFamilyMemberData = {
  fullNameEncrypted: Buffer<ArrayBuffer>
  displayName: string
  relationship: string
  birthDate: Date
  biologicalSex?: BiologicalSex
  cpfEncrypted?: Buffer<ArrayBuffer>
  cpfHash?: string
}

// CPF sempre presente aqui — o schema (CreateFamilyMemberSchema) exige
// email + cpf no create com login.
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
  // Inclui familyMember + perfis web para createMemberWithLogin/registerAdmin
  // saberem anexar FamilyMember a prestador existente (mesmo e-mail).
  findUserByEmail(email: string) {
    return db.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      include: {
        familyMember: { select: { familyId: true, isAdmin: true } },
        doctor: { select: { id: true } },
        clinicAdminProfile: { select: { id: true } },
      },
    })
  },

  // Pré-checagem de unicidade de CPF antes de gravar — cpfHash é @unique tanto em
  // User quanto em FamilyMember, e sem essa checagem uma colisão vira um 500 cru
  // (P2002) em vez de um 409 CONFLICT tratado.
  findUserByCpfHash(cpfHash: string) {
    return db.user.findFirst({
      where: { cpfHash, deletedAt: null },
      include: {
        familyMember: { select: { familyId: true, isAdmin: true } },
        doctor: { select: { id: true } },
        clinicAdminProfile: { select: { id: true } },
      },
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
          name: input.fullName,
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
          role: 'PATIENT_ADMIN',
          phone: input.phone,
          state: input.state,
          city: input.city,
          cpfEncrypted: input.cpfEncrypted,
          cpfHash: input.cpfHash,
          status: 'ACTIVE',
          termsOfUseAcceptedAt: input.termsOfUseAcceptedAt,
          privacyPolicyAcceptedAt: input.privacyPolicyAcceptedAt,
          lgpdConsentAcceptedAt: input.lgpdConsentAcceptedAt,
          consumerTermsVersion: input.consumerTermsVersion,
        }),
      })

      const family = await tx.family.create({
        data: { name: familyNameFromFullName(input.fullName) },
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

  // Prestador (médico/clínica) sem FamilyMember se registra no app como admin
  // familiar — anexa Family + FamilyMember ao User existente (e-mail @unique).
  // Não altera User.role (continua DOCTOR/CLINIC_ADMIN no banco); o login
  // portal=app deriva PATIENT_ADMIN do isAdmin do member.
  createFamilyWithExistingAdmin(
    userId: string,
    input: Omit<CreateFamilyWithAdminData, 'email'> & { passwordHash: string },
  ) {
    return db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: omitUndefined({
          passwordHash: input.passwordHash,
          phone: input.phone,
          state: input.state,
          city: input.city,
          cpfEncrypted: input.cpfEncrypted,
          cpfHash: input.cpfHash,
          name: input.fullName,
          termsOfUseAcceptedAt: input.termsOfUseAcceptedAt,
          privacyPolicyAcceptedAt: input.privacyPolicyAcceptedAt,
          lgpdConsentAcceptedAt: input.lgpdConsentAcceptedAt,
          consumerTermsVersion: input.consumerTermsVersion,
        }),
      })

      const family = await tx.family.create({
        data: { name: familyNameFromFullName(input.fullName) },
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

  findUserById(id: string) {
    return db.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        role: true,
        doctor: { select: { id: true } },
        clinicAdminProfile: { select: { id: true } },
      },
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

  // Anexa FamilyMember a User prestador existente (sem familyMember) — não cria
  // segundo User. User.role no banco permanece; login portal=app deriva o papel.
  createMemberForExistingUser(
    familyId: string,
    userId: string,
    input: Omit<CreateFamilyMemberWithUserData, 'email' | 'passwordHash'>,
  ) {
    return db.$transaction(async (tx) => {
      // Preenche CPF no User se ainda não tinha (médico cadastrado só com CRM).
      await tx.user.update({
        where: { id: userId },
        data: omitUndefined({
          cpfEncrypted: input.cpfEncrypted,
          cpfHash: input.cpfHash,
          name: input.displayName,
        }),
      })

      const member = await tx.familyMember.create({
        data: omitUndefined({
          familyId,
          userId,
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

      return member
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

  // Soft-delete do FamilyMember. Se o User só existe pro app, desativa a conta.
  // Se ainda é prestador (Doctor/ClinicAdmin), só remove o vínculo familiar —
  // o portal web continua funcionando com o mesmo e-mail.
  softDeleteMember(id: string, userId: string | null) {
    const now = new Date()
    if (!userId) {
      return db.familyMember.update({
        where: { id },
        data: { deletedAt: now, cpfHash: null, userId: null },
      })
    }
    return db.$transaction(async (tx) => {
      await tx.familyMember.update({
        where: { id },
        data: { deletedAt: now, cpfHash: null, userId: null },
      })

      const linked = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: {
          doctor: { select: { id: true } },
          clinicAdminProfile: { select: { id: true } },
        },
      })
      const isProvider =
        !!linked?.doctor ||
        !!linked?.clinicAdminProfile ||
        linked?.role === 'DOCTOR' ||
        linked?.role === 'CLINIC_ADMIN'

      if (isProvider) {
        // Revoga só sessões de app na prática é difícil sem aud no refresh —
        // revoga todas; o prestador faz login de novo no web.
        await tx.refreshToken.updateMany({
          where: { userId, revoked: false },
          data: { revoked: true, revokedAt: now },
        })
        return
      }

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
