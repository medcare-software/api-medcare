import crypto from 'node:crypto'

import { env } from '../../config/env.js'

// Permite buscar por CPF/CNPJ/código de acesso sem decriptar toda a tabela:
// salvamos, ao lado do valor cifrado, um HMAC determinístico ("blind index").
// A busca compara hash(valor) == coluna *Hash — nunca decripta em massa.

export function hashForLookup(value: string): string {
  return crypto.createHmac('sha256', env.BLIND_INDEX_PEPPER).update(value).digest('hex')
}

/** Remove tudo que não for dígito — usado para normalizar CPF/CNPJ antes de cifrar/hashear. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}
