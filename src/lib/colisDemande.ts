import { normalizeCode, isValidCode } from './codes'
import { uid } from './utils'

const STORAGE_KEY = 'rsp.colis-demande.codes'

export interface RequestedCode {
  id: string
  code: string
  addedAt: string
}

/** Loads the independent, device-local Colis Demandé list. */
export function loadRequestedCodes(): RequestedCode[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(raw)) return []

    const seen = new Set<string>()
    const result: RequestedCode[] = []
    for (const value of raw) {
      if (!value || typeof value !== 'object') continue
      const item = value as Partial<RequestedCode>
      const code = normalizeCode(item.code)
      if (!isValidCode(code) || seen.has(code)) continue
      seen.add(code)
      result.push({
        id: typeof item.id === 'string' && item.id ? item.id : uid('demande'),
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
export function saveRequestedCodes(codes: RequestedCode[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codes))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('rsp.colis-demande'))
}

export function makeRequestedCode(code: string, addedAt = new Date().toISOString()): RequestedCode {
  return { id: uid('demande'), code: normalizeCode(code), addedAt }
}
