import { env } from '../../config/env.js'

// Cliente da API oficial de interações medicamentosas do CRF-MG (IMSES —
// https://imses.crfmg.org.br/api/openapi.yaml). Mesmo estilo enxuto (fetch
// puro) do restante das integrações de terceiro do projeto (ver
// gmail-oauth.client.ts), mas fail-open como o cliente de IA
// (medication-risk.client.ts) — nunca lança, porque é uma checagem
// complementar à IA, não pode derrubar o fluxo de cadastro de medicamento.

const SEVERITIES = ['light', 'moderate', 'severe'] as const

export type ImsesInteraction = {
  type: 'interaction'
  severity: (typeof SEVERITIES)[number]
  conflictingItem: string
  description: string
  source: 'imses'
}

export type ImsesCheckResult = {
  // true só quando a API respondeu 200 (reconheceu todos os nomes
  // consultados) — mesmo sem nenhuma interação encontrada. false em qualquer
  // outro caso (não configurado, nomes insuficientes, 400 "não encontrado",
  // erro de rede) — quem chama trata false como "IMSES não conseguiu opinar
  // agora, cai pra IA" (ver shared/drug-interactions/compose-risk.ts).
  recognized: boolean
  risks: ImsesInteraction[]
}

type ImsesMedicamento = { id: number; nome: string; indicacoes?: string }
type ImsesInteracaoRaw = {
  id: number
  medicamento1: ImsesMedicamento
  medicamento2: ImsesMedicamento
  mecanismo_efeito?: string
  recomendacoes?: string
  acao?: string
}

function isImsesConfigured(): boolean {
  return !!env.IMSES_API_KEY
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

// A API não retorna um nível de gravidade estruturado, só o texto livre de
// `acao` — heurística documentada aqui porque não há outra fonte de verdade.
function deriveSeverity(acao: string | undefined): (typeof SEVERITIES)[number] {
  const normalized = normalize(acao ?? '')
  if (
    normalized.includes('contraindicad') ||
    normalized.includes('evitar') ||
    normalized.includes('nao associar') ||
    normalized.includes('grave')
  ) {
    return 'severe'
  }
  if (
    normalized.includes('monitor') ||
    normalized.includes('cautela') ||
    normalized.includes('ajust') ||
    normalized.includes('acompanh')
  ) {
    return 'moderate'
  }
  return 'light'
}

function toRiskItem(item: ImsesInteracaoRaw): ImsesInteraction {
  const description = [item.mecanismo_efeito, item.recomendacoes].filter(Boolean).join(' ')
  return {
    type: 'interaction',
    severity: deriveSeverity(item.acao),
    conflictingItem: `${item.medicamento1.nome} + ${item.medicamento2.nome}`,
    description: description || 'Interação conhecida entre esses medicamentos.',
    source: 'imses',
  }
}

// names: nomes comerciais como cadastrados no app (sem resolução de princípio
// ativo — decisão de produto: casar direto pelo nome). Precisa de 2+ nomes
// distintos, exigência do endpoint /interacoes.
export async function checkImsesInteractions(names: string[]): Promise<ImsesCheckResult> {
  const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  if (uniqueNames.length < 2) return { recognized: false, risks: [] }
  if (!isImsesConfigured()) return { recognized: false, risks: [] }

  const url = `${env.IMSES_API_BASE_URL}/interacoes?nomes=${encodeURIComponent(uniqueNames.join(','))}`
  const startedAt = Date.now()

  let response: Response
  try {
    response = await fetch(url, { headers: { 'X-API-Key': env.IMSES_API_KEY as string } })
  } catch (err) {
    console.error(
      `[imses] Falha de rede ao consultar interações (${Date.now() - startedAt}ms): ${err instanceof Error ? err.message : String(err)} — IMSES fora desta checagem, IA cobre sozinha.`,
    )
    return { recognized: false, risks: [] }
  }

  if (!response.ok) {
    // 400 = um ou mais nomes não encontrados na base do IMSES — não é uma
    // falha operacional, só significa que a IA precisa cobrir essa checagem.
    if (response.status !== 400) {
      console.error(
        `[imses] Resposta ${response.status} ao consultar interações — IMSES fora desta checagem, IA cobre sozinha.`,
      )
    }
    return { recognized: false, risks: [] }
  }

  let body: { interacoes?: ImsesInteracaoRaw[] }
  try {
    body = (await response.json()) as { interacoes?: ImsesInteracaoRaw[] }
  } catch {
    console.error(
      '[imses] Resposta 200 sem JSON válido — IMSES fora desta checagem, IA cobre sozinha.',
    )
    return { recognized: false, risks: [] }
  }

  const interacoes = body.interacoes ?? []
  console.info(
    `[imses] Consulta respondeu em ${Date.now() - startedAt}ms com ${interacoes.length} interação(ões) para ${uniqueNames.length} medicamento(s).`,
  )

  return { recognized: true, risks: interacoes.map(toRiskItem) }
}
