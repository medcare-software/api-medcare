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

// Doctor não tem campo de nome hoje (schema só tem crmNumber/crmState) — expõe o
// CRM como identificador do médico autor até haver um campo de nome no modelo.
const DOCTOR_SELECT = { select: { crmNumber: true, crmState: true } }

export const diagnosticsRepository = {
  findManyByMemberId(memberId: string) {
    return db.diagnostic.findMany({
      where: { memberId },
      orderBy: { diagnosedAt: 'desc' },
      include: { doctor: DOCTOR_SELECT },
    })
  },

  findById(id: string) {
    return db.diagnostic.findUnique({ where: { id }, include: { doctor: DOCTOR_SELECT } })
  },

  create(data: CreateDiagnosticData) {
    return db.diagnostic.create({ data })
  },

  update(id: string, data: UpdateDiagnosticData) {
    return db.diagnostic.update({ where: { id }, data })
  },
}
