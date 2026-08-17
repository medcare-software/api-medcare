import { db } from '../../config/database.js'
import { AppError } from '../errors/index.js'

const AI_DISABLED_MESSAGE =
  'Os recursos de IA não estão ativos na sua conta. Entre em contato com o suporte para liberar.'

/**
 * Fail-closed: endpoints que gastam token de IA (risco, scan, Gmail) só
 * seguem se User.aiEnabled = true (default no cadastro). Toggle off no painel PLATFORM_ADMIN.
 */
export async function assertAiEnabled(userId: string): Promise<void> {
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { aiEnabled: true },
  })
  if (!user?.aiEnabled) {
    throw new AppError({
      code: 'AI_DISABLED',
      message: AI_DISABLED_MESSAGE,
    })
  }
}

export async function isAiEnabled(userId: string): Promise<boolean> {
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { aiEnabled: true },
  })
  return user?.aiEnabled === true
}
