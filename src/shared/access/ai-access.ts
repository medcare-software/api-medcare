import { db } from '../../config/database.js'
import { AppError } from '../errors/index.js'
import { isAiCurrentlyEnabled } from './ai-trial.js'

const AI_DISABLED_MESSAGE =
  'Os recursos de IA não estão ativos na sua conta. Entre em contato com o suporte para liberar.'

const AI_SELECT = { aiEnabled: true, aiStartsAt: true, aiTrialEndsAt: true } as const

/**
 * Fail-closed: endpoints que gastam token de IA (risco, scan, Gmail) só
 * seguem se a IA estiver ligada e dentro da janela (início/fim) definida.
 */
export async function assertAiEnabled(userId: string): Promise<void> {
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: AI_SELECT,
  })
  if (!user || !isAiCurrentlyEnabled(user)) {
    throw new AppError({
      code: 'AI_DISABLED',
      message: AI_DISABLED_MESSAGE,
    })
  }
}

export async function isAiEnabled(userId: string): Promise<boolean> {
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: AI_SELECT,
  })
  return !!user && isAiCurrentlyEnabled(user)
}
