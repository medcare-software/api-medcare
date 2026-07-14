import { UAParser } from 'ua-parser-js'

// Aproximação via User-Agent: dá pra saber SO + navegador (ex: "macOS · Chrome"),
// mas não o modelo exato do aparelho (ex: "Tablet Samsung S10") — limitação real
// do protocolo HTTP, não uma escolha de escopo.
export function getDeviceLabel(userAgent?: string): string {
  if (!userAgent) return 'Dispositivo desconhecido'

  const { os, browser } = new UAParser(userAgent).getResult()
  const parts = [os.name, browser.name].filter(Boolean)

  return parts.length > 0 ? parts.join(' · ') : 'Dispositivo desconhecido'
}
