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

const EXAM_TYPES = ['LABORATORIAL', 'IMAGEM', 'OUTROS'] as const

export type GmailExamExtraction = {
  isLabResult: boolean
  patientNameGuess?: string | undefined
  examType?: (typeof EXAM_TYPES)[number] | undefined
  examDateGuess?: string | undefined
  resultsSummary?: string | undefined
}

const ExtractionSchema = z.object({
  isLabResult: z.boolean(),
  patientNameGuess: z.string().min(1).optional(),
  examType: z.enum(EXAM_TYPES).optional(),
  examDateGuess: z.string().min(1).optional(),
  resultsSummary: z.string().min(1).optional(),
})

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'extract_exam_from_email',
  description:
    'Analisa um e-mail de laboratório/clínica/hospital para identificar se contém um laudo/resultado de exame e extrai dados estruturados.',
  input_schema: {
    type: 'object',
    properties: {
      isLabResult: {
        type: 'boolean',
        description:
          'false quando o e-mail claramente NÃO é um laudo/resultado de exame — ex.: lembrete de consulta, confirmação de agendamento, propaganda, cobrança.',
      },
      patientNameGuess: {
        type: 'string',
        description: 'Nome do paciente mencionado no e-mail/anexo, se identificável com confiança.',
      },
      examType: {
        type: 'string',
        enum: [...EXAM_TYPES],
        description: 'Tipo do exame.',
      },
      examDateGuess: {
        type: 'string',
        description: 'Data do exame no formato AAAA-MM-DD, se identificável.',
      },
      resultsSummary: {
        type: 'string',
        description: 'Resumo curto (2-3 frases) dos resultados/achados, em português, para leigos.',
      },
    },
    required: ['isLabResult'],
  },
}

const SYSTEM_PROMPT = `Você é um assistente que analisa e-mails de laboratórios, clínicas e hospitais para um app de gestão de saúde familiar no Brasil, identificando se o e-mail contém um laudo/resultado de exame e extraindo dados estruturados dele (texto do e-mail e/ou anexo em PDF/imagem).

Regras:
- Se o e-mail não for claramente um laudo/resultado (ex.: lembrete de consulta, confirmação de agendamento, marketing, cobrança), reporte isLabResult=false e não preencha os demais campos.
- Só preencha patientNameGuess/examDateGuess/examType/resultsSummary se identificar com confiança razoável — não invente.
- resultsSummary deve ser um resumo curto, em português, para leigos (não profissionais de saúde), sem repetir números clínicos sensíveis desnecessariamente.
- Isso é um apoio informativo, não substitui avaliação médica — não inclua esse aviso no resultsSummary (a interface já mostra isso separadamente).

Responda SEMPRE chamando a ferramenta extract_exam_from_email, nunca em texto livre.`

// Retorna null (nunca lança) quando a IA está indisponível/falha — quem chama
// (gmail-import.service.ts) deve tratar isso como "não processar agora", nunca
// como "não é um laudo", pra não perder a mensagem: ela fica elegível pra
// reprocessamento na próxima rodada do cron.
export async function extractExamFromEmail(input: {
  subject: string
  from: string
  bodyText: string
  attachment?: { mimeType: string; base64: string }
}): Promise<GmailExamExtraction | null> {
  const anthropic = getClient()
  if (!anthropic) {
    console.error('[gmail-exam] ANTHROPIC_API_KEY não configurada — extração indisponível agora.')
    return null
  }

  const startedAt = Date.now()
  const textPart = `Remetente: ${input.from}\nAssunto: ${input.subject}\n\nCorpo do e-mail:\n${input.bodyText || '(sem corpo em texto simples)'}`

  const content: Anthropic.ContentBlockParam[] = [{ type: 'text', text: textPart }]
  if (input.attachment) {
    if (input.attachment.mimeType === 'application/pdf') {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: input.attachment.base64 },
      })
    } else if (
      input.attachment.mimeType === 'image/jpeg' ||
      input.attachment.mimeType === 'image/png' ||
      input.attachment.mimeType === 'image/webp'
    ) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: input.attachment.mimeType,
          data: input.attachment.base64,
        },
      })
    }
  }

  let response: Anthropic.Message
  try {
    response = await anthropic.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'extract_exam_from_email' },
      messages: [{ role: 'user', content }],
    })
  } catch (err) {
    console.error(
      `[gmail-exam] Falha ao chamar a API da Anthropic (${Date.now() - startedAt}ms): ${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }

  const elapsedMs = Date.now() - startedAt
  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (!toolUse) {
    console.error(`[gmail-exam] Resposta sem tool_use (${elapsedMs}ms).`)
    return null
  }

  const parsed = ExtractionSchema.safeParse(toolUse.input)
  if (!parsed.success) {
    console.error(`[gmail-exam] tool_use.input inválido: ${parsed.error.message}`)
    return null
  }

  console.info(
    `[gmail-exam] Anthropic respondeu em ${elapsedMs}ms isLabResult=${parsed.data.isLabResult} input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens}`,
  )

  return parsed.data
}
