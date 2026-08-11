import { db } from '../../config/database.js'

/** Fallback histórico quando o plano não define `devicesPerDoctor`. */
export const DEFAULT_DOCTOR_SESSION_LIMIT = 2

/**
 * Limite de sessões simultâneas do médico: maior `devicesPerDoctor` entre o
 * plano próprio e os planos das clínicas ativas vinculadas.
 */
export async function resolveDoctorSessionLimitByUserId(userId: string): Promise<number> {
  const doctor = await db.doctor.findUnique({
    where: { userId },
    select: {
      plan: { select: { devicesPerDoctor: true } },
      clinics: {
        where: { active: true },
        select: {
          clinic: { select: { plan: { select: { devicesPerDoctor: true } } } },
        },
      },
    },
  })
  if (!doctor) return DEFAULT_DOCTOR_SESSION_LIMIT

  const limits = [
    doctor.plan?.devicesPerDoctor,
    ...doctor.clinics.map((link) => link.clinic.plan?.devicesPerDoctor),
  ].filter((value): value is number => typeof value === 'number' && value > 0)

  return limits.length > 0 ? Math.max(...limits) : DEFAULT_DOCTOR_SESSION_LIMIT
}

export async function resolveDoctorSessionLimitByDoctorId(doctorId: string): Promise<number> {
  const doctor = await db.doctor.findUnique({
    where: { id: doctorId },
    select: { userId: true },
  })
  if (!doctor) return DEFAULT_DOCTOR_SESSION_LIMIT
  return resolveDoctorSessionLimitByUserId(doctor.userId)
}
