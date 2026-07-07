import type { FamilyMember, HealthProfile, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'

import { env } from '../../config/env.js'
import { assertFamilyInScope, resolveAccessibleFamilyIds } from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import {
  decryptField,
  encryptField,
  hashForLookup,
  maskCpf,
  onlyDigits,
} from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { familiesRepository } from './families.repository.js'
import type {
  CreateFamilyMemberInput,
  RegisterInput,
  UpdateFamilyMemberInput,
  UpsertHealthProfileInput,
} from './families.schema.js'

// Único papel do app-medcare com escrita em FamilyMember/HealthProfile — CAREGIVER só lê.
// Checado aqui também (não só em families.routes.ts) como defesa em profundidade,
// no mesmo padrão de medicationsService.assertFamilyWriter.
const WRITER_ROLES: Role[] = ['PATIENT_ADMIN']

export const familiesService = {
  // Rota pública — cria a conta do admin familiar, a Family e o FamilyMember admin
  // em uma única transação (ver families.repository.createFamilyWithAdmin).
  async registerAdmin(input: RegisterInput) {
    const cpfDigits = onlyDigits(input.cpf)
    const cpfHash = hashForLookup(cpfDigits)

    const [existingEmail, existingCpf, passwordHash] = await Promise.all([
      familiesRepository.findUserByEmail(input.email),
      familiesRepository.findUserByCpfHash(cpfHash),
      bcrypt.hash(input.password, env.BCRYPT_ROUNDS),
    ])
    if (existingEmail) {
      throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
    }
    if (existingCpf) {
      throw new AppError({ code: 'CONFLICT', message: 'CPF já cadastrado' })
    }

    const { user } = await familiesRepository.createFamilyWithAdmin({
      email: input.email,
      passwordHash,
      ...(input.phone !== undefined && { phone: input.phone }),
      cpfEncrypted: encryptField(cpfDigits),
      cpfHash,
      fullNameEncrypted: encryptField(input.fullName),
      displayName: input.displayName,
      birthDate: input.birthDate,
      ...(input.biologicalSex !== undefined && { biologicalSex: input.biologicalSex }),
    })

    return user
  },

  async listMembers(user: AuthUser, familyId: string) {
    await assertFamilyInScope(user, familyId)
    const members = await familiesRepository.findManyByFamilyId(familyId)
    return members.map(toMemberSummary)
  },

  async getMember(user: AuthUser, id: string) {
    const member = await getScopedOrThrow(user, id)
    return toMemberDetail(member, user.role)
  },

  // Escrita restrita a PATIENT_ADMIN — reforça que um morador (FamilyMember sem
  // login próprio) nunca edita os próprios dados.
  async createMember(user: AuthUser, familyId: string, input: CreateFamilyMemberInput) {
    assertFamilyWriter(user)
    await assertFamilyInScope(user, familyId)
    const cpfFields = await resolveCpfFields(input.cpf)

    const member = await familiesRepository.createMember(familyId, {
      fullNameEncrypted: encryptField(input.fullName),
      displayName: input.displayName,
      relationship: input.relationship,
      birthDate: input.birthDate,
      ...(input.biologicalSex !== undefined && { biologicalSex: input.biologicalSex }),
      ...cpfFields,
    })
    return toMemberDetail(member, user.role)
  },

  async updateMember(user: AuthUser, id: string, input: UpdateFamilyMemberInput) {
    assertFamilyWriter(user)
    const member = await getScopedOrThrow(user, id)
    const cpfFields = await resolveCpfFields(input.cpf, id)

    // Rebaixar o único administrador restante deixaria a família sem ninguém com
    // permissão de escrita — mesma proteção já existente pra exclusão de membro.
    if (input.isAdmin === false && member.isAdmin) {
      const adminCount = await familiesRepository.countAdmins(member.familyId)
      if (adminCount <= 1) {
        throw new AppError({
          code: 'CONFLICT',
          message: 'Não é possível remover o último administrador da família',
        })
      }
    }

    const updated = await familiesRepository.updateMember(id, {
      ...(input.fullName !== undefined && { fullNameEncrypted: encryptField(input.fullName) }),
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(input.relationship !== undefined && { relationship: input.relationship }),
      ...(input.birthDate !== undefined && { birthDate: input.birthDate }),
      ...(input.biologicalSex !== undefined && { biologicalSex: input.biologicalSex }),
      ...(input.isAdmin !== undefined && { isAdmin: input.isAdmin }),
      ...cpfFields,
    })
    return toMemberDetail(updated, user.role)
  },

  async upsertHealthProfile(user: AuthUser, id: string, input: UpsertHealthProfileInput) {
    assertFamilyWriter(user)
    await getScopedOrThrow(user, id)

    const profile = await familiesRepository.upsertHealthProfile(id, {
      ...(input.weightKg !== undefined && { weightKg: input.weightKg }),
      ...(input.heightM !== undefined && { heightM: input.heightM }),
      ...(input.bloodType !== undefined && { bloodType: input.bloodType }),
      conditions: input.conditions,
      allergies: input.allergies,
      ...(input.notes !== undefined && { notesEncrypted: encryptField(input.notes) }),
    })
    return toHealthProfileResponse(profile)
  },

  async deleteMember(user: AuthUser, id: string) {
    assertFamilyWriter(user)
    const member = await getScopedOrThrow(user, id)
    if (member.isAdmin) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Não é possível remover o administrador da família',
      })
    }
    await familiesRepository.softDeleteMember(id)
  },
}

function assertFamilyWriter(user: AuthUser) {
  if (!WRITER_ROLES.includes(user.role)) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Perfil não pode gerenciar membros da família',
    })
  }
}

async function getScopedOrThrow(user: AuthUser, id: string) {
  const familyIds = await resolveAccessibleFamilyIds(user)
  const member = await familiesRepository.findByIdScoped(id, familyIds)
  if (!member) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Morador não encontrado' })
  }
  return member
}

// CPF é @unique (hash) tanto em User quanto em FamilyMember — sem essa checagem,
// uma colisão vira um 500 cru (Prisma P2002) em vez de um 409 tratado.
// excludeMemberId evita falso-positivo quando o próprio morador mantém o CPF atual.
async function resolveCpfFields(cpf: string | undefined, excludeMemberId?: string) {
  if (cpf === undefined) return undefined

  const digits = onlyDigits(cpf)
  const cpfHash = hashForLookup(digits)
  const existing = await familiesRepository.findMemberByCpfHash(cpfHash)
  if (existing && existing.id !== excludeMemberId) {
    throw new AppError({ code: 'CONFLICT', message: 'CPF já cadastrado para outro morador' })
  }

  return { cpfEncrypted: encryptField(digits), cpfHash }
}

function toMemberSummary(member: FamilyMember) {
  return {
    id: member.id,
    familyId: member.familyId,
    displayName: member.displayName,
    relationship: member.relationship,
    birthDate: member.birthDate,
    biologicalSex: member.biologicalSex,
    isAdmin: member.isAdmin,
    hasLogin: member.userId !== null,
  }
}

function toMemberDetail(
  member: FamilyMember & { healthProfile?: HealthProfile | null },
  role: Role,
) {
  return {
    ...toMemberSummary(member),
    fullName: decryptField(member.fullNameEncrypted),
    cpf: resolveCpfForRole(member.cpfEncrypted, role),
    healthProfile: member.healthProfile ? toHealthProfileResponse(member.healthProfile) : null,
  }
}

// CAREGIVER não é o titular nem o responsável legal do morador — mascara por
// padrão (CLAUDE.md, "Segurança — regras obrigatórias", item 3). PATIENT_ADMIN
// administra a própria família, o equivalente familiar de "dono do dado".
function resolveCpfForRole(cpfEncrypted: Uint8Array | null, role: Role): string | null {
  if (!cpfEncrypted) return null
  const cpf = decryptField(cpfEncrypted)
  return role === 'PATIENT_ADMIN' ? cpf : maskCpf(cpf)
}

function toHealthProfileResponse(profile: HealthProfile) {
  const { notesEncrypted, ...rest } = profile
  return { ...rest, notes: notesEncrypted ? decryptField(notesEncrypted) : null }
}
