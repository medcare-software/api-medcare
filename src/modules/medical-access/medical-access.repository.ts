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
    return db.medicalAccessGrant.update({ where: { id }, data: { ...data, status: 'ACTIVE' } })
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

  findManyHeldByDoctor(doctorId: string) {
    return db.medicalAccessGrant.findMany({
      where: { doctorId, status: 'ACTIVE' },
      include: { member: { select: { id: true, displayName: true } } },
      orderBy: { grantedAt: 'desc' },
    })
  },

  findManyHeldByClinic(clinicId: string) {
    return db.medicalAccessGrant.findMany({
      where: { clinicId, status: 'ACTIVE' },
      include: { member: { select: { id: true, displayName: true } } },
      orderBy: { grantedAt: 'desc' },
    })
  },
}
