import { z } from 'zod'

// Login por e-mail — paciente/família/cuidador (app-medcare) e clínica/admin (web-medcare)
const EmailLoginSchema = z.object({
  email: z.string().email({ message: 'E-mail inválido' }),
  password: z.string().min(1),
})

// Login por CRM — médico (web-medcare)
const CrmLoginSchema = z.object({
  crmNumber: z.string().min(1),
  crmState: z.string().length(2),
  password: z.string().min(1),
})

export const LoginSchema = z.union([EmailLoginSchema, CrmLoginSchema])

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
})

export const LogoutSchema = z.object({
  refreshToken: z.string().min(1),
})

export type EmailLoginInput = z.infer<typeof EmailLoginSchema>
export type CrmLoginInput = z.infer<typeof CrmLoginSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type RefreshInput = z.infer<typeof RefreshSchema>
export type LogoutInput = z.infer<typeof LogoutSchema>
