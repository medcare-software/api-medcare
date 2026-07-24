import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'

import { env } from '../../config/env.js'
import { resolveClinicId, resolveDoctorId } from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import { doctorActivationLinkTemplate, sendMail } from '../../shared/mail/index.js'
import {
  decryptField,
  encryptField,
  generateTemporaryPassword,
  hashForLookup,
  maskCnpj,
  maskCpf,
  onlyDigits,
  recordAuditEvent,
} from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { computeNextDueDate, omitUndefined } from '../../shared/utils/index.js'
import { issuePasswordResetSessionToken } from '../auth/auth.service.js'
import { plansService } from '../plans/plans.service.js'
import { doctorsRepository } from './doctors.repository.js'
import type {
  CreateDoctorInput,
  ListDoctorsQuery,
  UpdateDoctorInput,
  UpdateDoctorSelfInput,
} from './doctors.schema.js'

interface DoctorUserView {
  id: string
  name: string
  email: string
  phone: string | null
  status: string
  cpfEncrypted: Uint8Array | null
}

// CLINIC_ADMIN/PLATFORM_ADMIN nunca são donos do CPF do médico — a API só
// retorna a versão mascarada (mesmo padrão de maskClinic em clinics.service.ts).
function maskDoctorForViewer<T extends { user: DoctorUserView }>(doctor: T) {
  const { cpfEncrypted, ...userRest } = doctor.user
  return {
    ...doctor,
    user: { ...userRest, cpf: cpfEncrypted ? maskCpf(decryptField(cpfEncrypted)) : null },
  }
}

// CLINIC_ADMIN só enxerga médico vinculado à própria clínica; PLATFORM_ADMIN sem restrição.
// Extraído porque getById/update/listSessions/revokeSession/getUsageSummary repetem essa checagem.
async function resolveScopedDoctor(user: AuthUser, id: string) {
  const doctor =
    user.role === 'CLINIC_ADMIN'
      ? await doctorsRepository.findLinkedToClinic(id, await resolveClinicId(user.id))
      : await doctorsRepository.findById(id)
  if (!doctor) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Médico não encontrado' })
  }
  return doctor
}

export const doctorsService = {
  async create(fastify: FastifyInstance, user: AuthUser, input: CreateDoctorInput) {
    // E-mail já usado por alguém que já tem perfil de médico continua bloqueado.
    // Mas se o e-mail pertence a um User sem perfil de médico (ex.: paciente do
    // app-medcare), o perfil de médico é anexado a esse User existente em vez de
    // bloquear — mesma pessoa pode acumular um papel do app com o de médico.
    const existingUserByEmail = await doctorsRepository.findUserByEmail(input.email)
    if (existingUserByEmail?.doctor) {
      throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
    }

    const crmState = input.crmState.toUpperCase()
    const existingDoctor = await doctorsRepository.findByCrm(input.crmNumber, crmState)
    if (existingDoctor) {
      throw new AppError({ code: 'CONFLICT', message: 'CRM já cadastrado' })
    }

    // CPF é o índice mais forte de identidade — checa via blind index (nunca
    // decripta a tabela inteira, ver api-medcare/CLAUDE.md regra 2). Bloqueia só
    // se a pessoa já tem perfil de médico; CPF reaproveitado por outro papel
    // (dono de clínica, usuário do app) é esperado e não deve ser barrado aqui.
    const cpfDigits = onlyDigits(input.cpf)
    const cpfHash = hashForLookup(cpfDigits)
    const existingUserByCpf = await doctorsRepository.findUserByCpfHash(cpfHash)
    if (existingUserByCpf?.doctor) {
      throw new AppError({ code: 'CONFLICT', message: 'CPF já cadastrado para outro médico' })
    }
    if (
      existingUserByCpf &&
      existingUserByEmail &&
      existingUserByCpf.id !== existingUserByEmail.id
    ) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'CPF e e-mail informados pertencem a cadastros diferentes',
      })
    }

    const existingUser = existingUserByEmail ?? existingUserByCpf

    let doctor: Awaited<ReturnType<typeof doctorsRepository.createWithUser>>
    if (existingUser) {
      doctor = await doctorsRepository.createWithExistingUser({
        userId: existingUser.id,
        crmNumber: input.crmNumber,
        crmState,
        specialties: input.specialties,
        ...(input.planId !== undefined && { planId: input.planId }),
      })

      // Mesmo anexando o perfil de médico a um User já existente (ex.: paciente
      // do app-medcare), o e-mail de ativação precisa ser enviado — sem isso a
      // pessoa nunca fica sabendo que ganhou acesso ao portal médico.
      try {
        const activationToken = issuePasswordResetSessionToken(
          fastify,
          existingUser.id,
          env.FAMILY_MEMBER_ACTIVATION_TOKEN_EXPIRES_IN,
        )
        const link = `${env.DOCTOR_ACTIVATION_LINK_BASE_URL}?token=${activationToken}`
        const template = doctorActivationLinkTemplate(link, input.name)
        await sendMail({ to: input.email, ...template })
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err)
        console.error(`[doctors] Falha ao enviar e-mail de ativação para ${input.email}: ${cause}`)
        await recordAuditEvent({
          actorId: user.id,
          action: 'DOCTOR_ACTIVATION_EMAIL_FAILED',
          targetType: 'Doctor',
          targetId: doctor.id,
          metadata: { email: input.email, error: cause },
        })
      }
    } else {
      // Senha temporária nunca é exposta — o médico define a própria senha pelo
      // link de ativação enviado por e-mail (mesmo mecanismo de
      // familyMemberActivationLinkTemplate, ver families.service.ts).
      const temporaryPassword = generateTemporaryPassword()
      const passwordHash = await bcrypt.hash(temporaryPassword, env.BCRYPT_ROUNDS)

      doctor = await doctorsRepository.createWithUser({
        name: input.name,
        email: input.email,
        passwordHash,
        ...(input.phone !== undefined && { phone: input.phone }),
        cpfEncrypted: encryptField(cpfDigits),
        cpfHash,
        crmNumber: input.crmNumber,
        crmState,
        specialties: input.specialties,
        ...(input.planId !== undefined && { planId: input.planId }),
      })

      try {
        const activationToken = issuePasswordResetSessionToken(
          fastify,
          doctor.user.id,
          env.FAMILY_MEMBER_ACTIVATION_TOKEN_EXPIRES_IN,
        )
        const link = `${env.DOCTOR_ACTIVATION_LINK_BASE_URL}?token=${activationToken}`
        const template = doctorActivationLinkTemplate(link, input.name)
        await sendMail({ to: input.email, ...template })
      } catch (err) {
        // Best-effort: o cadastro já foi concluído, falha no e-mail não deve
        // derrubar a request — mas fica registrada em AuditLog (visível na tela
        // de Auditoria do admin) em vez de só no console.
        const cause = err instanceof Error ? err.message : String(err)
        console.error(`[doctors] Falha ao enviar e-mail de ativação para ${input.email}: ${cause}`)
        await recordAuditEvent({
          actorId: user.id,
          action: 'DOCTOR_ACTIVATION_EMAIL_FAILED',
          targetType: 'Doctor',
          targetId: doctor.id,
          metadata: { email: input.email, error: cause },
        })
      }
    }

    // Assinatura inicial é opcional — só é criada se plano + forma de pagamento +
    // endereço de cobrança vierem juntos (mesmo racional de clinicsService.create).
    if (input.planId && input.paymentMethod && input.billingAddress) {
      const plan = await plansService.getById(user, input.planId)
      await plansService.createSubscription(user, {
        planId: input.planId,
        doctorId: doctor.id,
        paymentMethod: input.paymentMethod,
        nextDueDate: computeNextDueDate(plan.billingCycle),
        billingAddress: input.billingAddress,
      })
    }

    await recordAuditEvent({
      actorId: user.id,
      action: 'CREATE_DOCTOR',
      targetType: 'Doctor',
      targetId: doctor.id,
    })
    return maskDoctorForViewer(doctor)
  },

  async list(user: AuthUser, query: ListDoctorsQuery) {
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }

    if (user.role === 'CLINIC_ADMIN') {
      const clinicId = await resolveClinicId(user.id)
      const [doctors, total] = await Promise.all([
        doctorsRepository.findManyLinkedToClinic(clinicId, pagination),
        doctorsRepository.countLinkedToClinic(clinicId),
      ])
      return { items: doctors.map(maskDoctorForViewer), total }
    }

    const filters = {
      ...(query.status && { status: query.status }),
      ...(query.specialty && { specialty: query.specialty }),
      ...(query.planId && { planId: query.planId }),
      ...(query.search && { search: query.search }),
    }
    const [doctors, total] = await Promise.all([
      doctorsRepository.findMany(filters, pagination),
      doctorsRepository.count(filters),
    ])
    return { items: doctors.map(maskDoctorForViewer), total }
  },

  async getById(user: AuthUser, id: string) {
    const doctor = await resolveScopedDoctor(user, id)
    return maskDoctorForViewer(doctor)
  },

  async getSelf(user: AuthUser) {
    const doctorId = await resolveDoctorId(user.id)
    const doctor = await doctorsRepository.findById(doctorId)
    if (!doctor) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Médico não encontrado' })
    }
    return maskDoctorForViewer(doctor)
  },

  async update(user: AuthUser, id: string, input: UpdateDoctorInput) {
    const doctor = await resolveScopedDoctor(user, id)

    if (input.crmNumber || input.crmState) {
      const crmNumber = input.crmNumber ?? doctor.crmNumber
      const crmState = (input.crmState ?? doctor.crmState).toUpperCase()
      const existing = await doctorsRepository.findByCrm(crmNumber, crmState)
      if (existing && existing.id !== id) {
        throw new AppError({ code: 'CONFLICT', message: 'CRM já cadastrado' })
      }
    }

    if (input.email !== undefined) {
      const existingUser = await doctorsRepository.findUserByEmail(input.email)
      if (existingUser && existingUser.id !== doctor.userId) {
        throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
      }
    }

    const { phone, name, email, ...doctorFields } = input
    if (phone !== undefined) {
      await doctorsRepository.updateUserPhone(doctor.userId, phone)
    }
    if (name !== undefined) {
      await doctorsRepository.updateUserName(doctor.userId, name)
    }
    if (email !== undefined) {
      await doctorsRepository.updateUserEmail(doctor.userId, email)
    }

    const updated = await doctorsRepository.update(
      id,
      omitUndefined({
        ...doctorFields,
        ...(input.crmState && { crmState: input.crmState.toUpperCase() }),
      }),
    )

    // Cascateia pra conta de login: sem isso, o toggle "Inativo" na tela admin
    // marcava só Doctor.status e o médico continuava conseguindo logar.
    if (input.status !== undefined && input.status !== doctor.status) {
      await doctorsRepository.setUserActiveStatus(doctor.userId, input.status)
    }

    await recordAuditEvent({
      actorId: user.id,
      action: 'UPDATE_DOCTOR',
      targetType: 'Doctor',
      targetId: id,
    })
    return maskDoctorForViewer(updated)
  },

  async updateSelf(user: AuthUser, input: UpdateDoctorSelfInput) {
    const doctorId = await resolveDoctorId(user.id)

    if (input.phone !== undefined) {
      await doctorsRepository.updateUserPhone(user.id, input.phone)
    }

    const { phone, ...doctorFields } = input
    const updated = await doctorsRepository.update(doctorId, omitUndefined(doctorFields))
    return maskDoctorForViewer(updated)
  },

  async deactivate(user: AuthUser, id: string) {
    const doctor = await doctorsRepository.findById(id)
    if (!doctor) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Médico não encontrado' })
    }
    await doctorsRepository.deactivateTx(doctor.id, doctor.userId)
    await recordAuditEvent({
      actorId: user.id,
      action: 'DEACTIVATE_DOCTOR',
      targetType: 'Doctor',
      targetId: id,
    })
  },

  // ── Aba "Atividade" (visão da clínica) ──────────────────────────────────────

  async listSessions(user: AuthUser, id: string) {
    const doctor = await resolveScopedDoctor(user, id)
    const sessions = await doctorsRepository.findActiveSessionsByUserId(doctor.userId)
    return sessions.map((session) => ({
      id: session.id,
      deviceLabel: session.deviceLabel ?? 'Dispositivo desconhecido',
      createdAt: session.createdAt,
    }))
  },

  async revokeSession(user: AuthUser, id: string, sessionId: string) {
    const doctor = await resolveScopedDoctor(user, id)
    await doctorsRepository.revokeSessionById(sessionId, doctor.userId)
  },

  // Todas as clínicas às quais este médico está vinculado (ativo ou não) — usada
  // na aba "Clínicas" do detalhe do médico no admin da plataforma.
  async getClinicLinks(user: AuthUser, id: string) {
    const doctor = await resolveScopedDoctor(user, id)
    const links = await doctorsRepository.findClinicLinks(doctor.id)
    return links.map((link) => ({
      id: link.id,
      clinicId: link.clinicId,
      active: link.active,
      linkedAt: link.linkedAt,
      clinic: {
        id: link.clinic.id,
        tradeName: link.clinic.tradeName,
        cnpj: maskCnpj(decryptField(link.clinic.cnpjEncrypted)),
        status: link.clinic.status,
      },
    }))
  },

  async getUsageSummary(user: AuthUser, id: string) {
    const doctor = await resolveScopedDoctor(user, id)
    const [linkedPatients, examsSent, diagnosticsSent] = await Promise.all([
      doctorsRepository.countLinkedPatients(doctor.id),
      doctorsRepository.countExamsByDoctor(doctor.id),
      doctorsRepository.countDiagnosticsByDoctor(doctor.id),
    ])
    return { linkedPatients, examsSent, diagnosticsSent }
  },
}
