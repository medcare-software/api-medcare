import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Em dev o seed roda via tsx sobre `src/`; no runner Docker só existe `dist/`.
const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const hasSrc = existsSync(join(root, 'src/shared/security/index.ts'))
const securityModule = hasSrc
  ? '../../src/shared/security/index.js'
  : '../../dist/shared/security/index.js'

export const { encryptField, hashForLookup, onlyDigits } = await import(securityModule)
