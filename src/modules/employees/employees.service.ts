import bcrypt from 'bcryptjs'
import type { FastifyInstance } from 'fastify'

import { env } from '../../config/env.js'
import { AppError } from '../../shared/errors/index.js'
import { employeeActivationLinkTemplate, sendMail } from '../../shared/mail/index.js'
import { generateTemporaryPassword, recordAuditEvent } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { omitUndefined } from '../../shared/utils/index.js'
import { issuePasswordResetSessionToken } from '../auth/auth.service.js'
import { employeesRepository } from './employees.repository.js'
import type {
  CreateEmployeeInput,
  ListEmployeesQuery,
  UpdateEmployeeInput,
} from './employees.schema.js'

export const employeesService = {
  async list(query: ListEmployeesQuery) {
    const filters = {
      ...(query.status && { status: query.status }),
      ...(query.search && { search: query.search }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const [items, total] = await Promise.all([
      employeesRepository.findMany(filters, pagination),
      employeesRepository.count(filters),
    ])
    return { items, total }
  },

  async getById(id: string) {
    const employee = await employeesRepository.findById(id)
    if (!employee) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Funcionário não encontrado' })
    }
    return employee
  },

  async create(fastify: FastifyInstance, actor: AuthUser, input: CreateEmployeeInput) {
    const existingEmployee = await employeesRepository.findByEmail(input.email)
    if (existingEmployee) {
      throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
    }
    // A conta de login do funcionário mora na tabela `users` (role PLATFORM_ADMIN)
    // — bloqueia se o e-mail já pertence a qualquer conta existente (médico,
    // admin de clínica, usuário do app etc.), pra nunca conceder acesso de
    // plataforma a alguém sem querer.
    const existingUser = await employeesRepository.findUserByEmail(input.email)
    if (existingUser) {
      throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
    }

    // Senha temporária nunca é exposta — o funcionário define a própria senha
    // pelo link de ativação enviado por e-mail (mesmo mecanismo do médico).
    const temporaryPassword = generateTemporaryPassword()
    const passwordHash = await bcrypt.hash(temporaryPassword, env.BCRYPT_ROUNDS)

    // Perfis de acesso ainda não existem de verdade (ACCESS_PROFILES é mockado no
    // front) — por enquanto, todo funcionário cadastrado recebe esse rótulo fixo.
    const employee = await employeesRepository.createWithUser({
      name: input.name,
      email: input.email,
      passwordHash,
      ...(input.phone !== undefined && { phone: input.phone }),
      profileLabel: input.profileLabel ?? 'Administrador',
    })

    await recordAuditEvent({
      actorId: actor.id,
      action: 'CREATE_EMPLOYEE',
      targetType: 'Employee',
      targetId: employee.id,
    })

    try {
      const activationToken = issuePasswordResetSessionToken(
        fastify,
        employee.userId as string,
        env.FAMILY_MEMBER_ACTIVATION_TOKEN_EXPIRES_IN,
      )
      const link = `${env.DOCTOR_ACTIVATION_LINK_BASE_URL}?token=${activationToken}`
      const template = employeeActivationLinkTemplate(link, input.name)
      await sendMail({ to: input.email, ...template })
    } catch (err) {
      // Best-effort: o cadastro já foi concluído, falha no e-mail não deve
      // derrubar a request — mas fica registrada em AuditLog (visível na tela
      // de Auditoria do admin) em vez de só no console.
      const cause = err instanceof Error ? err.message : String(err)
      console.error(`[employees] Falha ao enviar e-mail de ativação para ${input.email}: ${cause}`)
      await recordAuditEvent({
        actorId: actor.id,
        action: 'EMPLOYEE_ACTIVATION_EMAIL_FAILED',
        targetType: 'Employee',
        targetId: employee.id,
        metadata: { email: input.email, error: cause },
      })
    }

    return employee
  },

  async update(actor: AuthUser, id: string, input: UpdateEmployeeInput) {
    const employee = await employeesRepository.findById(id)
    if (!employee) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Funcionário não encontrado' })
    }
    if (input.email) {
      const existing = await employeesRepository.findByEmail(input.email)
      if (existing && existing.id !== id) {
        throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
      }
    }
    const updated = await employeesRepository.update(id, omitUndefined(input))

    // Cascateia pra conta de login vinculada: inativar o funcionário precisa
    // derrubar o acesso de verdade, não só marcar o registro do roster (mesmo
    // ajuste feito pra médico/clínica).
    if (input.status !== undefined && input.status !== employee.status && employee.userId) {
      await employeesRepository.setUserActiveStatus(employee.userId, input.status)
    }

    await recordAuditEvent({
      actorId: actor.id,
      action: 'UPDATE_EMPLOYEE',
      targetType: 'Employee',
      targetId: id,
    })
    return updated
  },

  async delete(actor: AuthUser, id: string) {
    const employee = await employeesRepository.findById(id)
    if (!employee) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Funcionário não encontrado' })
    }
    await employeesRepository.softDelete(id)
    // Excluir precisa derrubar o acesso de verdade também — sem isso, a conta
    // de login (User) ficava ACTIVE mesmo com o funcionário já excluído.
    if (employee.userId) {
      await employeesRepository.setUserActiveStatus(employee.userId, 'INACTIVE')
    }
    await recordAuditEvent({
      actorId: actor.id,
      action: 'DELETE_EMPLOYEE',
      targetType: 'Employee',
      targetId: id,
    })
  },
}
