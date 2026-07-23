import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import { env } from '../../config/env.js'

let client: Anthropic | null = null

function getClient(): Anthropic | null {
  if (!env.ANTHROPIC_API_KEY) return null
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  }
  return client
}

const SEVERITIES = ['light', 'moderate', 'severe'] as const
const RISK_TYPES = ['interaction', 'allergy'] as const

export type MedicationRisk = {
  type: (typeof RISK_TYPES)[number]
  severity: (typeof SEVERITIES)[number]
  conflictingItem: string
  description: string
}

// degraded=true quando a IA não rodou (chave ausente, API fora do ar, resposta
// inválida) — nesse caso hasRisk sempre volta false, mas isso NÃO significa "sem
// risco confirmado", significa "não checamos agora". Quem consome isso precisa
// tratar degraded distinto de "checou e não achou risco" (ver medications
// check-risk endpoint e app mobile).
export type MedicationRiskCheckResult = {
  hasRisk: boolean
  risks: MedicationRisk[]
  degraded: boolean
}

const RiskToolInputSchema = z.object({
  hasRisk: z.boolean(),
  risks: z
    .array(
      z.object({
        type: z.enum(RISK_TYPES),
        severity: z.enum(SEVERITIES),
        conflictingItem: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .default([]),
})

const RISK_TOOL: Anthropic.Tool = {
  name: 'report_medication_risk',
  description:
    'Reporta riscos de interação medicamentosa ou conflito com alergia ao adicionar um novo medicamento de uso humano.',
  input_schema: {
    type: 'object',
    properties: {
      hasRisk: {
        type: 'boolean',
        description:
          'true se houver ao menos um risco relevante — interação perigosa entre medicamentos ou conflito com uma alergia conhecida.',
      },
      risks: {
        type: 'array',
        description: 'Lista de riscos encontrados. Vazia quando hasRisk=false.',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [...RISK_TYPES],
              description:
                '"interaction" para interação entre dois medicamentos, "allergy" para conflito com alergia cadastrada.',
            },
            severity: {
              type: 'string',
              enum: [...SEVERITIES],
              description: 'Gravidade clínica do risco.',
            },
            conflictingItem: {
              type: 'string',
              description:
                'Nome do medicamento (para type=interaction) ou da alergia (para type=allergy) que conflita com o novo medicamento.',
            },
            description: {
              type: 'string',
              description: 'Explicação curta (1-2 frases) do risco, em português, para leigos.',
            },
          },
          required: ['type', 'severity', 'conflictingItem', 'description'],
        },
      },
    },
    required: ['hasRisk', 'risks'],
  },
}

const SYSTEM_PROMPT = `Você é um assistente farmacológico que ajuda a identificar riscos ao adicionar um novo medicamento de uso humano no Brasil, para um app de gestão de saúde familiar.

Você vai receber: o novo medicamento sendo cadastrado, a lista de medicamentos já em uso ativo pela mesma pessoa, e a lista de alergias conhecidas dela.

Regras:
- Reporte só riscos em que você tenha confiança razoável, baseados em conhecimento farmacológico real — não invente interações.
- Considere tanto interação medicamento-medicamento quanto conflito medicamento-alergia (ex.: a pessoa é alérgica a um princípio ativo presente no novo medicamento, ou a uma classe relacionada).
- Se não houver risco relevante, retorne hasRisk=false e risks vazio — não force um risco de severidade "light" só para preencher.
- A descrição deve ser curta, em português, para leigos (não profissionais de saúde), sem jargão desnecessário.
- Isso é um apoio informativo, não substitui avaliação médica/farmacêutica — não repita esse aviso na sua descrição (a interface já mostra isso separadamente), só reporte o risco em si.

Responda SEMPRE chamando a ferramenta report_medication_risk, nunca em texto livre.`

function buildUserPrompt(input: {
  newDrugs: { name: string; dosage: string }[]
  activeMedications: { name: string; dosage: string }[]
  allergies: string[]
}): string {
  return [
    input.newDrugs.length > 1
      ? `Novos medicamentos sendo cadastrados juntos (considere também interação ENTRE eles): ${input.newDrugs.map((d) => `${d.name} ${d.dosage}`).join(', ')}`
      : `Novo medicamento sendo cadastrado: ${input.newDrugs.map((d) => `${d.name} ${d.dosage}`).join(', ')}`,
    input.activeMedications.length
      ? `Medicamentos já em uso ativo: ${input.activeMedications.map((m) => `${m.name} ${m.dosage}`).join(', ')}`
      : 'Medicamentos já em uso ativo: nenhum',
    input.allergies.length
      ? `Alergias conhecidas: ${input.allergies.join(', ')}`
      : 'Alergias conhecidas: nenhuma',
  ].join('\n')
}

// Nunca lança — em qualquer falha (IA fora, chave ausente, resposta inválida)
// volta { hasRisk: false, risks: [], degraded: true } (fail-open). Quem chama
// deve tratar degraded=true de forma visível, nunca como "sem risco confirmado".
// newDrugs aceita mais de um item pra cobrir o caso de receituário — um médico
// prescrevendo vários medicamentos de uma vez também precisa da checagem de
// interação ENTRE os itens do próprio receituário, não só contra os já ativos.
export async function checkMedicationRisk(input: {
  newDrugs: { name: string; dosage: string }[]
  activeMedications: { name: string; dosage: string }[]
  allergies: string[]
}): Promise<MedicationRiskCheckResult> {
  const anthropic = getClient()
  if (!anthropic) {
    console.error(
      '[medication-risk] ANTHROPIC_API_KEY não configurada — checagem em modo degradado (fail-open).',
    )
    return { hasRisk: false, risks: [], degraded: true }
  }

  const startedAt = Date.now()

  let response: Anthropic.Message
  try {
    response = await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [RISK_TOOL],
      tool_choice: { type: 'tool', name: 'report_medication_risk' },
      messages: [{ role: 'user', content: buildUserPrompt(input) }],
    })
  } catch (err) {
    console.error(
      `[medication-risk] Falha ao chamar a API da Anthropic (${Date.now() - startedAt}ms): ${err instanceof Error ? err.message : String(err)} — modo degradado (fail-open).`,
    )
    return { hasRisk: false, risks: [], degraded: true }
  }

  const elapsedMs = Date.now() - startedAt
  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (!toolUse) {
    console.error(
      `[medication-risk] Resposta sem tool_use (${elapsedMs}ms) — modo degradado (fail-open).`,
    )
    return { hasRisk: false, risks: [], degraded: true }
  }

  const parsed = RiskToolInputSchema.safeParse(toolUse.input)
  if (!parsed.success) {
    console.error(
      `[medication-risk] tool_use.input inválido: ${parsed.error.message} — modo degradado (fail-open).`,
    )
    return { hasRisk: false, risks: [], degraded: true }
  }

  console.info(
    `[medication-risk] Anthropic respondeu em ${elapsedMs}ms hasRisk=${parsed.data.hasRisk} risks=${parsed.data.risks.length} input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens}`,
  )

  return { hasRisk: parsed.data.hasRisk, risks: parsed.data.risks, degraded: false }
}
