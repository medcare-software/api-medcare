import { db } from '../../config/database.js'

interface CreateDiagnosticData {
  memberId: string
  doctorId: string
  title: string
  descriptionEncrypted: Buffer<ArrayBuffer>
  conductEncrypted: Buffer<ArrayBuffer>
  diagnosedAt: Date
}

interface UpdateDiagnosticData {
  title?: string
  descriptionEncrypted?: Buffer<ArrayBuffer>
  conductEncrypted?: Buffer<ArrayBuffer>
  diagnosedAt?: Date
}

export const diagnosticsRepository = {
  findManyByMemberId(memberId: string) {
    return db.diagnostic.findMany({ where: { memberId }, orderBy: { diagnosedAt: 'desc' } })
  },

  findById(id: string) {
    return db.diagnostic.findUnique({ where: { id } })
  },

  create(data: CreateDiagnosticData) {
    return db.diagnostic.create({ data })
  },

  update(id: string, data: UpdateDiagnosticData) {
    return db.diagnostic.update({ where: { id }, data })
  },
}
