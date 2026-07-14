import { db } from '../../config/database.js'
import { omitUndefined } from '../../shared/utils/index.js'
import type { CreateExamInput, UpdateExamInput } from './exams.schema.js'

export const examsRepository = {
  findManyByMemberIds(memberIds: string[]) {
    return db.exam.findMany({
      where: { memberId: { in: memberIds } },
      orderBy: { examDate: 'desc' },
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

  create(memberId: string, input: Omit<CreateExamInput, 'memberId'> & { doctorId?: string }) {
    return db.exam.create({ data: { memberId, ...omitUndefined(input) } })
  },

  update(id: string, input: UpdateExamInput) {
    return db.exam.update({ where: { id }, data: omitUndefined(input) })
  },

  delete(id: string) {
    return db.exam.delete({ where: { id } })
  },
}
