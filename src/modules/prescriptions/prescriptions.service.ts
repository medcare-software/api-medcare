import type { MedicationForm, MedicationStripeColor } from '@prisma/client'
import {
  assertClinicalReadAccess,
  assertClinicalWriteAccess,
  resolveDoctorId,
} from '../../shared/access/index.js'
import { AppError } from '../../shared/errors/index.js'
import {
  resolveFamilyAdminUserIds,
  resolveFamilyIdForMember,
  sendPushToUser,
} from '../../shared/push/index.js'
import { decryptField, encryptField } from '../../shared/security/index.js'
import type { AuthUser } from '../../shared/types/auth.types.js'
import { prescriptionsRepository } from './prescriptions.repository.js'
import type {
  CreatePrescriptionInput,
  PrescriptionItemInput,
  UpdatePrescriptionInput,
} from './prescriptions.schema.js'

function toItemData(item: PrescriptionItemInput) {
  return {
    name: item.name,
    dosage: item.dosage,
    posology: item.posology,
    duration: item.duration,
    stripeColor: item.stripeColor as MedicationStripeColor,
    ...(item.instructions !== undefined && {
      instructionsEncrypted: encryptField(item.instructions),
    }),
    ...(item.form !== undefined && { form: item.form as MedicationForm }),
    ...(item.dosageUnit !== undefined && { dosageUnit: item.dosageUnit }),
    scheduleTimes: item.scheduleTimes,
    weekDays: item.weekDays,
    ...(item.startDate !== undefined && { startDate: item.startDate }),
    ...(item.endDate !== undefined && { endDate: item.endDate }),
    ...(item.continuousUse !== undefined && { continuousUse: item.continuousUse }),
  }
}

export const prescriptionsService = {
  async list(user: AuthUser, memberId: string) {
    await assertClinicalReadAccess(user, memberId, {
      action: 'VIEW_PRESCRIPTIONS',
      targetType: 'FamilyMember',
    })
    const prescriptions = await prescriptionsRepository.findManyByMemberId(memberId)
    return prescriptions.map(toResponse)
  },

  async getById(user: AuthUser, id: string) {
    const prescription = await prescriptionsRepository.findById(id)
    if (!prescription) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Receituário não encontrado' })
    }
    await assertClinicalReadAccess(user, prescription.memberId, {
      action: 'VIEW_PRESCRIPTION',
      targetType: 'Prescription',
    })
    return toResponse(prescription)
  },

  async create(user: AuthUser, input: CreatePrescriptionInput) {
    await assertClinicalWriteAccess(user, input.memberId)
    // doctorId nunca vem do client — deriva sempre do token, para impedir spoofing.
    const doctorId = await resolveDoctorId(user.id)
    const prescription = await prescriptionsRepository.create({
      memberId: input.memberId,
      doctorId,
      issueDate: input.issueDate,
      validity: input.validity,
      ...(input.linkedDiagnosticId !== undefined && {
        linkedDiagnosticId: input.linkedDiagnosticId,
      }),
      ...(input.generalInstructions !== undefined && {
        generalInstructionsEncrypted: encryptField(input.generalInstructions),
      }),
      items: input.items.map(toItemData),
    })

    const familyId = await resolveFamilyIdForMember(input.memberId)
    const adminUserIds = familyId ? await resolveFamilyAdminUserIds(familyId) : []
    for (const adminUserId of adminUserIds) {
      await sendPushToUser(adminUserId, {
        title: 'Novo receituário recebido',
        body: `Um médico enviou um receituário com ${input.items.length} medicamento(s).`,
        data: {
          type: 'prescription-shared',
          prescriptionId: prescription.id,
          memberId: input.memberId,
        },
      })
    }

    return toResponse(prescription)
  },

  async update(user: AuthUser, id: string, input: UpdatePrescriptionInput) {
    const prescription = await prescriptionsRepository.findById(id)
    if (!prescription) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Receituário não encontrado' })
    }

    const doctorId = await resolveDoctorId(user.id)
    if (prescription.doctorId !== doctorId) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Apenas o médico autor pode editar este receituário',
      })
    }
    await assertClinicalWriteAccess(user, prescription.memberId)

    const updated = await prescriptionsRepository.update(id, {
      ...(input.issueDate !== undefined && { issueDate: input.issueDate }),
      ...(input.validity !== undefined && { validity: input.validity }),
      ...(input.linkedDiagnosticId !== undefined && {
        linkedDiagnosticId: input.linkedDiagnosticId,
      }),
      ...(input.generalInstructions !== undefined && {
        generalInstructionsEncrypted: encryptField(input.generalInstructions),
      }),
      ...(input.items !== undefined && { items: input.items.map(toItemData) }),
    })
    return toResponse(updated)
  },

  async remove(user: AuthUser, id: string) {
    const prescription = await prescriptionsRepository.findById(id)
    if (!prescription) {
      throw new AppError({ code: 'NOT_FOUND', message: 'Receituário não encontrado' })
    }

    const doctorId = await resolveDoctorId(user.id)
    if (prescription.doctorId !== doctorId) {
      throw new AppError({
        code: 'FORBIDDEN',
        message: 'Apenas o médico autor pode excluir este receituário',
      })
    }
    await assertClinicalWriteAccess(user, prescription.memberId)
    await prescriptionsRepository.delete(id)
  },
}

interface PrescriptionRow {
  id: string
  memberId: string
  doctorId: string | null
  issueDate: Date
  validity: string
  linkedDiagnosticId: string | null
  generalInstructionsEncrypted: Uint8Array | null
  createdAt: Date
  doctor?: { crmNumber: string; crmState: string } | null
  items: {
    id: string
    name: string
    dosage: string
    posology: string
    duration: string
    instructionsEncrypted: Uint8Array | null
    stripeColor: MedicationStripeColor
  }[]
}

function toResponse(prescription: PrescriptionRow) {
  return {
    id: prescription.id,
    memberId: prescription.memberId,
    doctorId: prescription.doctorId,
    doctorCrm: prescription.doctor
      ? `${prescription.doctor.crmNumber}/${prescription.doctor.crmState}`
      : null,
    issueDate: prescription.issueDate,
    validity: prescription.validity,
    linkedDiagnosticId: prescription.linkedDiagnosticId,
    generalInstructions: prescription.generalInstructionsEncrypted
      ? decryptField(prescription.generalInstructionsEncrypted)
      : null,
    createdAt: prescription.createdAt,
    items: prescription.items.map((item) => ({
      id: item.id,
      name: item.name,
      dosage: item.dosage,
      posology: item.posology,
      duration: item.duration,
      instructions: item.instructionsEncrypted ? decryptField(item.instructionsEncrypted) : null,
      stripeColor: item.stripeColor,
    })),
  }
}
