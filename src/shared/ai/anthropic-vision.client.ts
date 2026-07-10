import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import { env } from '../../config/env.js'
import { AppError } from '../errors/index.js'
import { omitUndefined } from '../utils/index.js'

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AppError({
      code: 'AI_EXTRACTION_FAILED',
      message: 'Serviço de extração por IA não configurado.',
    })
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  }
  return client
}

// Mesmas listas de opções dos seletores em
// app-medcare/app/add-medication/step-1.tsx (DOSAGE_UNITS, FORM_TYPES) e
// medications.mapper.ts (MedicationStripeColorApi) — sem pacote compartilhado
// entre os dois repositórios, precisam ser mantidas manualmente em sincronia.
const DOSAGE_UNITS = ['mg', 'ml', 'g', 'mcg', 'UI', '%'] as const
const FORM_TYPES = [
  'Comprimido',
  'Cápsula',
  'Gotas',
  'Injeção',
  'Xarope',
  'Pomada',
  'Adesivo',
  'Outros',
] as const
const STRIPE_COLORS = ['BLACK', 'RED', 'ORANGE', 'NONE'] as const

export type MedicationScanResult = {
  recognized: boolean
  medicationName?: string
  dosage?: string
  dosageUnit?: (typeof DOSAGE_UNITS)[number]
  formType?: (typeof FORM_TYPES)[number]
  stripeColor: (typeof STRIPE_COLORS)[number]
}

const ScanToolInputSchema = z.object({
  recognized: z.boolean(),
  medicationName: z.string().min(1).optional(),
  dosage: z.string().min(1).optional(),
  dosageUnit: z.enum(DOSAGE_UNITS).optional(),
  formType: z.enum(FORM_TYPES).optional(),
  stripeColor: z.enum(STRIPE_COLORS).optional(),
})

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_medication_info',
  description:
    'Extrai os dados legíveis de uma foto de embalagem ou cartela (blister) de medicamento de uso humano.',
  input_schema: {
    type: 'object',
    properties: {
      recognized: {
        type: 'boolean',
        description:
          'false quando a foto NÃO é de uma embalagem/cartela de medicamento de uso humano legível — inclui fotos de pessoas, objetos não relacionados, ou medicamentos de uso veterinário/animal.',
      },
      medicationName: {
        type: 'string',
        description: 'Nome do medicamento. Preencher só se lido com confiança, sem chutar.',
      },
      dosage: {
        type: 'string',
        description:
          'Só o valor numérico da dosagem, ex: "500". Preencher só se lido com confiança.',
      },
      dosageUnit: {
        type: 'string',
        enum: [...DOSAGE_UNITS],
        description: 'Unidade da dosagem. Preencher só se lido com confiança.',
      },
      formType: {
        type: 'string',
        enum: [...FORM_TYPES],
        description: 'Forma farmacêutica. Preencher só se lida com confiança.',
      },
      stripeColor: {
        type: 'string',
        enum: [...STRIPE_COLORS],
        description:
          "Tarja de controle impressa na embalagem no Brasil. Diferente dos outros campos: SEMPRE preencher com a melhor estimativa quando recognized=true — use a cor visível na embalagem se houver; se não estiver visível/legível, infira a partir do que você sabe sobre esse medicamento (nome reconhecido → categoria de controle conhecida); use 'NONE' só como último recurso, sem nenhum sinal visual ou de conhecimento prévio.",
      },
    },
    required: ['recognized'],
  },
}

const SYSTEM_PROMPT = `Você é um assistente que lê fotos de embalagens ou cartelas (blister) de medicamentos de USO HUMANO para um app de gestão de medicamentos no Brasil.

A foto pode ser da caixa do medicamento OU da cartela/blister que fica dentro da caixa — ambas são válidas e igualmente aceitáveis.

Regras:
- Só preencha medicationName/dosage/dosageUnit/formType se conseguir ler com confiança; não invente ou chute esses valores.
- "stripeColor" é exceção a essa regra — sempre entregue uma melhor estimativa quando recognized=true (ver descrição do campo na ferramenta).
- Recuse (recognized=false) qualquer foto que não seja de um medicamento de uso humano: fotos de pessoas, objetos aleatórios, ou embalagens de medicamento/produto de uso veterinário/animal — mesmo que consiga ler texto nelas.
- Recuse também fotos genuinamente ilegíveis (borradas, fora de foco, sem luz suficiente para ler qualquer texto).

Responda SEMPRE chamando a ferramenta extract_medication_info, nunca em texto livre.`

export async function extractMedicationFromImage(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<MedicationScanResult> {
  const anthropic = getClient()
  const startedAt = Date.now()

  console.info(
    `[medication-scan] Chamando Anthropic model=${env.ANTHROPIC_MODEL} mediaType=${mediaType} imageBytes≈${Math.round((imageBase64.length * 3) / 4)}`,
  )

  let response: Anthropic.Message
  try {
    response = await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'extract_medication_info' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: 'Leia esta foto de medicamento e extraia os dados possíveis.' },
          ],
        },
      ],
    })
  } catch (err) {
    console.error(
      `[medication-scan] Falha ao chamar a API da Anthropic (${Date.now() - startedAt}ms): ${err instanceof Error ? err.message : String(err)}`,
    )
    throw new AppError({
      code: 'AI_EXTRACTION_FAILED',
      message: 'Não foi possível analisar a foto agora. Tente novamente.',
    })
  }

  const elapsedMs = Date.now() - startedAt
  console.info(
    `[medication-scan] Anthropic respondeu em ${elapsedMs}ms stop_reason=${response.stop_reason} input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens}`,
  )

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (!toolUse) {
    console.error(`[medication-scan] Resposta sem tool_use: ${JSON.stringify(response.content)}`)
    throw new AppError({
      code: 'AI_EXTRACTION_FAILED',
      message: 'A IA não retornou um resultado válido.',
    })
  }

  console.info(`[medication-scan] tool_use.input bruto: ${JSON.stringify(toolUse.input)}`)

  const parsed = ScanToolInputSchema.safeParse(toolUse.input)
  if (!parsed.success) {
    console.error(
      `[medication-scan] tool_use.input inválido: ${JSON.stringify(toolUse.input)} — ${parsed.error.message}`,
    )
    throw new AppError({
      code: 'AI_EXTRACTION_FAILED',
      message: 'A IA retornou um resultado em formato inesperado.',
    })
  }

  if (!parsed.data.recognized) {
    console.info(
      `[medication-scan] Resultado: recognized=false (foto não identificada como medicamento de uso humano)`,
    )
    return { recognized: false, stripeColor: 'NONE' }
  }

  const result = omitUndefined({
    recognized: true,
    medicationName: parsed.data.medicationName,
    dosage: parsed.data.dosage,
    dosageUnit: parsed.data.dosageUnit,
    formType: parsed.data.formType,
    stripeColor: parsed.data.stripeColor ?? 'NONE',
  })

  console.info(
    `[medication-scan] Resultado: recognized=true` +
      ` name=${result.medicationName ?? '(vazio)'}` +
      ` dosage=${result.dosage ?? '(vazio)'}${result.dosageUnit ?? ''}` +
      ` formType=${result.formType ?? '(vazio)'}` +
      ` stripeColor=${result.stripeColor}`,
  )

  return result
}
