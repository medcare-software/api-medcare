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
  email?: string
  phone: string
  address: Prisma.InputJsonValue
  planId?: string
  adminName: string
  adminEmail: string
  adminPasswordHash: string
  adminPhone?: string
}

type CreateClinicWithExistingAdminData = {
  legalNameEncrypted: Buffer<ArrayBuffer>
  tradeName: string
  cnpjEncrypted: Buffer<ArrayBuffer>
  cnpjHash: string
  email?: string
  phone: string
  address: Prisma.InputJsonValue
  planId?: string
  adminUserId: string
}

export const clinicsRepository = {
  findUserByEmail(email: string) {
    return db.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { clinicAdminProfile: true },
    })
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

  count(filters: ClinicListFilters) {
    return db.clinic.count({
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
    })
  },

  findById(id: string) {
    return db.clinic.findFirst({ where: { id, deletedAt: null } })
  },

  // Clinic não guarda o userId do admin diretamente — o vínculo é via
  // ClinicAdminProfile (userId + clinicId). Usado pra cascatear o status da
  // clínica pra conta de login do admin (ver setUserActiveStatus).
  async findAdminUserId(clinicId: string) {
    const profile = await db.clinicAdminProfile.findFirst({ where: { clinicId } })
    return profile?.userId ?? null
  },

  // Cascateia o status da clínica pra conta de login do admin — sem isso,
  // inativar/excluir uma clínica não derrubava o acesso do CLINIC_ADMIN.
  async setUserActiveStatus(userId: string, status: UserStatus) {
    await db.user.update({ where: { id: userId }, data: { status } })
    if (status === 'INACTIVE') {
      await db.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true, revokedAt: new Date() },
      })
    }
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

      return { clinic, adminUserId: adminUser.id }
    })
  },

  // E-mail do admin já pertence a um User existente (ex.: paciente do app-medcare)
  // sem perfil de clínica — anexa o novo perfil a esse User em vez de criar um
  // segundo User com o mesmo e-mail (email é @unique). Ver clinics.service.ts#create.
  createWithExistingAdmin(input: CreateClinicWithExistingAdminData) {
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

      await tx.clinicAdminProfile.create({
        data: { userId: input.adminUserId, clinicId: clinic.id },
      })

      return clinic
    })
  },

  update(id: string, data: ClinicUpdateData) {
    return db.clinic.update({ where: { id }, data: omitUndefined(data) })
  },

  deactivateTx(clinicId: string, adminUserId: string | null) {
    return db.$transaction([
      db.clinic.update({
        where: { id: clinicId },
        data: {
          deletedAt: new Date(),
          status: 'INACTIVE',
          // Libera o CNPJ pra reuso: cnpjHash é @unique no schema e não pode
          // ficar preso a uma clínica excluída — sem isso, recadastrar com o
          // mesmo CNPJ falha com "já cadastrado" mesmo o registro antigo
          // estando excluído (mesmo racional do CRM em doctors.repository.ts).
          cnpjHash: `deleted:${clinicId}`,
        },
      }),
      db.clinicDoctorLink.updateMany({ where: { clinicId }, data: { active: false } }),
      // Sem isso, a assinatura ficaria ACTIVE indefinidamente e continuaria
      // entrando no MRR do dashboard mesmo com a clínica excluída.
      db.subscription.updateMany({
        where: { clinicId, status: { in: ['ACTIVE', 'LATE'] } },
        data: { status: 'CANCELLED' },
      }),
      // Sem isso, excluir a clínica não derrubava o acesso do CLINIC_ADMIN —
      // mesmo racional de doctors.repository.ts#deactivateTx.
      ...(adminUserId
        ? [
            db.user.update({
              where: { id: adminUserId },
              data: {
                deletedAt: new Date(),
                status: 'INACTIVE',
                // E-mail é @unique — sem renomear, recadastrar uma clínica com o
                // mesmo e-mail de admin falha com "já cadastrado" (mesmo racional
                // do CNPJ acima e de doctors.repository.ts#deactivateTx).
                email: `deleted+${adminUserId}.${Date.now()}@deleted.local`,
              },
            }),
            db.refreshToken.updateMany({
              where: { userId: adminUserId, revoked: false },
              data: { revoked: true, revokedAt: new Date() },
            }),
          ]
        : []),
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

  unlinkDoctor(clinicId: string, doctorId: string) {
    return db.clinicDoctorLink.delete({ where: { clinicId_doctorId: { clinicId, doctorId } } })
  },

  countActiveDoctorLinks(clinicId: string) {
    return db.clinicDoctorLink.count({ where: { clinicId, active: true } })
  },
}
