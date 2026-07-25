import { AppError } from '../../shared/errors/index.js'
import { hashForLookup } from '../../shared/security/index.js'
import { medicalAccessRepository } from './medical-access.repository.js'

/**
 * Valida o código (existe, PENDING, não expirado) sem consumi-lo.
 * Usado por check/redeem médico e pelo redeem de cuidador (código unificado).
 */
export async function findValidGrantByCode(code: string) {
  const codeHash = hashForLookup(code)
  const grant = await medicalAccessRepository.findByCodeHash(codeHash)
  if (!grant) {
    throw new AppError({ code: 'ACCESS_CODE_INVALID', message: 'Código inválido' })
  }
  if (grant.status === 'ACTIVE' || grant.status === 'REVOKED') {
    throw new AppError({ code: 'CONFLICT', message: 'Código já utilizado ou revogado' })
  }
  if (grant.status === 'EXPIRED' || (grant.expiresAt !== null && grant.expiresAt < new Date())) {
    if (grant.status !== 'EXPIRED') {
      await medicalAccessRepository.markExpired(grant.id)
    }
    throw new AppError({ code: 'ACCESS_CODE_EXPIRED', message: 'Código expirado' })
  }
  return grant
}
