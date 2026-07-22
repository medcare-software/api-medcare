import type { UserStatus } from '@prisma/client'

import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'

type EmployeeListFilters = {
  status?: UserStatus
  search?: string
}

type CreateEmployeeData = {
  name: string
  email: string
  phone?: string
  profileLabel: string
}

type CreateEmployeeWithUserData = {
  name: string
  email: string
  passwordHash: string
  phone?: string
  profileLabel: string
}

type UpdateEmployeeData = {
  name?: string
  email?: string
  phone?: string
  profileLabel?: string
  status?: UserStatus
}

export const employeesRepository = {
  findByEmail(email: string) {
    return db.employee.findFirst({ where: { email: email.toLowerCase(), deletedAt: null } })
  },

  // Checagem de conflito de e-mail contra a tabela `users` — a conta de login
  // do funcionário (role PLATFORM_ADMIN) mora lá, não em `employees`.
  findUserByEmail(email: string) {
    return db.user.findUnique({ where: { email: email.toLowerCase() } })
  },

  findMany(filters: EmployeeListFilters, pagination: { skip: number; take: number }) {
    return db.employee.findMany({
      where: {
        deletedAt: null,
        ...(filters.status && { status: filters.status }),
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  count(filters: EmployeeListFilters) {
    return db.employee.count({
      where: {
        deletedAt: null,
        ...(filters.status && { status: filters.status }),
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
    })
  },

  findById(id: string) {
    return db.employee.findFirst({ where: { id, deletedAt: null } })
  },

  create(data: CreateEmployeeData) {
    return db.employee.create({
      data: omitUndefined({ ...data, email: data.email.toLowerCase(), status: 'ACTIVE' }),
    })
  },

  // Cria a conta de login (User, role PLATFORM_ADMIN) e o perfil de funcionário
  // numa única transação — mesmo padrão de doctorsRepository.createWithUser.
  createWithUser(input: CreateEmployeeWithUserData) {
    return db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
          role: 'PLATFORM_ADMIN',
          ...(input.phone !== undefined && { phone: input.phone }),
          status: 'ACTIVE',
        },
      })

      return tx.employee.create({
        data: omitUndefined({
          userId: user.id,
          name: input.name,
          email: input.email.toLowerCase(),
          phone: input.phone,
          profileLabel: input.profileLabel,
          status: 'ACTIVE',
        }),
      })
    })
  },

  update(id: string, data: UpdateEmployeeData) {
    return db.employee.update({
      where: { id },
      data: omitUndefined({ ...data, ...(data.email && { email: data.email.toLowerCase() }) }),
    })
  },

  // Cascateia o status do funcionário pra conta de login vinculada — inativar
  // precisa derrubar o acesso de verdade, não só marcar o registro do roster
  // (mesmo racional de doctors.repository.ts#deactivateTx).
  async setUserActiveStatus(userId: string, status: UserStatus) {
    await db.user.update({ where: { id: userId }, data: { status } })
    if (status === 'INACTIVE') {
      await db.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      })
    }
  },

  softDelete(id: string) {
    return db.employee.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    })
  },
}
