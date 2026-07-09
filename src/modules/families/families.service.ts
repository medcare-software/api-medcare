import crypto from 'node:crypto'

import type { FamilyMember, HealthProfile, Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'

import { env } from '../../config/env.js'
import {
  assertFamilyInScope,
  resolveAccessibleFamilyIds,
  resolveOwnMemberId,
} from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import { familyMemberActivationLinkTemplate, sendMail } from '../../shared/mail/index.js'
import { sendPushToUser } from '../../shared/push/index.js'
import {
  decryptField,
  encryptField,
  hashForLookup,
  maskCpf,
  onlyDigits,
} from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { issuePasswordResetSessionToken } from '../auth/auth.service.js'
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
  //
  // Quando input.email está presente, cria também um User(role=FAMILY_MEMBER)
  // linkado — o membro ganha login próprio e recebe um e-mail com link de
  // ativação (define a senha reaproveitando o mesmo JWT/tela de "esqueci senha").
  // Sem email, mantém o comportamento de sempre: FamilyMember sem userId
  // (dependente sem login, ex. um filho pequeno).
  async createMember(
    fastify: FastifyInstance,
    user: AuthUser,
    familyId: string,
    input: CreateFamilyMemberInput,
  ) {
    assertFamilyWriter(user)
    await assertFamilyInScope(user, familyId)

    if (input.email) {
      return createMemberWithLogin(fastify, user, familyId, { ...input, email: input.email })
    }

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

    // Promoção/rebaixamento de admin só tem efeito real se User.role acompanhar
    // isAdmin — a autorização de escrita em todo o backend é decidida por role
    // (JWT), não por isAdmin, que sozinho é só uma flag informativa. Sem User
    // próprio (dependente sem login) não há role pra sincronizar.
    const isAdminChange = input.isAdmin !== undefined && input.isAdmin !== member.isAdmin
    const updated =
      isAdminChange && member.userId
        ? await familiesRepository.updateMemberAndRole(
            id,
            member.userId,
            memberData,
            input.isAdmin ? 'PATIENT_ADMIN' : 'FAMILY_MEMBER',
          )
        : await familiesRepository.updateMember(id, memberData)

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

// input.email presente implica input.cpf presente (CreateFamilyMemberSchema.superRefine
// já garante isso em runtime) — a checagem abaixo é defesa em profundidade (mesmo
// padrão de resolveCpfFields), não confiança cega na validação de schema.
async function createMemberWithLogin(
  fastify: FastifyInstance,
  user: AuthUser,
  familyId: string,
  input: CreateFamilyMemberInput & { email: string },
) {
  if (!input.cpf) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'CPF é obrigatório para criar login com e-mail',
    })
  }

  const cpfDigits = onlyDigits(input.cpf)
  const cpfHash = hashForLookup(cpfDigits)

  // Três fontes de colisão possíveis: User por e-mail, User por CPF (qualquer
  // role — admin, membro, cuidador, médico...), e FamilyMember por CPF sem User
  // vinculado (dependente sem login). As duas primeiras cobrem "já é uma conta
  // no sistema"; a terceira é o caso que resolveCpfFields já cobre no fluxo sem
  // e-mail e que precisa ser replicado aqui — sem ela a colisão só aparece como
  // um P2002 cru na escrita de FamilyMember dentro de createMemberWithUser.
  const [existingEmail, existingCpfUser, existingCpfMember] = await Promise.all([
    familiesRepository.findUserByEmail(input.email),
    familiesRepository.findUserByCpfHash(cpfHash),
    familiesRepository.findMemberByCpfHash(cpfHash),
  ])
  if (existingEmail) {
    throw new AppError({
      code: 'CONFLICT',
      message: conflictMessage(familyId, existingEmail.familyMember, 'e-mail'),
    })
  }
  if (existingCpfUser) {
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

  // Senha inutilizável — só existe para satisfazer a constraint NOT NULL até o
  // membro definir a senha real pelo link de ativação. Nunca logada/exposta.
  const placeholderPassword = crypto.randomBytes(32).toString('hex')
  const passwordHash = await bcrypt.hash(placeholderPassword, env.BCRYPT_ROUNDS)

  const { user: newUser, member } = await familiesRepository.createMemberWithUser(familyId, {
    email: input.email,
    passwordHash,
    fullNameEncrypted: encryptField(input.fullName),
    displayName: input.displayName,
    relationship: input.relationship,
    birthDate: input.birthDate,
    ...(input.biologicalSex !== undefined && { biologicalSex: input.biologicalSex }),
    cpfEncrypted: encryptField(cpfDigits),
    cpfHash,
  })

  const activationToken = issuePasswordResetSessionToken(
    fastify,
    newUser.id,
    env.FAMILY_MEMBER_ACTIVATION_TOKEN_EXPIRES_IN,
  )
  const link = `appmedcare://reset-password?token=${activationToken}`
  const template = familyMemberActivationLinkTemplate(link, input.displayName)
  await sendMail({ to: newUser.email, ...template })

  return toMemberDetail(member, user.role)
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

// Escopa por família (todos os papéis) e, para FAMILY_MEMBER, restringe ainda mais
// ao próprio registro — ele não pode ler/editar o perfil de outro membro da mesma
// família, mesmo estando dentro do escopo familiar.
async function getScopedOrThrow(user: AuthUser, id: string) {
  const familyIds = await resolveAccessibleFamilyIds(user)
  const member = await familiesRepository.findByIdScoped(id, familyIds)
  if (!member) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Morador não encontrado' })
  }
  if (user.role === 'FAMILY_MEMBER') {
    const ownId = await resolveOwnMemberId(user)
    if (member.id !== ownId) {
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
