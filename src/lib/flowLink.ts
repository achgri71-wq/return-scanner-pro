import type { ScannedCode } from '../types'

/**
 * Direct link between Return Scanner Pro and ColisFlow.
 *
 * Both apps are static PWAs, so they cannot talk to each other directly.
 * The shared SUD server acts as the bus: this app publishes its return
 * statuses under the `rsp` slot, and reads the `flow` slot that ColisFlow
 * publishes with its distributor lists. Auth uses the same bridge API key.
 */

export const DEFAULT_LINK_URL = 'https://suddelivery.net/api/link.php'
export const DEFAULT_LINK_KEY = '2c3b48c5830e0cdfb9b5d4ded507ec76d8c32b58c8f7dedd'

const SNAPSHOT_KEY = 'rsp.flow.snapshot'
const DISTRIBUTORS_KEY = 'rsp.flow.distributors'

export type ReturnStatus = 'returned' | 'pending' | 'not-required' | 'prohibited'

export interface FlowDistributor {
  name: string
  codes: string[]
  date?: string
  archived: boolean
}

export interface ReturnIndexEntry {
  code: string
  status: ReturnStatus
  listName: string
  at?: string
}

export interface ReturnPayload {
  s: ReturnStatus
  l: string
  at?: string
}

const ERROR_KEYS: Record<string, 'flow.errAuth' | 'flow.errNetwork' | 'flow.errServer'> = {
  unauthorized: 'flow.errAuth',
  'server-error': 'flow.errServer',
  'network-error': 'flow.errNetwork',
}

/** Maps a thrown bridge error to its translation key. */
export function flowErrorKey(error: unknown): (typeof ERROR_KEYS)[keyof typeof ERROR_KEYS] {
  const code = error instanceof Error ? error.message : String(error)
  return ERROR_KEYS[code] ?? 'flow.errNetwork'
}

async function linkRequest(
  url: string,
  key: string,
  slot: 'flow' | 'rsp',
  init?: { method: 'GET' | 'PUT'; body?: string },
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${url.replace(/\/+$/, '')}?action=${init?.body ? 'put' : 'get'}&slot=${slot}`, {
      method: init?.method ?? 'GET',
      headers: init?.body ? { 'X-Api-Key': key.trim(), 'Content-Type': 'application/json' } : { 'X-Api-Key': key.trim() },
      body: init?.body,
    })
  } catch {
    throw new Error('network-error')
  }

  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (response.status === 401) throw new Error('unauthorized')
  if (!response.ok) throw new Error('server-error')

  const data = payload as { ok?: boolean; data?: unknown } | null
  if (!data || data.ok !== true) throw new Error('server-error')
  return data.data ?? null
}

/** Reads the distributor lists ColisFlow publishes on the bus. */
export async function fetchFlowDistributors(linkUrl: string, apiKey: string): Promise<FlowDistributor[]> {
  const payload = await linkRequest(linkUrl, apiKey, 'flow')
  return normalizeFlowDistributors(payload)
}

/** Publishes this app's return statuses to the bus (full snapshot). */
export async function putReturnIndex(
  linkUrl: string,
  apiKey: string,
  index: Record<string, ReturnPayload>,
): Promise<void> {
  await linkRequest(linkUrl, apiKey, 'rsp', {
    method: 'PUT',
    body: JSON.stringify({ returns: index }),
  })
}

/** Verifies the server link: read the flow slot and write a harmless probe. */
export async function testLink(linkUrl: string, apiKey: string): Promise<void> {
  await fetchFlowDistributors(linkUrl, apiKey)
  await putReturnIndex(linkUrl, apiKey, { __probe: { s: 'pending', l: '', at: new Date().toISOString() } })
}

/**
 * Normalises the published distributor payload (accepts the array form and
 * legacy raw maps so older data keeps working).
 */
export function normalizeFlowDistributors(raw: unknown): FlowDistributor[] {
  const source =
    raw && typeof raw === 'object' && Array.isArray((raw as { distributors?: unknown }).distributors)
      ? (raw as { distributors: unknown[] }).distributors
      : raw

  const entries: [string, unknown][] = Array.isArray(source)
    ? source.map((value, index) => [String(index), value])
    : source && typeof source === 'object'
      ? Object.entries(source as Record<string, unknown>)
      : []

  const result: FlowDistributor[] = []
  for (const [, value] of entries) {
    if (!value || typeof value !== 'object') continue
    const record = value as { name?: unknown; codes?: unknown; date?: unknown; archived?: unknown }
    const name = String(record.name ?? '').trim()
    if (!name) continue

    const rawDate = typeof record.date === 'string' ? record.date : undefined
    result.push({
      name,
      codes: Array.from(new Set(codesOf(record.codes).filter(Boolean))),
      date: rawDate && !Number.isNaN(Date.parse(rawDate)) ? rawDate : undefined,
      archived: Boolean(record.archived),
    })
  }

  result.sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1
    return (b.date ?? '').localeCompare(a.date ?? '')
  })
  return result
}

function codesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? '').trim())
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map((entry) => String(entry ?? '').trim())
  }
  if (typeof value === 'string') return value.split(/[\n\r,;\t]+/).map((entry) => entry.trim())
  return []
}

/** Local cache of the shared distributor lists (used by the search page). */
export function loadFlowOwners(): Map<string, { name: string; archived: boolean }> {
  const owners = new Map<string, { name: string; archived: boolean }>()
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DISTRIBUTORS_KEY) || '[]')
    if (!Array.isArray(parsed)) return owners
    for (const item of parsed as FlowDistributor[]) {
      if (!item || typeof item.name !== 'string') continue
      for (const code of item.codes ?? []) {
        owners.set(String(code).toUpperCase(), { name: item.name, archived: Boolean(item.archived) })
      }
    }
  } catch {
    /* no cache yet */
  }
  return owners
}

/** Saves the distributor lists for the search page and notifies listeners. */
export function storeFlowDistributors(list: FlowDistributor[]): void {
  try {
    localStorage.setItem(DISTRIBUTORS_KEY, JSON.stringify(list))
  } catch {
    /* storage may be unavailable */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('rsp.flow'))
}

interface ReturnSnapshot {
  [code: string]: string
}

function fingerprint(entry: { status: ReturnStatus; listName: string; at?: string }): string {
  return `${entry.status}|${entry.listName}|${entry.at ?? ''}`
}

function loadSnapshot(): ReturnSnapshot {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? (parsed as ReturnSnapshot) : {}
  } catch {
    return {}
  }
}

function saveSnapshot(snapshot: ReturnSnapshot): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot))
  } catch {
    /* storage may be unavailable */
  }
}

/**
 * Compares the fresh return index against the last published snapshot and
 * returns the full index to publish (the bus stores complete snapshots).
 */
export function diffReturnIndex(
  entries: ReturnIndexEntry[],
  previous: ReturnSnapshot = loadSnapshot(),
): { index: Record<string, ReturnPayload>; next: ReturnSnapshot; changed: number } {
  const next: ReturnSnapshot = {}
  const index: Record<string, ReturnPayload> = {}
  let changed = 0

  for (const entry of entries) {
    const stamp = fingerprint(entry)
    next[entry.code] = stamp
    index[entry.code] = { s: entry.status, l: entry.listName, at: entry.at }
    if (previous[entry.code] !== stamp) changed += 1
  }
  for (const code of Object.keys(previous)) {
    if (!(code in next)) {
      index[code] = { s: 'not-required', l: '', at: undefined }
      changed += 1
    }
  }
  return { index, next, changed }
}

/**
 * Builds the return status index published to ColisFlow: one entry per code,
 * keeping the strongest status when a code appears in several lists.
 */
export function buildReturnIndex(data: {
  parcels: { code: string; status: string; returnedAt?: string; addedAt: string; listId: string }[]
  registry: ScannedCode[]
  blacklist: { code: string }[]
  listNames: Map<string, string>
}): ReturnIndexEntry[] {
  const best = new Map<string, ReturnIndexEntry>()
  const priority: Record<ReturnStatus, number> = { returned: 3, prohibited: 2, 'not-required': 1, pending: 0 }

  const consider = (code: string, status: ReturnStatus, listName: string, at?: string) => {
    const current = best.get(code)
    if (!current || priority[status] > priority[current.status]) {
      best.set(code, { code, status, listName, at })
    }
  }

  for (const parcel of data.parcels) {
    const status: ReturnStatus = parcel.status === 'returned' ? 'returned' : 'pending'
    consider(parcel.code, status, data.listNames.get(parcel.listId) ?? '', parcel.returnedAt ?? parcel.addedAt)
  }

  for (const entry of data.registry) {
    const status: ReturnStatus | null =
      entry.status === 'required-returned'
        ? 'returned'
        : entry.status === 'return-prohibited'
          ? 'prohibited'
          : entry.status === 'not-required'
            ? 'not-required'
            : null
    if (!status) continue
    consider(entry.code, status, data.listNames.get(entry.listId) ?? '', entry.lastAttemptAt)
  }

  for (const entry of data.blacklist) {
    consider(entry.code, 'prohibited', '', undefined)
  }

  return Array.from(best.values()).sort((a, b) => a.code.localeCompare(b.code))
}

/**
 * Full background sync: publishes this app's return statuses (only when the
 * index changed since the last publish) and refreshes the distributor cache
 * used by the search page.
 */
export async function syncFlow(
  linkUrl: string,
  apiKey: string,
  data: () => Parameters<typeof buildReturnIndex>[0],
): Promise<{ pushed: number }> {
  const { index, next, changed } = diffReturnIndex(buildReturnIndex(data()))
  if (changed > 0) await putReturnIndex(linkUrl, apiKey, index)
  saveSnapshot(next)
  storeFlowDistributors(await fetchFlowDistributors(linkUrl, apiKey))
  return { pushed: changed }
}
