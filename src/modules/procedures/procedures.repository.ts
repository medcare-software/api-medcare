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

export const proceduresRepository = {
  findManyByMemberId(memberId: string) {
    return db.procedure.findMany({ where: { memberId }, orderBy: { performedAt: 'desc' } })
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
