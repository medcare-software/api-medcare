import crypto from 'node:crypto'

// Gera uma senha temporária forte (nunca vem do client) — garante ao menos 1
// maiúscula/1 dígito/1 símbolo pra já nascer válida contra a política de senha do front.
export function generateTemporaryPassword(): string {
  return `${crypto.randomBytes(10).toString('base64url')}A1!`
}
