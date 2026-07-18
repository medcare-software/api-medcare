import type { AccessValidity } from '@prisma/client'

import { db } from '../../config/database.js'

interface ActivateGrantData {
  doctorId?: string
  clinicId?: string
  grantedAt: Date
  expiresAt: Date | null
}

export const medicalAccessRepository = {
  create(data: {
    memberId: string
    codeHash: string
    validity: AccessValidity
    temporaryDays?: number
    expiresAt: Date
  }) {
    return db.medicalAccessGrant.create({ data })
  },

  findByCodeHash(codeHash: string) {
    return db.medicalAccessGrant.findUnique({ where: { codeHash } })
  },

  activate(id: string, data: ActivateGrantData) {
    return db.medicalAccessGrant.update({
      where: { id },
      data: { ...data, status: 'ACTIVE' },
      include: {
        member: { select: { id: true, displayName: true, birthDate: true, biologicalSex: true } },
      },
    })
  },

  markExpired(id: string) {
    return db.medicalAccessGrant.update({ where: { id }, data: { status: 'EXPIRED' } })
  },

  findManyByMemberIds(memberIds: string[]) {
    return db.medicalAccessGrant.findMany({
      where: { memberId: { in: memberIds } },
      orderBy: { createdAt: 'desc' },
    })
  },

  findByIdScoped(id: string, memberIds: string[]) {
    return db.medicalAccessGrant.findFirst({ where: { id, memberId: { in: memberIds } } })
  },

  revoke(id: string) {
    return db.medicalAccessGrant.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    })
  },

  // Sem filtro de status: a clínica/médico também precisa ver grants expirados/
  // revogados na própria listagem (coluna "Status" e KPIs da tela de acessos).
  findManyHeldByDoctor(doctorId: string) {
    return db.medicalAccessGrant.findMany({
      where: { doctorId },
      include: {
        member: { select: { id: true, displayName: true, birthDate: true, biologicalSex: true } },
      },
      orderBy: { grantedAt: 'desc' },
    })
  },

  findManyHeldByClinic(clinicId: string) {
    return db.medicalAccessGrant.findMany({
      where: { clinicId },
      include: {
        member: { select: { id: true, displayName: true, birthDate: true, biologicalSex: true } },
      },
      orderBy: { grantedAt: 'desc' },
    })
  },
}
