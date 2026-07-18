import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'
import type { CreateExamInput, UpdateExamInput } from './exams.schema.js'

// Doctor não tem campo de nome hoje — expõe o CRM como identificador do médico
// autor, mesmo padrão já usado em diagnostics.repository.ts.
const DOCTOR_SELECT = { select: { crmNumber: true, crmState: true } }

type ExamCreateData = Omit<CreateExamInput, 'memberId' | 'observations'> & {
  doctorId?: string
  observationsEncrypted?: Buffer<ArrayBuffer>
}

type ExamUpdateData = Omit<UpdateExamInput, 'observations'> & {
  observationsEncrypted?: Buffer<ArrayBuffer>
}

export const examsRepository = {
  findManyByMemberIds(memberIds: string[]) {
    return db.exam.findMany({
      where: { memberId: { in: memberIds } },
      orderBy: { examDate: 'desc' },
      include: { doctor: DOCTOR_SELECT },
    })
  },

  findByIdScoped(id: string, memberIds: string[]) {
    return db.exam.findFirst({ where: { id, memberId: { in: memberIds } } })
  },

  // Único ponto que busca um Exam sem escopo de família — usado apenas no
  // padrão "buscar-depois-autorizar" para escrita por médico (ver service).
  findById(id: string) {
    return db.exam.findUnique({ where: { id } })
  },

  create(memberId: string, input: ExamCreateData) {
    return db.exam.create({ data: { memberId, ...omitUndefined(input) } })
  },

  update(id: string, input: ExamUpdateData) {
    return db.exam.update({ where: { id }, data: omitUndefined(input) })
  },

  delete(id: string) {
    return db.exam.delete({ where: { id } })
  },
}
