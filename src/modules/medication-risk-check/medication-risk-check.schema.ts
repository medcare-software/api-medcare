import { z } from 'zod'

export const CheckMedicationRiskSchema = z.object({
  memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
  name: z.string().min(1, { message: 'Nome do medicamento é obrigatório' }),
  dosage: z.string().min(1, { message: 'Dosagem é obrigatória' }),
  dosageUnit: z.string().min(1, { message: 'Unidade da dosagem é obrigatória' }),
})

export type CheckMedicationRiskInput = z.infer<typeof CheckMedicationRiskSchema>
