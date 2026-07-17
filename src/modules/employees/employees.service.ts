import { AppError } from '../../shared/errors/index.js'
import { recordAuditEvent } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { omitUndefined } from '../../shared/utils/index.js'
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

  async create(actor: AuthUser, input: CreateEmployeeInput) {
    const existing = await employeesRepository.findByEmail(input.email)
    if (existing) {
      throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
    }
    const employee = await employeesRepository.create(omitUndefined(input))
    await recordAuditEvent({
      actorId: actor.id,
      action: 'CREATE_EMPLOYEE',
      targetType: 'Employee',
      targetId: employee.id,
    })
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
    await recordAuditEvent({
      actorId: actor.id,
      action: 'DELETE_EMPLOYEE',
      targetType: 'Employee',
      targetId: id,
    })
  },
}
