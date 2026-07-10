import { db } from '../../config/database.js'

interface UpsertFromOAuthData {
  userId: string
  googleEmail: string
  // Retorno de encryptField() é tipado como Buffer<ArrayBuffer> (não o Buffer
  // genérico) — ver comentário em field-encryption.ts.
  accessTokenEncrypted: Buffer<ArrayBuffer>
  refreshTokenEncrypted: Buffer<ArrayBuffer>
  tokenExpiresAt: Date
  scope: string
}

export const gmailIntegrationRepository = {
  findByUserId(userId: string) {
    return db.gmailIntegration.findUnique({ where: { userId } })
  },

  // Reconectar (depois de um disconnect anterior) preserva autoImportEnabled e
  // importedCount já acumulados — só reseta o ciclo de vida da conexão em si.
  upsertFromOAuth(data: UpsertFromOAuthData) {
    return db.gmailIntegration.upsert({
      where: { userId: data.userId },
      create: {
        userId: data.userId,
        googleEmail: data.googleEmail,
        accessTokenEncrypted: data.accessTokenEncrypted,
        refreshTokenEncrypted: data.refreshTokenEncrypted,
        tokenExpiresAt: data.tokenExpiresAt,
        scope: data.scope,
      },
      update: {
        googleEmail: data.googleEmail,
        accessTokenEncrypted: data.accessTokenEncrypted,
        refreshTokenEncrypted: data.refreshTokenEncrypted,
        tokenExpiresAt: data.tokenExpiresAt,
        scope: data.scope,
        status: 'CONNECTED',
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
        disconnectedAt: null,
      },
    })
  },

  updateSettings(userId: string, data: { autoImportEnabled: boolean }) {
    return db.gmailIntegration.update({ where: { userId }, data })
  },

  markDisconnected(userId: string) {
    return db.gmailIntegration.update({
      where: { userId },
      data: {
        status: 'DISCONNECTED',
        disconnectedAt: new Date(),
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        tokenExpiresAt: null,
      },
    })
  },
}
