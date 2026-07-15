import { db } from '../../config/database.js'

export const clinicalSummaryRepository = {
  findByMemberId(memberId: string) {
    return db.healthProfile.findUnique({ where: { memberId } })
  },
}
