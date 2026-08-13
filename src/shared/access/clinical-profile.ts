import { db } from '../../config/database.js'
import { AppError } from '../errors/index.js'

/** Campos mínimos da 2ª etapa do cadastro (app) para liberar funções clínicas. */
export function isClinicalProfileComplete(input: {
  birthDate: Date | null
  biologicalSex: string | null
  /** UF/cidade só exigidos para o admin (cadastro parcial do app). */
  requireLocation?: boolean
  state: string | null | undefined
  city: string | null | undefined
  weightKg: unknown
  heightM: unknown
  /** Tipo sanguíneo é opcional — não bloqueia o perfil clínico. */
  bloodType?: string | null | undefined
}): boolean {
  const hasWeight =
    input.weightKg !== null &&
    input.weightKg !== undefined &&
    Number(input.weightKg) > 0
  const hasHeight =
    input.heightM !== null &&
    input.heightM !== undefined &&
    Number(input.heightM) > 0
  const locationOk =
    !input.requireLocation || (!!input.state?.trim() && !!input.city?.trim())
  return (
    input.birthDate != null &&
    !!input.biologicalSex &&
    locationOk &&
    hasWeight &&
    hasHeight
  )
}

/**
 * Bloqueia escrita/uso clínico quando o membro ainda não completou a 2ª parte do cadastro.
 * Papéis médicos com grant não passam por aqui (só a família).
 */
export async function assertClinicalProfileComplete(memberId: string): Promise<void> {
  const member = await db.familyMember.findFirst({
    where: { id: memberId, deletedAt: null },
    select: {
      isAdmin: true,
      birthDate: true,
      biologicalSex: true,
      user: { select: { state: true, city: true } },
      healthProfile: { select: { weightKg: true, heightM: true, bloodType: true } },
    },
  })
  if (!member) {
    throw new AppError({ code: 'NOT_FOUND', message: 'Registro não encontrado' })
  }

  const complete = isClinicalProfileComplete({
    birthDate: member.birthDate,
    biologicalSex: member.biologicalSex,
    requireLocation: member.isAdmin,
    state: member.user?.state,
    city: member.user?.city,
    weightKg: member.healthProfile?.weightKg,
    heightM: member.healthProfile?.heightM,
    bloodType: member.healthProfile?.bloodType,
  })

  if (!complete) {
    throw new AppError({
      code: 'PROFILE_INCOMPLETE',
      message: 'Complete seus dados pessoais e de saúde para continuar',
    })
  }
}
