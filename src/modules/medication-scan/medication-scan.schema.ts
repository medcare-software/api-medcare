import { z } from 'zod'

export const ScanMedicationSchema = z.object({
  fileId: z.string().min(1, { message: 'Arquivo inválido' }),
})

export type ScanMedicationInput = z.infer<typeof ScanMedicationSchema>
