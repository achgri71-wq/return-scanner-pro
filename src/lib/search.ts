import type {
  BlacklistEntry,
  ReturnList,
  ReturnParcel,
  ScannedCode,
} from '../types'
import { dayKey } from './utils'

export type SearchStatus = 'returned' | 'pending' | 'not-required' | 'prohibited'
export type SearchStatusFilter = 'all' | SearchStatus

export interface SearchFilters {
  status: SearchStatusFilter
  listId: 'all' | string
  from: string
  to: string
}

export interface SearchHit {
  key: string
  code: string
  listId: string
  listName: string
  listStatus: ReturnList['status']
  status: SearchStatus
  attempts: number
  firstScanAt?: string
  lastAttemptAt?: string
  returnedAt?: string
  lastResult?: ScannedCode['lastResult']
  registryId?: string
  parcelId?: string
  otherListName?: string
  rank: number
}

export interface SearchResponse {
  hits: SearchHit[]
  total: number
  truncated: boolean
  matchedLists: ReturnList[]
}

const EMPTY_FILTERS: SearchFilters = { status: 'all', listId: 'all', from: '', to: '' }

function inDateRange(value: string | undefined, from: string, to: string): boolean {
  if (!from && !to) return true
  if (!value) return false
  const day = dayKey(value)
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

function searchableList(list: ReturnList, query: string): boolean {
  if (!query) return false
  const needle = query.toLocaleLowerCase()
  return (
    list.name.toLocaleLowerCase().includes(needle) ||
    list.id.toLocaleLowerCase().includes(needle)
  )
}

export function searchRecords(input: {
  query: string
  lists: ReturnList[]
  parcels: ReturnParcel[]
  registry: ScannedCode[]
  blacklist: BlacklistEntry[]
  filters?: Partial<SearchFilters>
  limit?: number
}): SearchResponse {
  const filters = { ...EMPTY_FILTERS, ...input.filters }
  const query = input.query.trim().toLocaleLowerCase()
  const limit = input.limit ?? 400
  const listById = new Map(input.lists.map((list) => [list.id, list]))
  const blacklisted = new Set(input.blacklist.map((entry) => entry.code))
  const matchedLists = query
    ? input.lists
        .filter((list) => searchableList(list, query))
        .sort((a, b) => {
          const aStarts = a.name.toLocaleLowerCase().startsWith(query) ? 0 : 1
          const bStarts = b.name.toLocaleLowerCase().startsWith(query) ? 0 : 1
          return aStarts - bStarts || b.updatedAt.localeCompare(a.updatedAt)
        })
        .slice(0, 20)
    : []
  const matchedListIds = new Set(matchedLists.map((list) => list.id))

  const parcelByKey = new Map<string, ReturnParcel>()
  for (const parcel of input.parcels) {
    parcelByKey.set(`${parcel.listId}::${parcel.code}`, parcel)
  }
  const registryByKey = new Map<string, ScannedCode>()
  for (const entry of input.registry) {
    registryByKey.set(`${entry.listId}::${entry.code}`, entry)
  }

  const keys = new Set<string>()
  if (query) {
    for (const entry of input.registry) {
      if (entry.code.toLocaleLowerCase().includes(query) || matchedListIds.has(entry.listId)) {
        keys.add(`${entry.listId}::${entry.code}`)
      }
    }
    for (const parcel of input.parcels) {
      if (parcel.code.toLocaleLowerCase().includes(query) || matchedListIds.has(parcel.listId)) {
        keys.add(`${parcel.listId}::${parcel.code}`)
      }
    }
  } else {
    const recent = [...input.registry]
      .sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt))
      .slice(0, 120)
    for (const entry of recent) keys.add(`${entry.listId}::${entry.code}`)
  }

  const all: SearchHit[] = []
  for (const key of keys) {
    const registry = registryByKey.get(key)
    const parcel = parcelByKey.get(key)
    const list = listById.get((parcel ?? registry)?.listId ?? '')
    if (!list) continue
    if (filters.listId !== 'all' && list.id !== filters.listId) continue

    let status: SearchStatus
    if (blacklisted.has(registry?.code ?? parcel?.code ?? '')) status = 'prohibited'
    else if (parcel?.status === 'returned') status = 'returned'
    else if (registry?.status === 'required-returned') status = 'returned'
    else if (registry?.status === 'return-prohibited') status = 'prohibited'
    else if (registry?.status === 'not-required') status = 'not-required'
    else status = 'pending'

    if (filters.status !== 'all' && filters.status !== status) continue

    const dateValue =
      registry?.lastAttemptAt ?? parcel?.returnedAt ?? parcel?.addedAt ?? registry?.firstScanAt
    if (!inDateRange(dateValue, filters.from, filters.to)) continue

    if (query) {
      const codeHit = (registry?.code ?? parcel?.code ?? '')
        .toLocaleLowerCase()
        .includes(query)
      const listHit = matchedListIds.has(list.id)
      if (!codeHit && !listHit) continue
    }

    const code = registry?.code ?? parcel?.code ?? ''
    const position = query ? code.toLocaleLowerCase().indexOf(query) : -1
    const rank = position >= 0 ? position : query ? 500 : 1000

    all.push({
      key,
      code,
      listId: list.id,
      listName: list.name,
      listStatus: list.status,
      status,
      attempts: registry?.attempts ?? 0,
      firstScanAt: registry?.firstScanAt,
      lastAttemptAt: registry?.lastAttemptAt ?? parcel?.returnedAt ?? parcel?.addedAt,
      returnedAt: parcel?.returnedAt,
      lastResult: registry?.lastResult,
      registryId: registry?.id,
      parcelId: parcel?.id,
      otherListName: registry?.otherListName,
      rank,
    })
  }

  all.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    return (b.lastAttemptAt ?? '').localeCompare(a.lastAttemptAt ?? '')
  })

  return {
    hits: all.slice(0, limit),
    total: all.length,
    truncated: all.length > limit,
    matchedLists,
  }
}
