import { AppError } from '../../shared/errors/index.js'
import { recordAuditEvent } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { omitUndefined } from '../../shared/utils/index.js'
import { labEmailsRepository } from './lab-emails.repository.js'
import type {
  CreateLabEmailInput,
  ListLabEmailsQuery,
  UpdateLabEmailInput,
} from './lab-emails.schema.js'

export const labEmailsService = {
  async list(query: ListLabEmailsQuery) {
    const filters = {
      ...(query.status && { status: query.status }),
      ...(query.search && { search: query.search }),
    }
    const pagination = { skip: (query.page - 1) * query.pageSize, take: query.pageSize }
    const [items, total] = await Promise.all([
      labEmailsRepository.findMany(filters, pagination),
      labEmailsRepository.count(filters),
    ])
    return { items, total }
  },

  async getById(id: string) {
    const labEmail = await labEmailsRepository.findById(id)
    if (!labEmail) {
      throw new AppError({ code: 'NOT_FOUND', message: 'E-mail de laboratório não encontrado' })
    }
    return labEmail
  },

  async create(actor: AuthUser, input: CreateLabEmailInput) {
    const existing = await labEmailsRepository.findByEmail(input.email)
    if (existing) {
      throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
    }

    const labEmail = await labEmailsRepository.create(input)

    await recordAuditEvent({
      actorId: actor.id,
      action: 'CREATE_LAB_EMAIL',
      targetType: 'LabEmail',
      targetId: labEmail.id,
    })

    return labEmail
  },

  async update(actor: AuthUser, id: string, input: UpdateLabEmailInput) {
    const labEmail = await labEmailsRepository.findById(id)
    if (!labEmail) {
      throw new AppError({ code: 'NOT_FOUND', message: 'E-mail de laboratório não encontrado' })
    }
    if (input.email) {
      const existing = await labEmailsRepository.findByEmail(input.email)
      if (existing && existing.id !== id) {
        throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
      }
    }
    const updated = await labEmailsRepository.update(id, omitUndefined(input))

    await recordAuditEvent({
      actorId: actor.id,
      action: 'UPDATE_LAB_EMAIL',
      targetType: 'LabEmail',
      targetId: id,
    })
    return updated
  },

  async delete(actor: AuthUser, id: string) {
    const labEmail = await labEmailsRepository.findById(id)
    if (!labEmail) {
      throw new AppError({ code: 'NOT_FOUND', message: 'E-mail de laboratório não encontrado' })
    }
    await labEmailsRepository.softDelete(id)
    await recordAuditEvent({
      actorId: actor.id,
      action: 'DELETE_LAB_EMAIL',
      targetType: 'LabEmail',
      targetId: id,
    })
  },
}
