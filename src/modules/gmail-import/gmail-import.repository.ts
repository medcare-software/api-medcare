import type { ExamType, GmailImportStatus } from '@prisma/client'
import type { Prisma } from '@prisma/client'

import { db } from '../../config/database.js'

export const gmailImportRepository = {
  findConnectedIntegrations() {
    return db.gmailIntegration.findMany({ where: { status: 'CONNECTED', autoImportEnabled: true } })
  },

  findActiveLabEmails() {
    return db.labEmail.findMany({ where: { status: 'ACTIVE' } })
  },

  async findExistingMessageIds(
    gmailIntegrationId: string,
    messageIds: string[],
  ): Promise<Set<string>> {
    const rows = await db.gmailImportedExam.findMany({
      where: { gmailIntegrationId, gmailMessageId: { in: messageIds } },
      select: { gmailMessageId: true },
    })
    return new Set(rows.map((r) => r.gmailMessageId))
  },

  createImportedExam(data: {
    gmailIntegrationId: string
    gmailMessageId: string
    suggestedMemberId?: string
    fileId?: string
    extractedSummary: Prisma.InputJsonValue
    status: GmailImportStatus
    resolvedExamId?: string
  }) {
    return db.gmailImportedExam.create({ data })
  },

  updateTokens(
    userId: string,
    data: { accessTokenEncrypted: Buffer<ArrayBuffer>; tokenExpiresAt: Date },
  ) {
    return db.gmailIntegration.update({ where: { userId }, data })
  },

  touchLastVerifiedAt(userId: string, date: Date) {
    return db.gmailIntegration.update({ where: { userId }, data: { lastVerifiedAt: date } })
  },

  incrementImportedCount(userId: string) {
    return db.gmailIntegration.update({
      where: { userId },
      data: { importedCount: { increment: 1 } },
    })
  },

  // Cuidador nunca tem GmailIntegration própria (só PATIENT_ADMIN/FAMILY_MEMBER
  // conectam, ver gmail-integration.routes.ts) — o dono do e-mail é sempre um
  // FamilyMember com login próprio.
  async findFamilyMembersByUserId(userId: string) {
    const own = await db.familyMember.findFirst({ where: { userId }, select: { familyId: true } })
    if (!own) return []
    return db.familyMember.findMany({ where: { familyId: own.familyId } })
  },

  createExam(data: {
    memberId: string
    name: string
    examType: ExamType
    examDate: Date
    fileId?: string
  }) {
    return db.exam.create({ data: { ...data, source: 'GMAIL' } })
  },

  countPendingByUserId(userId: string) {
    return db.gmailImportedExam.count({
      where: { status: 'PENDING', gmailIntegration: { userId } },
    })
  },
}
