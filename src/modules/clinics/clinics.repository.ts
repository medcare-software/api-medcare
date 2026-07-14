import type { Prisma, UserStatus } from '@prisma/client'

import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'

type ClinicListFilters = {
  status?: UserStatus
  search?: string
}

type ClinicUpdateData = {
  legalNameEncrypted?: Buffer<ArrayBuffer>
  tradeName?: string
  cnpjEncrypted?: Buffer<ArrayBuffer>
  cnpjHash?: string
  email?: string
  phone?: string
  address?: Prisma.InputJsonValue
  planId?: string | null
  status?: UserStatus
}

type CreateClinicWithAdminData = {
  legalNameEncrypted: Buffer<ArrayBuffer>
  tradeName: string
  cnpjEncrypted: Buffer<ArrayBuffer>
  cnpjHash: string
  email: string
  phone: string
  address: Prisma.InputJsonValue
  planId?: string
  adminName: string
  adminEmail: string
  adminPasswordHash: string
  adminPhone?: string
}

export const clinicsRepository = {
  findUserByEmail(email: string) {
    return db.user.findUnique({ where: { email: email.toLowerCase() } })
  },

  findByCnpjHash(cnpjHash: string) {
    return db.clinic.findUnique({ where: { cnpjHash } })
  },

  findMany(filters: ClinicListFilters, pagination: { skip: number; take: number }) {
    return db.clinic.findMany({
      where: {
        deletedAt: null,
        ...(filters.status && { status: filters.status }),
        ...(filters.search && {
          OR: [
            { tradeName: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { createdAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take,
    })
  },

  findById(id: string) {
    return db.clinic.findFirst({ where: { id, deletedAt: null } })
  },

  createWithAdmin(input: CreateClinicWithAdminData) {
    return db.$transaction(async (tx) => {
      const clinic = await tx.clinic.create({
        data: omitUndefined({
          legalNameEncrypted: input.legalNameEncrypted,
          tradeName: input.tradeName,
          cnpjEncrypted: input.cnpjEncrypted,
          cnpjHash: input.cnpjHash,
          email: input.email,
          phone: input.phone,
          address: input.address,
          planId: input.planId,
          status: 'ACTIVE',
        }),
      })

      const adminUser = await tx.user.create({
        data: omitUndefined({
          name: input.adminName,
          email: input.adminEmail.toLowerCase(),
          passwordHash: input.adminPasswordHash,
          role: 'CLINIC_ADMIN',
          phone: input.adminPhone,
          status: 'ACTIVE',
        }),
      })

      await tx.clinicAdminProfile.create({
        data: { userId: adminUser.id, clinicId: clinic.id },
      })

      return clinic
    })
  },

  update(id: string, data: ClinicUpdateData) {
    return db.clinic.update({ where: { id }, data: omitUndefined(data) })
  },

  deactivateTx(clinicId: string) {
    return db.$transaction([
      db.clinic.update({
        where: { id: clinicId },
        data: { deletedAt: new Date(), status: 'INACTIVE' },
      }),
      db.clinicDoctorLink.updateMany({ where: { clinicId }, data: { active: false } }),
    ])
  },

  findDoctorLinks(clinicId: string, includeInactive: boolean) {
    return db.clinicDoctorLink.findMany({
      where: { clinicId, ...(includeInactive ? {} : { active: true }) },
      include: {
        doctor: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                status: true,
                cpfEncrypted: true,
              },
            },
          },
        },
      },
      orderBy: { linkedAt: 'desc' },
    })
  },

  findLink(clinicId: string, doctorId: string) {
    return db.clinicDoctorLink.findUnique({ where: { clinicId_doctorId: { clinicId, doctorId } } })
  },

  findDoctorById(doctorId: string) {
    return db.doctor.findFirst({ where: { id: doctorId, deletedAt: null } })
  },

  upsertLink(clinicId: string, doctorId: string) {
    return db.clinicDoctorLink.upsert({
      where: { clinicId_doctorId: { clinicId, doctorId } },
      create: { clinicId, doctorId, active: true },
      update: { active: true },
    })
  },

  toggleLink(clinicId: string, doctorId: string, active: boolean) {
    return db.clinicDoctorLink.update({
      where: { clinicId_doctorId: { clinicId, doctorId } },
      data: { active },
    })
  },
}
