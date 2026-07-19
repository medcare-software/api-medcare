import type { AccessStatus, AccessValidity } from '@prisma/client'

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

  // `status` opcional: sem ele, a clínica/médico também precisa ver grants
  // expirados/revogados na própria listagem (coluna "Status" e KPIs da tela de
  // acessos). O consumidor "meus pacientes" do médico passa status=ACTIVE.
  findManyHeldByDoctor(doctorId: string, status?: AccessStatus) {
    return db.medicalAccessGrant.findMany({
      where: { doctorId, ...(status && { status }) },
      include: {
        member: { select: { id: true, displayName: true, birthDate: true, biologicalSex: true } },
      },
      orderBy: { grantedAt: 'desc' },
    })
  },

  findManyHeldByClinic(clinicId: string, status?: AccessStatus) {
    return db.medicalAccessGrant.findMany({
      where: { clinicId, ...(status && { status }) },
      include: {
        member: { select: { id: true, displayName: true, birthDate: true, biologicalSex: true } },
      },
      orderBy: { grantedAt: 'desc' },
    })
  },
}
