import { z } from 'zod'

export const CreateGrantSchema = z
  .object({
    memberId: z.string().min(1, { message: 'Selecione um membro da família' }),
    validity: z.enum(['PERMANENT', 'TEMPORARY']).default('TEMPORARY'),
    // Dias escolhidos na UI (30/60) quando validity=TEMPORARY — sem isso, o
    // prazo real do acesso sempre caía no default fixo do env, ignorando a
    // escolha do usuário entre "30 dias" e "60 dias".
    temporaryDays: z.union([z.literal(30), z.literal(60)]).optional(),
  })
  .refine((data) => data.validity !== 'TEMPORARY' || data.temporaryDays !== undefined, {
    message: 'Informe o número de dias para acesso temporário',
    path: ['temporaryDays'],
  })

export const RedeemGrantSchema = z.object({
  code: z.string().regex(/^\d{6,8}$/, 'Código deve ter 6 a 8 dígitos'),
  // Só usado quando quem resgata é CLINIC_ADMIN — atribui um médico interno
  // responsável, que passa a ter acesso real ao prontuário (ver medical-access.service.ts).
  doctorId: z.string().min(1).optional(),
})

// Validação prévia (sem consumir o código) — ver medicalAccessService.checkCode.
export const CheckGrantSchema = z.object({
  code: z.string().regex(/^\d{6,8}$/, 'Código deve ter 6 a 8 dígitos'),
})

export type CreateGrantInput = z.infer<typeof CreateGrantSchema>
export type RedeemGrantInput = z.infer<typeof RedeemGrantSchema>
export type CheckGrantInput = z.infer<typeof CheckGrantSchema>
