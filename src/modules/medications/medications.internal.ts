import type { MedicationForm, MedicationStripeColor, PrescriptionValidity } from '@prisma/client'

// Ponto de entrada estreito e interno pra "médico cria medicação" — usado só por
// prescriptions.repository.ts (dentro da mesma transaction que cria o receituário).
// Nunca é exposto como rota própria e nunca passa por assertFamilyWriter (que
// bloqueia DOCTOR em todo método público de medications.service.ts) — de propósito,
// pra não abrir CRUD geral de medicação pra médico, só esta criação automática
// vinculada a um item de receituário.

export interface PrescriptionItemForMedication {
  id: string
  name: string
  dosage: string
  posology: string
  stripeColor: MedicationStripeColor
  form: MedicationForm | null
  dosageUnit: string | null
  scheduleTimes: string[]
  weekDays: string[]
  startDate: Date | null
  endDate: Date | null
  continuousUse: boolean | null
}

export interface PrescriptionContextForMedication {
  memberId: string
  doctorId: string
  diagnosticId: string | null
  issueDate: Date
  validity: PrescriptionValidity
  // Preenchido quando o médico confirmou o aviso de risco (ver
  // prescriptions.service.ts#create) — propagado igual pra todas as Medication
  // criadas a partir deste receituário.
  riskAcknowledgedAt?: Date | null
}

export function buildMedicationFromPrescriptionItem(
  item: PrescriptionItemForMedication,
  prescription: PrescriptionContextForMedication,
) {
  return {
    memberId: prescription.memberId,
    doctorId: prescription.doctorId,
    source: 'DOCTOR' as const,
    sourcePrescriptionItemId: item.id,
    diagnosticId: prescription.diagnosticId,
    name: item.name,
    dosage: item.dosage,
    // Sem forma/unidade estruturada informada (receituário antigo ou médico não
    // preencheu) cai num default inócuo — não bloqueia a criação da medicação.
    dosageUnit: item.dosageUnit ?? '',
    form: item.form ?? ('OTHER' as MedicationForm),
    stripeColor: item.stripeColor,
    frequency: item.posology,
    scheduleTimes: item.scheduleTimes,
    weekDays: item.weekDays,
    continuousUse: item.continuousUse ?? prescription.validity === 'CONTINUOUS_USE',
    startDate: item.startDate ?? prescription.issueDate,
    endDate: item.endDate,
    active: true,
    riskAcknowledgedAt: prescription.riskAcknowledgedAt ?? null,
  }
}
