/** Regras alinhadas ao web-medcare (`PASSWORD_REQUIREMENT_RULES`). */
export const PASSWORD_POLICY_RULES = [
  {
    message: 'Senha deve ter no mínimo 8 caracteres',
    test: (password: string) => password.length >= 8,
  },
  {
    message: 'Senha deve incluir pelo menos um número',
    test: (password: string) => /\d/.test(password),
  },
  {
    message: 'Senha deve incluir pelo menos uma letra maiúscula',
    test: (password: string) => /[A-Z]/.test(password),
  },
  {
    message: 'Senha deve conter pelo menos um símbolo especial',
    test: (password: string) => /[^A-Za-z0-9]/.test(password),
  },
] as const

export function getPasswordPolicyError(password: string): string | null {
  for (const rule of PASSWORD_POLICY_RULES) {
    if (!rule.test(password)) return rule.message
  }
  return null
}

export function isPasswordPolicyValid(password: string): boolean {
  return getPasswordPolicyError(password) === null
}
