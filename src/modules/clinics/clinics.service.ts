import type { Clinic, Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'

import { env } from '../../config/env.js'
import { resolveClinicId } from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import { accountWelcomeTemplate, sendMail } from '../../shared/mail/index.js'
import {
  decryptField,
  encryptField,
  generateTemporaryPassword,
  hashForLookup,
  maskCnpj,
  maskCpf,
  onlyDigits,
  recordAuditEvent,
  recordSensitiveAccess,
} from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { computeNextDueDate, omitUndefined } from '../../shared/utils/index.js'
import { plansRepository } from '../plans/plans.repository.js'
import { plansService } from '../plans/plans.service.js'
import { clinicsRepository } from './clinics.repository.js'
import type {
  CreateClinicInput,
  LinkDoctorInput,
  ListClinicDoctorsQuery,
  ListClinicsQuery,
  ToggleLinkInput,
  UpdateClinicInput,
  UpdateClinicSelfInput,
} from './clinics.schema.js'

function maskClinic(clinic: Clinic) {
  return {
    id: clinic.id,
    tradeName: clinic.tradeName,
    cnpj: maskCnpj(decryptField(clinic.cnpjEncrypted)),
    email: clinic.email,
    phone: clinic.phone,
    address: clinic.address,
    planId: clinic.planId,
    status: clinic.status,
    createdAt: clinic.createdAt,
    updatedAt: clinic.updatedAt,
  }
}

function revealClinic(clinic: Clinic) {
  return {
    id: clinic.id,
    legalName: decryptField(clinic.legalNameEncrypted),
    tradeName: clinic.tradeName,
    cnpj: decryptField(clinic.cnpjEncrypted),
    email: clinic.email,
    phone: clinic.phone,
    address: clinic.address,
    planId: clinic.planId,
    status: clinic.status,
    createdAt: clinic.createdAt,
    updatedAt: clinic.updatedAt,
  }
}

async function resolveScopedClinicId(user: AuthUser, clinicId: string): Promise<string> {
  if (user.role === 'CLINIC_ADMIN') {
    const ownClinicId = await resolveClinicId(user.id)
    if (ownClinicId !== clinicId) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Clínica não encontrada' })
    }
  }
  return clinicId
}

// Barra ativar um vínculo (novo ou reativado) que estouraria Plan.includedDoctors
// quando o plano não permite médico extra (extraMemberFee nulo). Planos sem limite
// configurado (includedDoctors nulo) ou clínicas sem plano não são afetados.
async function assertWithinDoctorLimit(clinicId: string) {
  const clinic = await clinicsRepository.findById(clinicId)
  if (!clinic?.planId) return

  const plan = await plansRepository.findById(clinic.planId)
  if (!plan || plan.includedDoctors == null) return

  const activeCount = await clinicsRepository.countActiveDoctorLinks(clinicId)
  const wouldExceed = activeCount + 1 > plan.includedDoctors
  if (wouldExceed && plan.extraMemberFee == null) {
    throw new AppError({
      code: 'PLAN_LIMIT_REACHED',
      message:
        'Limite de médicos do plano atingido. Faça upgrade do plano para adicionar mais médicos.',
    })
  }
}

// Mantém Subscription sincronizada com Clinic.planId sempre que o admin
// atribui/troca/remove o plano pela aba Faturamento — sem isso a assinatura
// nunca é criada (update() só gravava planId na própria Clinic) e a UI
// (próximo vencimento, status, forma de pagamento, endereço de cobrança) fica
// presa em "sem assinatura" mesmo com plano definido.
async function syncClinicSubscription(
  user: AuthUser,
  clinicId: string,
  newPlanId: string | null,
  paymentMethod: UpdateClinicInput['paymentMethod'],
  billingAddress: UpdateClinicInput['billingAddress'],
) {
  const existing = await plansRepository.findActiveOrLateSubscription({ clinicId })

  if (!newPlanId) {
    if (existing) await plansService.cancelSubscription(user, existing.id)
    return
  }

  const plan = await plansRepository.findById(newPlanId)
  if (!plan) return

  if (!existing) {
    // Primeira assinatura da clínica só pode ser aberta com forma de pagamento definida.
    if (!paymentMethod) return
    await plansService.createSubscription(user, {
      planId: newPlanId,
      clinicId,
      paymentMethod,
      nextDueDate: computeNextDueDate(plan.billingCycle),
      ...(billingAddress !== undefined && { billingAddress }),
    })
    return
  }

  const planChanged = existing.planId !== newPlanId
  if (!planChanged && !paymentMethod && billingAddress === undefined) return

  await plansService.updateSubscription(user, existing.id, {
    ...(planChanged && { planId: newPlanId, nextDueDate: computeNextDueDate(plan.billingCycle) }),
    ...(paymentMethod && { paymentMethod }),
    ...(billingAddress !== undefined && { billingAddress }),
  })
}

// Chamado após todo vínculo/desvínculo de médico — mantém Subscription.extraDoctorsCount
// consistente com o número de médicos ativos acima de Plan.includedDoctors. Sem limite
// configurado ou sem assinatura ativa/atrasada, não há o que recalcular.
async function recalculateExtraDoctorsCharge(clinicId: string) {
  const clinic = await clinicsRepository.findById(clinicId)
  if (!clinic?.planId) return

  const plan = await plansRepository.findById(clinic.planId)
  if (!plan || plan.includedDoctors == null) return

  const activeCount = await clinicsRepository.countActiveDoctorLinks(clinicId)
  const extraCount = Math.max(activeCount - plan.includedDoctors, 0)

  const subscription = await plansRepository.findActiveOrLateSubscription({ clinicId })
  if (subscription) {
    await plansRepository.setExtraDoctorsCount(subscription.id, extraCount)
  }
}

export const clinicsService = {
  async create(user: AuthUser, input: CreateClinicInput) {
    // E-mail já usado por alguém que já tem perfil de clínica (dono de OUTRA
    // clínica) continua bloqueado. Mas se o e-mail pertence a um User sem
    // ClinicAdminProfile (ex.: paciente do app-medcare), o perfil de admin é
    // anexado a esse User existente em vez de bloquear — mesma pessoa pode
    // acumular um papel do app com um papel de dono de clínica.
    const existingAdmin = await clinicsRepository.findUserByEmail(input.adminEmail)
    if (existingAdmin?.clinicAdminProfile) {
      throw new AppError({ code: 'CONFLICT', message: 'E-mail do administrador já cadastrado' })
    }

    const cnpjDigits = onlyDigits(input.cnpj)
    const cnpjHash = hashForLookup(cnpjDigits)
    const existingClinic = await clinicsRepository.findByCnpjHash(cnpjHash)
    if (existingClinic) {
      throw new AppError({ code: 'CONFLICT', message: 'CNPJ já cadastrado' })
    }

    let clinic: Clinic
    if (existingAdmin) {
      clinic = await clinicsRepository.createWithExistingAdmin({
        legalNameEncrypted: encryptField(input.legalName),
        tradeName: input.tradeName,
        cnpjEncrypted: encryptField(cnpjDigits),
        cnpjHash,
        phone: input.phone,
        address: input.address as Prisma.InputJsonValue,
        ...(input.email !== undefined && { email: input.email }),
        ...(input.planId !== undefined && { planId: input.planId }),
        adminUserId: existingAdmin.id,
      })
    } else {
      const temporaryPassword = generateTemporaryPassword()
      const adminPasswordHash = await bcrypt.hash(temporaryPassword, env.BCRYPT_ROUNDS)

      clinic = await clinicsRepository.createWithAdmin({
        legalNameEncrypted: encryptField(input.legalName),
        tradeName: input.tradeName,
        cnpjEncrypted: encryptField(cnpjDigits),
        cnpjHash,
        phone: input.phone,
        address: input.address as Prisma.InputJsonValue,
        ...(input.email !== undefined && { email: input.email }),
        ...(input.planId !== undefined && { planId: input.planId }),
        adminName: input.adminName,
        adminEmail: input.adminEmail,
        adminPasswordHash,
        ...(input.adminPhone !== undefined && { adminPhone: input.adminPhone }),
      })

      try {
        const template = accountWelcomeTemplate(input.adminName, temporaryPassword)
        await sendMail({ to: input.adminEmail, ...template })
      } catch (err) {
        // Best-effort: o cadastro já foi concluído, falha no e-mail não deve derrubar a request.
        // Mas a falha não pode ficar só no console — grava em AuditLog (visível na tela de
        // Auditoria do admin) pra dar visibilidade de que o convite não chegou.
        const cause = err instanceof Error ? err.message : String(err)
        console.error(
          `[clinics] Falha ao enviar e-mail de boas-vindas para ${input.adminEmail}: ${cause}`,
        )
        await recordAuditEvent({
          actorId: user.id,
          action: 'CLINIC_WELCOME_EMAIL_FAILED',
          targetType: 'Clinic',
          targetId: clinic.id,
          metadata: { email: input.adminEmail, error: cause },
        })
      }
    }

    // Assinatura inicial é opcional — só é criada se plano + forma de pagamento +
    // endereço de cobrança vierem juntos (ver comentário em CreateClinicSchema).
    if (input.planId && input.paymentMethod && input.billingAddress) {
      const plan = await plansService.getById(user, input.planId)
      await plansService.createSubscription(user, {
        planId: input.planId,
        clinicId: clinic.id,
        paymentMethod: input.paymentMethod,
        nextDueDate: input.nextDueDate ?? computeNextDueDate(plan.billingCycle),
        billingAddress: input.billingAddress,
      })
    }

    await recordAuditEvent({
      actorId: user.id,
      action: 'CREATE_CLINIC',
      targetType: 'Clinic',
      targetId: clinic.id,
    })
    return revealClinic(clinic)
  },

  async list(query: ListClinicsQuery) {
    const filters = {
      ...(query.status && { status: query.status }),
      ...(query.search && { search: query.search }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const [clinics, total] = await Promise.all([
      clinicsRepository.findMany(filters, pagination),
      clinicsRepository.count(filters),
    ])
    return { items: clinics.map(maskClinic), total }
  },

  async getById(user: AuthUser, id: string) {
    const clinic = await clinicsRepository.findById(id)
    if (!clinic) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Clínica não encontrada' })
    }

    if (user.role === 'CLINIC_ADMIN') {
      const ownClinicId = await resolveClinicId(user.id)
      if (ownClinicId !== id) {
        throw new AppError({ code: 'NOT_FOUND', message: 'Clínica não encontrada' })
      }
      return revealClinic(clinic)
    }

    // PLATFORM_ADMIN decriptando dado de uma clínica que não é a sua — nunca é o
    // dono do dado, então toda decriptação aqui precisa ficar registrada.
    await recordSensitiveAccess({
      actorId: user.id,
      action: 'DECRYPT_CLINIC_CNPJ',
      targetType: 'Clinic',
      targetId: clinic.id,
    })
    return revealClinic(clinic)
  },

  async getSelf(user: AuthUser) {
    const clinicId = await resolveClinicId(user.id)
    const clinic = await clinicsRepository.findById(clinicId)
    if (!clinic) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Clínica não encontrada' })
    }
    return revealClinic(clinic)
  },

  async update(user: AuthUser, id: string, input: UpdateClinicInput) {
    const clinic = await clinicsRepository.findById(id)
    if (!clinic) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Clínica não encontrada' })
    }

    let cnpjFields: { cnpjEncrypted: Buffer<ArrayBuffer>; cnpjHash: string } | undefined
    if (input.cnpj) {
      const digits = onlyDigits(input.cnpj)
      const cnpjHash = hashForLookup(digits)
      const existing = await clinicsRepository.findByCnpjHash(cnpjHash)
      if (existing && existing.id !== id) {
        throw new AppError({ code: 'CONFLICT', message: 'CNPJ já cadastrado' })
      }
      cnpjFields = { cnpjEncrypted: encryptField(digits), cnpjHash }
    }

    const updated = await clinicsRepository.update(
      id,
      omitUndefined({
        ...(input.legalName !== undefined && { legalNameEncrypted: encryptField(input.legalName) }),
        tradeName: input.tradeName,
        email: input.email,
        phone: input.phone,
        address: input.address as Prisma.InputJsonValue | undefined,
        planId: input.planId,
        status: input.status,
        ...cnpjFields,
      }),
    )

    if (input.planId !== undefined && input.planId !== clinic.planId) {
      await syncClinicSubscription(
        user,
        id,
        input.planId,
        input.paymentMethod,
        input.billingAddress,
      )
    }

    // Cascateia pra conta de login do admin: sem isso, o toggle "Inativo" na
    // tela admin marcava só Clinic.status e o CLINIC_ADMIN continuava logando.
    if (input.status !== undefined && input.status !== clinic.status) {
      const adminUserId = await clinicsRepository.findAdminUserId(id)
      if (adminUserId) {
        await clinicsRepository.setUserActiveStatus(adminUserId, input.status)
      }
    }

    await recordAuditEvent({
      actorId: user.id,
      action: 'UPDATE_CLINIC',
      targetType: 'Clinic',
      targetId: id,
    })
    return revealClinic(updated)
  },

  async updateSelf(user: AuthUser, input: UpdateClinicSelfInput) {
    const clinicId = await resolveClinicId(user.id)
    const updated = await clinicsRepository.update(
      clinicId,
      omitUndefined({
        tradeName: input.tradeName,
        email: input.email,
        phone: input.phone,
        address: input.address as Prisma.InputJsonValue | undefined,
      }),
    )
    return revealClinic(updated)
  },

  async deactivate(user: AuthUser, id: string) {
    const clinic = await clinicsRepository.findById(id)
    if (!clinic) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Clínica não encontrada' })
    }
    const adminUserId = await clinicsRepository.findAdminUserId(id)
    await clinicsRepository.deactivateTx(id, adminUserId)
    await recordAuditEvent({
      actorId: user.id,
      action: 'DEACTIVATE_CLINIC',
      targetType: 'Clinic',
      targetId: id,
    })
  },

  async listDoctors(user: AuthUser, clinicId: string, query: ListClinicDoctorsQuery) {
    const scopedClinicId = await resolveScopedClinicId(user, clinicId)
    const links = await clinicsRepository.findDoctorLinks(
      scopedClinicId,
      query.includeInactive ?? false,
    )
    // CLINIC_ADMIN não é dono do CPF do médico — mesma máscara de doctorsService (nunca full-reveal aqui).
    return links.map((link) => {
      const { cpfEncrypted, ...userRest } = link.doctor.user
      return {
        ...link,
        doctor: {
          ...link.doctor,
          user: { ...userRest, cpf: cpfEncrypted ? maskCpf(decryptField(cpfEncrypted)) : null },
        },
      }
    })
  },

  async linkDoctor(user: AuthUser, clinicId: string, input: LinkDoctorInput) {
    const scopedClinicId = await resolveScopedClinicId(user, clinicId)

    const doctor = await clinicsRepository.findDoctorById(input.doctorId)
    if (!doctor) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Médico não encontrado' })
    }

    const existingLink = await clinicsRepository.findLink(scopedClinicId, input.doctorId)
    if (existingLink?.active) {
      throw new AppError({ code: 'CONFLICT', message: 'Médico já vinculado a esta clínica' })
    }

    await assertWithinDoctorLimit(scopedClinicId)
    const link = await clinicsRepository.upsertLink(scopedClinicId, input.doctorId)
    await recalculateExtraDoctorsCharge(scopedClinicId)
    await recordAuditEvent({
      actorId: user.id,
      action: 'LINK_DOCTOR_TO_CLINIC',
      targetType: 'Clinic',
      targetId: scopedClinicId,
      metadata: { doctorId: input.doctorId },
    })
    return link
  },

  async toggleDoctorLink(
    user: AuthUser,
    clinicId: string,
    doctorId: string,
    input: ToggleLinkInput,
  ) {
    const scopedClinicId = await resolveScopedClinicId(user, clinicId)

    const link = await clinicsRepository.findLink(scopedClinicId, doctorId)
    if (!link) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Vínculo não encontrado' })
    }

    // Reativar um vínculo desligado também precisa respeitar o limite do plano —
    // sem essa checagem, reativar contornaria o bloqueio de linkDoctor.
    if (input.active && !link.active) {
      await assertWithinDoctorLimit(scopedClinicId)
    }

    const updated = await clinicsRepository.toggleLink(scopedClinicId, doctorId, input.active)
    await recalculateExtraDoctorsCharge(scopedClinicId)
    await recordAuditEvent({
      actorId: user.id,
      action: input.active ? 'REACTIVATE_DOCTOR_LINK' : 'DEACTIVATE_DOCTOR_LINK',
      targetType: 'Clinic',
      targetId: scopedClinicId,
      metadata: { doctorId },
    })
    return updated
  },

  // Diferente de toggleDoctorLink (soft, reversível), aqui o vínculo é apagado
  // de vez — usado pelo botão "Remover acesso médico" da aba Médicos internos.
  async unlinkDoctor(user: AuthUser, clinicId: string, doctorId: string) {
    const scopedClinicId = await resolveScopedClinicId(user, clinicId)

    const link = await clinicsRepository.findLink(scopedClinicId, doctorId)
    if (!link) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Vínculo não encontrado' })
    }

    await clinicsRepository.unlinkDoctor(scopedClinicId, doctorId)
    await recalculateExtraDoctorsCharge(scopedClinicId)
    await recordAuditEvent({
      actorId: user.id,
      action: 'UNLINK_DOCTOR_FROM_CLINIC',
      targetType: 'Clinic',
      targetId: scopedClinicId,
      metadata: { doctorId },
    })
  },
}
