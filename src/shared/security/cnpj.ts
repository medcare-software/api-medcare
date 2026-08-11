import { onlyDigits } from './blind-index.js'

/** Algoritmo oficial dos dígitos verificadores do CNPJ (módulo 11). */
export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value)
  if (cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(cnpj[i]) * (weights1[i] ?? 0)
  }
  let dig1 = sum % 11
  dig1 = dig1 < 2 ? 0 : 11 - dig1
  if (dig1 !== Number(cnpj[12])) return false

  sum = 0
  for (let i = 0; i < 13; i++) {
    sum += Number(cnpj[i]) * (weights2[i] ?? 0)
  }
  let dig2 = sum % 11
  dig2 = dig2 < 2 ? 0 : 11 - dig2
  return dig2 === Number(cnpj[13])
}
