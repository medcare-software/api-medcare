import type { FamilyMember, HealthProfile, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'

import { env } from '../../config/env.js'
import {
  assertFamilyInScope,
  assertOwnFamilyInScope,
  resolveAccessibleFamilyIds,
  resolveCaregiverFamilyIds,
  resolveOwnMemberId,
} from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import { familyMemberTemporaryPasswordTemplate, sendMail } from '../../shared/mail/index.js'
import { sendPushToUser } from '../../shared/push/index.js'
import {
  decryptField,
  encryptField,
  generateTemporaryPassword,
  hashForLookup,
  maskCpf,
  onlyDigits,
  recordAuditEvent,
} from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { familiesRepository } from './families.repository.js'
import type {
  CreateFamilyMemberInput,
  RegisterInput,
  UpdateFamilyMemberInput,
  UpsertHealthProfileInput,
} from './families.schema.js'

// Único papel com poder de gerenciar QUALQUER membro da família (criar/excluir/editar
// terceiros) — CAREGIVER só lê. Checado aqui também (não só em families.routes.ts) como
// defesa em profundidade, no mesmo padrão de medicationsService.assertFamilyWriter.
const WRITER_ROLES: Role[] = ['PATIENT_ADMIN']
// Quem pode editar um perfil (nome/nascimento/saúde) — PATIENT_ADMIN edita qualquer
// membro da família, FAMILY_MEMBER só o próprio (restrição aplicada em getScopedOrThrow).
const PROFILE_WRITER_ROLES: Role[] = ['PATIENT_ADMIN', 'FAMILY_MEMBER']

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

    if (existingEmail?.familyMember) {
      throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
    }
    if (existingCpf?.familyMember) {
      throw new AppError({ code: 'CONFLICT', message: 'CPF já cadastrado' })
    }
    if (existingEmail && existingCpf && existingEmail.id !== existingCpf.id) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'CPF e e-mail informados pertencem a cadastros diferentes',
      })
    }
    if (existingCpf && !existingEmail) {
      // CPF de prestador sem o e-mail informado — não troca e-mail silenciosamente.
      throw new AppError({ code: 'CONFLICT', message: 'CPF já cadastrado' })
    }
    if (
      existingEmail?.cpfHash &&
      existingEmail.cpfHash !== cpfHash
    ) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Este e-mail já está vinculado a outro CPF',
      })
    }

    const adminData = {
      email: input.email,
      passwordHash,
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.state !== undefined && { state: input.state.toUpperCase() }),
      ...(input.city !== undefined && { city: input.city }),
      cpfEncrypted: encryptField(cpfDigits),
      cpfHash,
      fullNameEncrypted: encryptField(input.fullName),
      fullName: input.fullName,
      displayName: input.displayName,
      birthDate: input.birthDate,
      ...(input.biologicalSex !== undefined && { biologicalSex: input.biologicalSex }),
    }

    // Prestador (médico/clínica) sem família no app — vira admin familiar no mesmo User.
    if (existingEmail && !existingEmail.familyMember) {
      const { user } = await familiesRepository.createFamilyWithExistingAdmin(
        existingEmail.id,
        adminData,
      )
      return user
    }

    const { user } = await familiesRepository.createFamilyWithAdmin(adminData)
    return user
  },

  async listMembers(user: AuthUser, familyId: string) {
    await assertFamilyInScope(user, familyId)
    // Familiar comum: roster completo só em famílias onde é cuidador — não na própria.
    if (user.role === 'FAMILY_MEMBER') {
      const caregiverFamilyIds = await resolveCaregiverFamilyIds(user.id)
      if (!caregiverFamilyIds.includes(familyId)) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Família não encontrada' })
      }
    }
    const members = await familiesRepository.findManyByFamilyId(familyId)
    return members.map(toMemberSummary)
  },

  async getMember(user: AuthUser, id: string) {
    const member = await getScopedOrThrow(user, id)
    return toMemberDetail(member, user.role)
  },

  // Escrita restrita a PATIENT_ADMIN — reforça que um morador (FamilyMember sem
  // login próprio) nunca edita os próprios dados.
  //
  // Sempre cria User(role=FAMILY_MEMBER) linkado + e-mail de ativação
  // (define a senha reaproveitando o mesmo JWT/tela de "esqueci senha").
  async createMember(
    fastify: FastifyInstance,
    user: AuthUser,
    familyId: string,
    input: CreateFamilyMemberInput,
  ) {
    assertFamilyWriter(user)
    await assertOwnFamilyInScope(user, familyId)

    const created = await createMemberWithLogin(fastify, user, familyId, input)
    await recordAuditEvent({
      actorId: user.id,
      action: 'CREATE_FAMILY_MEMBER',
      targetType: 'FamilyMember',
      targetId: created.id,
    })
    return created
  },

  async updateMember(user: AuthUser, id: string, input: UpdateFamilyMemberInput) {
    assertProfileWriter(user)
    // isAdmin é uma decisão administrativa (quem pode gerenciar a família) — nunca
    // uma escolha do próprio morador, mesmo editando o próprio perfil.
    if (input.isAdmin !== undefined && user.role !== 'PATIENT_ADMIN') {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Apenas o administrador pode alterar essa permissão',
      })
    }
    const member = await getScopedOrThrow(user, id)
    await assertFamilyProfileWriteAllowed(user, member)
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

    const memberData = {
      ...(input.fullName !== undefined && { fullNameEncrypted: encryptField(input.fullName) }),
      ...(input.displayName !== undefined && { displayName: input.displayName }),
      ...(input.relationship !== undefined && { relationship: input.relationship }),
      ...(input.birthDate !== undefined && { birthDate: input.birthDate }),
      ...(input.biologicalSex !== undefined && { biologicalSex: input.biologicalSex }),
      ...(input.isAdmin !== undefined && { isAdmin: input.isAdmin }),
      ...cpfFields,
    }

    // Promoção/rebaixamento de admin: sincroniza User.role só em contas só-app.
    // Prestador (Doctor/ClinicAdmin) mantém role no banco; login portal=app
    // deriva PATIENT_ADMIN/FAMILY_MEMBER do isAdmin do FamilyMember.
    const isAdminChange = input.isAdmin !== undefined && input.isAdmin !== member.isAdmin
    let updated
    if (isAdminChange && member.userId) {
      const linked = await familiesRepository.findUserById(member.userId)
      const isProvider =
        !!linked?.doctor ||
        !!linked?.clinicAdminProfile ||
        linked?.role === 'DOCTOR' ||
        linked?.role === 'CLINIC_ADMIN'
      updated = isProvider
        ? await familiesRepository.updateMember(id, memberData)
        : await familiesRepository.updateMemberAndRole(
            id,
            member.userId,
            memberData,
            input.isAdmin ? 'PATIENT_ADMIN' : 'FAMILY_MEMBER',
          )
    } else {
      updated = await familiesRepository.updateMember(id, memberData)
    }

    if (isAdminChange && member.userId) {
      await sendPushToUser(member.userId, {
        title: input.isAdmin ? 'Você agora é administrador' : 'Você não é mais administrador',
        body: input.isAdmin
          ? 'Você agora pode gerenciar a família, incluindo membros e acessos médicos.'
          : 'Você não pode mais gerenciar a família, membros e acessos médicos.',
        data: { type: 'admin-role-changed', memberId: id, isAdmin: input.isAdmin },
      })
    }

    return toMemberDetail(updated, user.role)
  },

  async upsertHealthProfile(user: AuthUser, id: string, input: UpsertHealthProfileInput) {
    assertProfileWriter(user)
    const member = await getScopedOrThrow(user, id)
    await assertFamilyProfileWriteAllowed(user, member)

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
    await assertOwnFamilyInScope(user, member.familyId)
    if (member.isAdmin) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Não é possível remover o administrador da família',
      })
    }
    await familiesRepository.softDeleteMember(id, member.userId)
  },
}

// email + cpf são obrigatórios no CreateFamilyMemberSchema.
async function createMemberWithLogin(
  fastify: FastifyInstance,
  user: AuthUser,
  familyId: string,
  input: CreateFamilyMemberInput,
) {
  if (!input.cpf) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'CPF é obrigatório para criar login com e-mail',
    })
  }

  const cpfDigits = onlyDigits(input.cpf)
  const cpfHash = hashForLookup(cpfDigits)

  const [existingEmail, existingCpfUser, existingCpfMember] = await Promise.all([
    familiesRepository.findUserByEmail(input.email),
    familiesRepository.findUserByCpfHash(cpfHash),
    familiesRepository.findMemberByCpfHash(cpfHash),
  ])

  if (existingEmail?.familyMember) {
    throw new AppError({
      code: 'CONFLICT',
      message: conflictMessage(familyId, existingEmail.familyMember, 'e-mail'),
    })
  }
  if (existingCpfUser?.familyMember) {
    throw new AppError({
      code: 'CONFLICT',
      message: conflictMessage(familyId, existingCpfUser.familyMember, 'CPF'),
    })
  }
  if (existingCpfMember) {
    throw new AppError({
      code: 'CONFLICT',
      message: conflictMessage(familyId, existingCpfMember, 'CPF'),
    })
  }
  if (existingEmail && existingCpfUser && existingEmail.id !== existingCpfUser.id) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'CPF e e-mail informados pertencem a cadastros diferentes',
    })
  }
  if (existingCpfUser && !existingEmail) {
    throw new AppError({
      code: 'CONFLICT',
      message: conflictMessage(familyId, existingCpfUser.familyMember, 'CPF'),
    })
  }
  if (existingEmail?.cpfHash && existingEmail.cpfHash !== cpfHash) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Este e-mail já está vinculado a outro CPF',
    })
  }

  const memberFields = {
    fullNameEncrypted: encryptField(input.fullName),
    displayName: input.displayName,
    relationship: input.relationship,
    birthDate: input.birthDate,
    ...(input.biologicalSex !== undefined && { biologicalSex: input.biologicalSex }),
    cpfEncrypted: encryptField(cpfDigits),
    cpfHash,
  }

  // Prestador sem FamilyMember — anexa à família; senha já existe, sem e-mail de ativação.
  if (existingEmail && !existingEmail.familyMember) {
    const member = await familiesRepository.createMemberForExistingUser(
      familyId,
      existingEmail.id,
      memberFields,
    )
    return { ...toMemberDetail(member, user.role), activationEmailSent: false as const }
  }

  const temporaryPassword = generateTemporaryPassword()
  const passwordHash = await bcrypt.hash(temporaryPassword, env.BCRYPT_ROUNDS)

  const { user: newUser, member } = await familiesRepository.createMemberWithUser(familyId, {
    email: input.email,
    passwordHash,
    ...memberFields,
  })

  const template = familyMemberTemporaryPasswordTemplate(input.displayName, temporaryPassword)

  // Não await SMTP: o relay pode levar vários segundos e o proxy (Railway) corta a
  // HTTP antes do 201 — o app fica em loading eterno mesmo com o e-mail aceito.
  void sendMail({ to: newUser.email, ...template }).catch(async (err) => {
    const cause = err instanceof Error ? err.message : String(err)
    fastify.log.error(
      { err, userId: newUser.id, email: newUser.email },
      'Falha ao enviar e-mail de senha temporária do membro familiar',
    )
    await recordAuditEvent({
      actorId: user.id,
      action: 'FAMILY_MEMBER_ACTIVATION_EMAIL_FAILED',
      targetType: 'FamilyMember',
      targetId: member.id,
      metadata: { email: newUser.email, error: cause },
    })
  })

  return { ...toMemberDetail(member, user.role), activationEmailSent: true as const }
}

// Mensagem de conflito contextual: diferencia "já é membro desta família" (erro
// de digitação/duplicidade local) de "já pertence a outra família" (tentativa de
// reusar a mesma pessoa em duas famílias) de "conta sem FamilyMember" (CAREGIVER/
// DOCTOR/etc. usando o mesmo e-mail/CPF, caso raro mas possível).
function conflictMessage(
  currentFamilyId: string,
  match: { familyId: string; isAdmin: boolean } | null | undefined,
  entityLabel: 'e-mail' | 'CPF',
): string {
  if (!match) {
    return `Este ${entityLabel} já está em uso por outra conta no sistema.`
  }
  if (match.familyId === currentFamilyId) {
    return 'Esse membro já está cadastrado nesta família.'
  }
  if (match.isAdmin) {
    return `Este ${entityLabel} já pertence ao administrador de outra família.`
  }
  return `Este ${entityLabel} já pertence a um membro de outra família. Não é possível cadastrar a mesma pessoa em famílias diferentes.`
}

function assertFamilyWriter(user: AuthUser) {
  if (!WRITER_ROLES.includes(user.role)) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Perfil não pode gerenciar membros da família',
    })
  }
}

function assertProfileWriter(user: AuthUser) {
  if (!PROFILE_WRITER_ROLES.includes(user.role)) {
    throw new AppError({
      code: 'FORBIDDEN',
      message: 'Perfil não pode editar dados de membros da família',
    })
  }
}

/** Editar perfil/saúde: só na própria família (admin) ou no próprio registro (familiar). */
async function assertFamilyProfileWriteAllowed(
  user: AuthUser,
  member: { id: string; familyId: string },
) {
  if (user.role === 'PATIENT_ADMIN') {
    await assertOwnFamilyInScope(user, member.familyId)
    return
  }
  if (user.role === 'FAMILY_MEMBER') {
    const ownId = await resolveOwnMemberId(user)
    if (member.id !== ownId) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Morador não encontrado' })
    }
  }
}

// Escopa por família (FamilyMember ∪ CaregiverAccess). FAMILY_MEMBER na própria
// família só acessa o próprio registro; em famílias via CaregiverAccess, roster.
async function getScopedOrThrow(user: AuthUser, id: string) {
  const familyIds = await resolveAccessibleFamilyIds(user)
  const member = await familiesRepository.findByIdScoped(id, familyIds)
  if (!member) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Morador não encontrado' })
  }
  if (user.role === 'FAMILY_MEMBER') {
    const [ownId, caregiverFamilyIds] = await Promise.all([
      resolveOwnMemberId(user),
      resolveCaregiverFamilyIds(user.id),
    ])
    const allowed =
      member.id === ownId || caregiverFamilyIds.includes(member.familyId)
    if (!allowed) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Morador não encontrado' })
    }
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
