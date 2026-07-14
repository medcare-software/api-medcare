import type { MedicationStripeColor, PrescriptionValidity } from '@prisma/client'
import { db } from '../../config/database.js'

interface PrescriptionItemData {
  name: string
  dosage: string
  posology: string
  duration: string
  instructionsEncrypted?: Buffer<ArrayBuffer>
  stripeColor: MedicationStripeColor
}

interface CreatePrescriptionData {
  memberId: string
  doctorId: string
  issueDate: Date
  validity: PrescriptionValidity
  linkedDiagnosticId?: string
  generalInstructionsEncrypted?: Buffer<ArrayBuffer>
  items: PrescriptionItemData[]
}

interface UpdatePrescriptionData {
  issueDate?: Date
  validity?: PrescriptionValidity
  linkedDiagnosticId?: string
  generalInstructionsEncrypted?: Buffer<ArrayBuffer>
  items?: PrescriptionItemData[]
}

// Doctor não tem campo de nome hoje — expõe o CRM como identificador do médico
// autor, mesmo padrão já usado em diagnostics.repository.ts/procedures.repository.ts.
const DOCTOR_SELECT = { select: { crmNumber: true, crmState: true } }

export const prescriptionsRepository = {
  findManyByMemberId(memberId: string) {
    return db.prescription.findMany({
      where: { memberId },
      orderBy: { issueDate: 'desc' },
      include: { doctor: DOCTOR_SELECT, items: true },
    })
  },

  findById(id: string) {
    return db.prescription.findUnique({
      where: { id },
      include: { doctor: DOCTOR_SELECT, items: true },
    })
  },

  create(data: CreatePrescriptionData) {
    const { items, ...rest } = data
    return db.prescription.create({
      data: { ...rest, items: { create: items } },
      include: { doctor: DOCTOR_SELECT, items: true },
    })
  },

  // Substitui a lista de itens por completo quando informada — mais simples e
  // seguro que reconciliar item a item pra um formulário que reenvia tudo.
  update(id: string, data: UpdatePrescriptionData) {
    const { items, ...rest } = data
    return db.$transaction(async (tx) => {
      if (items) {
        await tx.prescriptionItem.deleteMany({ where: { prescriptionId: id } })
      }
      return tx.prescription.update({
        where: { id },
        data: { ...rest, ...(items && { items: { create: items } }) },
        include: { doctor: DOCTOR_SELECT, items: true },
      })
    })
  },

  delete(id: string) {
    return db.prescription.delete({ where: { id } })
  },
}
