import { Prisma } from '@prisma/client'

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
    const existingAny = await labEmailsRepository.findByEmailAny(input.email)
    if (existingAny && !existingAny.deletedAt) {
      throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
    }

    let labEmail
    try {
      if (existingAny?.deletedAt) {
        // Soft-deleted ainda ocupava o UNIQUE — reativa em vez de inserir de novo.
        labEmail = await labEmailsRepository.restore(existingAny.id, input)
      } else {
        labEmail = await labEmailsRepository.create(input)
      }
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
      }
      throw err
    }

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
      const existing = await labEmailsRepository.findByEmailAny(input.email)
      if (existing && existing.id !== id && !existing.deletedAt) {
        throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
      }
      // Se o e-mail alvo está soft-deleted em outro registro, libera o UNIQUE
      // renomeando aquele registro antes de aplicar o update.
      if (existing && existing.id !== id && existing.deletedAt) {
        await labEmailsRepository.softDelete(existing.id, existing.email)
      }
    }

    let updated
    try {
      updated = await labEmailsRepository.update(id, omitUndefined(input))
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new AppError({ code: 'CONFLICT', message: 'E-mail já cadastrado' })
      }
      throw err
    }

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
    await labEmailsRepository.softDelete(id, labEmail.email)
    await recordAuditEvent({
      actorId: actor.id,
      action: 'DELETE_LAB_EMAIL',
      targetType: 'LabEmail',
      targetId: id,
    })
  },
}
