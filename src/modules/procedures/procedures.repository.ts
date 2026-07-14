import { db } from '../../config/database.js'

interface CreateProcedureData {
  memberId: string
  doctorId: string
  title: string
  status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  descriptionEncrypted?: Buffer<ArrayBuffer>
  performedAt: Date
}

interface UpdateProcedureData {
  title?: string
  status?: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  descriptionEncrypted?: Buffer<ArrayBuffer>
  performedAt?: Date
}

// Doctor não tem campo de nome hoje — expõe o CRM como identificador do médico
// autor, mesmo padrão já usado em diagnostics.repository.ts.
const DOCTOR_SELECT = { select: { crmNumber: true, crmState: true } }

export const proceduresRepository = {
  findManyByMemberId(memberId: string) {
    return db.procedure.findMany({
      where: { memberId },
      orderBy: { performedAt: 'desc' },
      include: { doctor: DOCTOR_SELECT },
    })
  },

  findById(id: string) {
    return db.procedure.findUnique({ where: { id } })
  },

  create(data: CreateProcedureData) {
    return db.procedure.create({ data })
  },

  update(id: string, data: UpdateProcedureData) {
    return db.procedure.update({ where: { id }, data })
  },
}
