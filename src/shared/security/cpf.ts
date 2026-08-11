import { onlyDigits } from './blind-index.js'

/** Algoritmo oficial dos dígitos verificadores (módulo 11). Rejeita sequências repetidas. */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += Number(cpf[i]) * (10 - i)
  }
  let dig1 = (sum * 10) % 11
  if (dig1 === 10) dig1 = 0
  if (dig1 !== Number(cpf[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += Number(cpf[i]) * (11 - i)
  }
  let dig2 = (sum * 10) % 11
  if (dig2 === 10) dig2 = 0
  return dig2 === Number(cpf[10])
}
