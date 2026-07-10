import { onlyDigits } from './blind-index.js'

// Mascaramento aplicado SEMPRE na camada de serialização de saída (schemas dos
// módulos), nunca no frontend. Por padrão a API nunca retorna CPF/CNPJ completos —
// só o service da rota decide expor o valor completo (dono do dado, ou perfil com
// MedicalAccessGrant ativo), e isso deve gerar um AuditLog.

export function maskCpf(cpf: string): string {
  const digits = onlyDigits(cpf)
  if (digits.length !== 11) return '***.***.***-**'
  return `***.***.${digits.slice(6, 9)}-${digits.slice(9)}`
}

export function maskCnpj(cnpj: string): string {
  const digits = onlyDigits(cnpj)
  if (digits.length !== 14) return '**.***.***/****-**'
  return `**.***.***/${digits.slice(8, 12)}-${digits.slice(12)}`
}

export function maskEmail(email: string, visibleChars = 1): string {
  const [user, domain] = email.split('@')
  if (!user || !domain) return '***'
  const visible = user.slice(0, visibleChars)
  return `${visible}${'*'.repeat(Math.max(user.length - visibleChars, 3))}@${domain}`
}

export function maskPhone(phone: string): string {
  const digits = onlyDigits(phone)
  if (digits.length < 4) return '****'
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`
}
