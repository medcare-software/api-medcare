import type { UserStatus } from '@prisma/client'

import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'

// cpfEncrypted é buscado aqui só para a service mascarar (maskCpf) na saída —
// nunca retornado em texto plano para CLINIC_ADMIN/PLATFORM_ADMIN neste módulo.
const doctorInclude = {
  user: {
    select: { id: true, name: true, email: true, phone: true, status: true, cpfEncrypted: true },
  },
} as const

type DoctorListFilters = {
  status?: UserStatus
  specialty?: string
  search?: string
}

type DoctorUpdateData = {
  crmNumber?: string
  crmState?: string
  specialties?: string[]
  planId?: string | null
  status?: UserStatus
}

type CreateDoctorWithUserData = {
  name: string
  email: string
  passwordHash: string
  phone?: string
  cpfEncrypted: Buffer<ArrayBuffer>
  cpfHash: string
  crmNumber: string
  crmState: string
  specialties: string[]
  planId?: string
}

export const doctorsRepository = {
  findUserByEmail(email: string) {
    return db.user.findUnique({ where: { email: email.toLowerCase() } })
  },

  findByCrm(crmNumber: string, crmState: string) {
    return db.doctor.findUnique({ where: { crmNumber_crmState: { crmNumber, crmState } } })
  },

  findMany(filters: DoctorListFilters, pagination: { skip: number; take: number }) {
    return db.doctor.findMany({
      where: {
        deletedAt: null,
        ...(filters.status && { status: filters.status }),
        ...(filters.specialty && { specialties: { has: filters.specialty } }),
        ...(filters.search && {
          OR: [
            { crmNumber: { contains: filters.search, mode: 'insensitive' } },
            { user: { email: { contains: filters.search, mode: 'insensitive' } } },
          ],
        }),
      },
      include: doctorInclude,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  findManyLinkedToClinic(clinicId: string, pagination: { skip: number; take: number }) {
    return db.doctor.findMany({
      where: { deletedAt: null, clinics: { some: { clinicId, active: true } } },
      include: doctorInclude,
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  findById(id: string) {
    return db.doctor.findFirst({ where: { id, deletedAt: null }, include: doctorInclude })
  },

  findLinkedToClinic(id: string, clinicId: string) {
    return db.doctor.findFirst({
      where: { id, deletedAt: null, clinics: { some: { clinicId, active: true } } },
      include: doctorInclude,
    })
  },

  createWithUser(input: CreateDoctorWithUserData) {
    return db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: omitUndefined({
          name: input.name,
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
          role: 'DOCTOR',
          phone: input.phone,
          cpfEncrypted: input.cpfEncrypted,
          cpfHash: input.cpfHash,
          status: 'ACTIVE',
        }),
      })

      return tx.doctor.create({
        data: omitUndefined({
          userId: user.id,
          crmNumber: input.crmNumber,
          crmState: input.crmState,
          specialties: input.specialties,
          planId: input.planId,
          status: 'ACTIVE',
        }),
        include: doctorInclude,
      })
    })
  },

  update(id: string, data: DoctorUpdateData) {
    return db.doctor.update({ where: { id }, data: omitUndefined(data), include: doctorInclude })
  },

  updateUserPhone(userId: string, phone: string) {
    return db.user.update({ where: { id: userId }, data: { phone } })
  },

  updateUserName(userId: string, name: string) {
    return db.user.update({ where: { id: userId }, data: { name } })
  },

  deactivateTx(doctorId: string, userId: string) {
    return db.$transaction([
      db.doctor.update({
        where: { id: doctorId },
        data: { deletedAt: new Date(), status: 'INACTIVE' },
      }),
      db.user.update({
        where: { id: userId },
        data: { deletedAt: new Date(), status: 'INACTIVE' },
      }),
      db.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      }),
    ])
  },
}
