import type { MedicationForm, MedicationStripeColor, PrescriptionValidity } from '@prisma/client'
import { db } from '../../config/database.js'
import { buildMedicationFromPrescriptionItem } from '../medications/medications.internal.js'

interface PrescriptionItemData {
  name: string
  dosage: string
  posology: string
  duration: string
  instructionsEncrypted?: Buffer<ArrayBuffer>
  stripeColor: MedicationStripeColor
  form?: MedicationForm
  dosageUnit?: string
  scheduleTimes: string[]
  weekDays: string[]
  startDate?: Date
  endDate?: Date
  continuousUse?: boolean
}

interface CreatePrescriptionData {
  memberId: string
  doctorId: string
  issueDate: Date
  validity: PrescriptionValidity
  linkedDiagnosticId?: string
  generalInstructionsEncrypted?: Buffer<ArrayBuffer>
  items: PrescriptionItemData[]
  riskAcknowledgedAt?: Date
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

  // Roda numa transaction porque a criação das Medication abaixo precisa ser
  // atômica com a criação do receituário+itens — se uma medicação falhar, o
  // receituário inteiro deve reverter, senão sobram itens "fantasmas" que nunca
  // viraram medicação real (ver medications/medications.internal.ts).
  create(data: CreatePrescriptionData) {
    const { items, riskAcknowledgedAt, ...rest } = data
    return db.$transaction(async (tx) => {
      const prescription = await tx.prescription.create({
        data: { ...rest, items: { create: items } },
        include: { doctor: DOCTOR_SELECT, items: true },
      })

      const medications = []
      for (const item of prescription.items) {
        const medication = await tx.medication.create({
          data: buildMedicationFromPrescriptionItem(item, {
            memberId: prescription.memberId,
            doctorId: data.doctorId,
            diagnosticId: prescription.linkedDiagnosticId,
            issueDate: prescription.issueDate,
            validity: prescription.validity,
            ...(riskAcknowledgedAt !== undefined && { riskAcknowledgedAt }),
          }),
        })
        medications.push(medication)
      }

      return { prescription, medications }
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
