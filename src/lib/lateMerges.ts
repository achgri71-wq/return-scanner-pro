import { uid } from './utils'

const STORAGE_KEY = 'rsp.late.merged-lists'

export interface LateMerge {
  id: string
  name: string
  /** ColisFlow distributor names whose late codes are shown in this saved merge. */
  sourceNames: string[]
  createdAt: string
}

export function loadLateMerges(): LateMerge[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const item = entry as Partial<LateMerge>
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      const sourceNames = Array.isArray(item.sourceNames)
        ? item.sourceNames.filter(
            (value): value is string => typeof value === 'string' && Boolean(value.trim()),
          )
        : []
      if (!name || sourceNames.length < 2) return []
      return [{
        id: typeof item.id === 'string' && item.id ? item.id : uid('late-merge'),
        name,
        sourceNames: Array.from(new Set(sourceNames.map((value) => value.trim()))),
        createdAt:
          typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt))
            ? item.createdAt
            : new Date().toISOString(),
      }]
    })
  } catch {
    return []
  }
}

export function saveLateMerges(merges: LateMerge[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merges))
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('rsp.late-merges'))
}

export function createLateMerge(name: string, sourceNames: string[]): LateMerge {
  return {
    id: uid('late-merge'),
    name: name.trim(),
    sourceNames: Array.from(new Set(sourceNames.map((value) => value.trim()).filter(Boolean))),
    createdAt: new Date().toISOString(),
  }
}
