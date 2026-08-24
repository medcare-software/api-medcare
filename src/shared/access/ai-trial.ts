export const AI_TRIAL_DAYS = 14

/** Início do dia em America/Sao_Paulo (UTC-3 o ano todo). */
export function startOfDayInBrazil(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000-03:00`)
}

/** Fim do dia em America/Sao_Paulo — a IA permanece ativa até 23:59:59. */
export function endOfDayInBrazil(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999-03:00`)
}

export function toYmdInBrazil(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

export function computeAiTrialEndsAt(from = new Date()): Date {
  const ends = new Date(from.getTime())
  ends.setDate(ends.getDate() + AI_TRIAL_DAYS)
  return ends
}

/** IA ativa se o admin não desligou, já passou do início e ainda não passou do fim. */
export function isAiCurrentlyEnabled(user: {
  aiEnabled: boolean
  aiStartsAt?: Date | null
  aiTrialEndsAt: Date | null
}): boolean {
  if (!user.aiEnabled) return false
  const now = Date.now()
  if (user.aiStartsAt && user.aiStartsAt.getTime() > now) return false
  if (user.aiTrialEndsAt && user.aiTrialEndsAt.getTime() <= now) return false
  return true
}
