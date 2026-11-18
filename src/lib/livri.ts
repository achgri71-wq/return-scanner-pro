import { normalizeCode, isValidCode } from './codes'
import { uid } from './utils'

const STORAGE_KEY = 'rsp.livri.codes'

export interface LivriCode {
  id: string
  code: string
  addedAt: string
}

/**
 * Loads the independent, device-local "Livri" list.
 *
 * Codes kept here never show up on the late-parcels page: the list acts as an
 * exclusion set for the late notices.
 */
export function loadLivriCodes(): LivriCode[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(raw)) return []

    const seen = new Set<string>()
    const result: LivriCode[] = []
    for (const value of raw) {
      if (!value || typeof value !== 'object') continue
      const item = value as Partial<LivriCode>
      const code = normalizeCode(item.code)
      if (!isValidCode(code) || seen.has(code)) continue
      seen.add(code)
      result.push({
        id: typeof item.id === 'string' && item.id ? item.id : uid('livri'),
        code,
        addedAt:
          typeof item.addedAt === 'string' && !Number.isNaN(Date.parse(item.addedAt))
            ? item.addedAt
            : new Date().toISOString(),
      })
    }
    return result
  } catch {
    return []
  }
}

/** Saves the list locally and notifies any other open RSP tab. */
export function saveLivriCodes(codes: LivriCode[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codes))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('rsp.livri'))
}

export function makeLivriCode(code: string, addedAt = new Date().toISOString()): LivriCode {
  return { id: uid('livri'), code: normalizeCode(code), addedAt }
}
