import { db } from '../../config/database.js'

export const caregiverRepository = {
  createInvite(data: { familyId: string; email: string; codeHash: string; expiresAt: Date }) {
    return db.caregiverInvite.create({ data })
  },

  findInviteByCodeHash(codeHash: string) {
    return db.caregiverInvite.findUnique({ where: { codeHash } })
  },

  findManyInvitesByFamilyId(familyId: string) {
    return db.caregiverInvite.findMany({
      where: { familyId },
      orderBy: { createdAt: 'desc' },
    })
  },

  findInviteByIdScoped(id: string, familyId: string) {
    return db.caregiverInvite.findFirst({ where: { id, familyId } })
  },

  markInviteRedeemed(id: string) {
    return db.caregiverInvite.update({
      where: { id },
      data: { status: 'ACTIVE', redeemedAt: new Date() },
    })
  },

  markInviteExpired(id: string) {
    return db.caregiverInvite.update({ where: { id }, data: { status: 'EXPIRED' } })
  },

  revokeInvite(id: string) {
    return db.caregiverInvite.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    })
  },

  findFamilyById(id: string) {
    return db.family.findUnique({ where: { id } })
  },

  findCaregiverAccess(caregiverId: string, familyId: string) {
    return db.caregiverAccess.findFirst({ where: { caregiverId, familyId } })
  },

  activateCaregiverAccess(caregiverId: string, familyId: string, existingId?: string) {
    if (existingId) {
      return db.caregiverAccess.update({
        where: { id: existingId },
        data: { status: 'ACTIVE', grantedAt: new Date(), expiresAt: null, revokedAt: null },
      })
    }
    return db.caregiverAccess.create({
      data: { caregiverId, familyId, status: 'ACTIVE', grantedAt: new Date() },
    })
  },

  findFamiliesForCaregiver(caregiverId: string) {
    return db.caregiverAccess.findMany({
      where: {
        caregiverId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { family: { select: { id: true, name: true } } },
      orderBy: { grantedAt: 'desc' },
    })
  },
}
