/** Sobrenome da família: 2º token do nome completo. Ex.: "NatHã Souza Lopes" → "Souza". */
export function familySurnameFromFullName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return parts[1] ?? parts[0] ?? ''
  return parts[0] ?? ''
}

/** Ex.: "NatHã Souza Lopes" → "Família Souza". */
export function familyNameFromFullName(fullName: string): string {
  const surname = familySurnameFromFullName(fullName)
  return surname ? `Família ${surname}` : 'Família'
}
