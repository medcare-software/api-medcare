export type ListItem = string | { bold: string; text: string }

export type ContentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'list'; items: ListItem[] }
  | { kind: 'table'; headers: [string, string]; rows: [string, string][] }
  | { kind: 'contact'; lines: { label?: string; email: string }[] }

export type LegalSection = {
  number: string
  title: string
  blocks: ContentBlock[]
}

export type LegalDocument = {
  id: string
  title: string
  version: string
  updatedAt: string
  sections: LegalSection[]
}

export type ProfessionalTermsDocument = LegalDocument & {
  shortCommitment: string[]
  shortCommitmentLegalBasis: string
}
