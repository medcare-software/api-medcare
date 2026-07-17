import { z } from 'zod'

// Login por e-mail — paciente/família/cuidador (app-medcare) e clínica/admin (web-medcare)
const EmailLoginSchema = z.object({
  email: z.string().email({ message: 'E-mail inválido' }),
  password: z.string().min(1, { message: 'Senha é obrigatória' }),
})

// Login por CPF, e-mail ou CNPJ num único campo — app-medcare (paciente/família/
// cuidador) e clínica/admin (web-medcare). Mantido separado de EmailLoginSchema
// (que outros clientes ainda podem enviar).
//
// `portal` desambigua login por e-mail (CPF/CNPJ já são inequívocos por si só)
// quando o mesmo e-mail acumula mais de um papel — ver auth.service.ts. Opcional
// por compatibilidade retroativa: se omitido, mantém o comportamento antigo de
// confiar no User.role armazenado.
const IdentifierLoginSchema = z.object({
  identifier: z.string().min(1, { message: 'Informe seu CPF ou e-mail' }),
  password: z.string().min(1, { message: 'Senha é obrigatória' }),
  portal: z.enum(['app', 'clinic', 'admin']).optional(),
})

// Login por CRM — médico (web-medcare)
const CrmLoginSchema = z.object({
  crmNumber: z.string().min(1, { message: 'CRM é obrigatório' }),
  crmState: z.string().length(2, { message: 'UF do CRM deve ter 2 letras' }),
  password: z.string().min(1, { message: 'Senha é obrigatória' }),
})

export const LoginSchema = z.union([IdentifierLoginSchema, EmailLoginSchema, CrmLoginSchema])

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1, { message: 'Sessão inválida, faça login novamente' }),
})

export const LogoutSchema = z.object({
  refreshToken: z.string().min(1, { message: 'Sessão inválida, faça login novamente' }),
})

export const ForgotPasswordSchema = z.object({
  email: z.string().email({ message: 'E-mail inválido' }),
})

export const VerifyResetCodeSchema = z.object({
  email: z.string().email({ message: 'E-mail inválido' }),
  code: z.string().regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
})

export const ResetPasswordSchema = z.object({
  resetSessionToken: z.string().min(1, { message: 'Sessão de recuperação inválida ou expirada' }),
  newPassword: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
})

// Usado pela página https intermediária (web-medcarelp) antes de redirecionar
// pro app — evita mostrar a tela de "definir senha" pra qualquer token/link
// arbitrário, sem revelar mais do que um booleano de validade.
export const ValidateResetSessionSchema = z.object({
  token: z.string().min(1, { message: 'Token é obrigatório' }),
})

// Troca de senha por quem já está logado (diferente do fluxo de esqueci-senha).
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: 'Senha atual é obrigatória' }),
  newPassword: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
})

export type EmailLoginInput = z.infer<typeof EmailLoginSchema>
export type IdentifierLoginInput = z.infer<typeof IdentifierLoginSchema>
export type CrmLoginInput = z.infer<typeof CrmLoginSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type RefreshInput = z.infer<typeof RefreshSchema>
export type LogoutInput = z.infer<typeof LogoutSchema>
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>
export type VerifyResetCodeInput = z.infer<typeof VerifyResetCodeSchema>
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>
export type ValidateResetSessionInput = z.infer<typeof ValidateResetSessionSchema>
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>
