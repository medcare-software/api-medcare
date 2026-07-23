import { db } from '../../config/database.js'

export interface MedicationRiskContext {
  activeMedications: { name: string; dosage: string }[]
  allergies: string[]
}

// Busca os dados usados como contexto pela checagem de risco por IA (medicamentos
// ativos + alergias do membro). Compartilhado entre o check-risk avulso
// (medication-risk-check) e a checagem de receituário (prescriptions).
export async function getMedicationRiskContext(memberId: string): Promise<MedicationRiskContext> {
  const [activeMedications, healthProfile] = await Promise.all([
    db.medication.findMany({
      where: { memberId, active: true },
      select: { name: true, dosage: true, dosageUnit: true },
    }),
    db.healthProfile.findUnique({ where: { memberId }, select: { allergies: true } }),
  ])

  return {
    activeMedications: activeMedications.map((m) => ({
      name: m.name,
      dosage: `${m.dosage}${m.dosageUnit}`,
    })),
    allergies: healthProfile?.allergies ?? [],
  }
}
