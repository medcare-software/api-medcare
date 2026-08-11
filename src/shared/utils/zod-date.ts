import { z } from 'zod'

// Date.parse é permissivo com datas de calendário inválidas: 'Date.parse(2024-02-31)'
// não retorna NaN, ele "rola" pro dia seguinte válido (2024-03-02). Isso deixa passar
// datas como "31/02" digitadas errado no app sem nenhum erro. Comparamos os componentes
// ano/mês/dia originais com os do Date resultante para pegar esse caso.
function isValidCalendarDate(v: string): boolean {
  const parsed = new Date(v)
  if (Number.isNaN(parsed.getTime())) return false

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (!match) return true

  const [, year, month, day] = match
  const y = Number(year)
  // Mesmo intervalo do app (isValidBrDate) — rejeita anos absurdo tipo 0226.
  if (y < 1900 || y > 2100) return false

  return (
    parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day)
  )
}

// Date-only (`YYYY-MM-DD`) compara pelo calendário local — `new Date('YYYY-MM-DD')`
// é meia-noite UTC e rejeitava "hoje" / aceitava "amanhã" conforme fuso.
function isNotFuture(v: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    const now = new Date()
    const todayYear = now.getFullYear()
    const todayMonth = now.getMonth() + 1
    const todayDay = now.getDate()
    if (year !== todayYear) return year < todayYear
    if (month !== todayMonth) return month < todayMonth
    return day <= todayDay
  }
  return new Date(v).getTime() <= Date.now()
}

export type DateSchemaOptions = {
  /** Rejeita datas futuras (ex.: data de nascimento) — usa `futureMessage` no erro. */
  notFuture?: boolean
  futureMessage?: string
}

/** `z.coerce.date()` com mensagem PT-BR — a coerção padrão do Zod gera "Invalid date" em inglês. */
export function requiredDate(message: string, options?: DateSchemaOptions) {
  let schema: z.ZodType<string, z.ZodTypeDef, string> = z
    .string()
    .refine(isValidCalendarDate, { message })
  if (options?.notFuture) {
    schema = schema.refine(isNotFuture, {
      message: options.futureMessage ?? 'Data não pode ser no futuro',
    })
  }
  return schema.transform((v) => new Date(v))
}

export function optionalDate(message: string, options?: DateSchemaOptions) {
  let schema: z.ZodType<string, z.ZodTypeDef, string> = z
    .string()
    .refine(isValidCalendarDate, { message })
  if (options?.notFuture) {
    schema = schema.refine(isNotFuture, {
      message: options.futureMessage ?? 'Data não pode ser no futuro',
    })
  }
  return schema.transform((v) => new Date(v)).optional()
}
