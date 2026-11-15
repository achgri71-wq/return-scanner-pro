import { openDB, type IDBPDatabase } from 'idb'
import type { ScannedCode } from '../types'

/**
 * Direct link between Return Scanner Pro and ColisFlow.
 *
 * Both apps are hosted on the same origin (achgri71-wq.github.io), so they
 * share the browser's storage. This module exchanges snapshots through a
 * small shared IndexedDB database: this app publishes its return statuses
 * under the `rsp` slot, and reads the `flow` slot that ColisFlow publishes
 * with its distributor lists. No server, no account, works offline.
 */

const LINK_DB = 'colislink'
const SNAPSHOT_KEY = 'rsp.flow.snapshot'
const DISTRIBUTORS_KEY = 'rsp.flow.distributors'

export type ReturnStatus = 'returned' | 'pending' | 'not-required' | 'prohibited'

export interface FlowDistributor {
  name: string
  /** Distributor phone, used to send WhatsApp notices (may be missing). */
  phone?: string
  codes: string[]
  /** Entry date of each code, aligned with `codes` (empty when unknown). */
  dates?: string[]
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

interface SlotRecord {
  slot: 'flow' | 'rsp'
  at: string
  data: unknown
}

let dbPromise: Promise<IDBPDatabase<{ slots: { key: string; value: SlotRecord } }>> | null = null
let channel: BroadcastChannel | null = null

function getLinkDB(): Promise<IDBPDatabase<{ slots: { key: string; value: SlotRecord } }>> {
  if (!dbPromise) {
    dbPromise = openDB(LINK_DB, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('slots')) db.createObjectStore('slots', { keyPath: 'slot' })
      },
    })
  }
  return dbPromise
}

function notify(): void {
  try {
    if (!channel) channel = new BroadcastChannel('colislink')
    channel.postMessage({ t: Date.now() })
  } catch {
    /* BroadcastChannel may be unavailable */
  }
}

/** Listens for link updates coming from the other app. */
export function onLinkUpdate(handler: () => void): () => void {
  try {
    if (!channel) channel = new BroadcastChannel('colislink')
    channel.onmessage = handler
  } catch {
    /* BroadcastChannel may be unavailable */
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', handler)
  return () => {
    if (channel) channel.onmessage = null
    if (typeof window !== 'undefined') window.removeEventListener('storage', handler)
  }
}

/** Writes a slot snapshot into the shared database. */
export async function putSlot(slot: 'flow' | 'rsp', data: unknown): Promise<void> {
  const db = await getLinkDB()
  await db.put('slots', { slot, at: new Date().toISOString(), data })
  notify()
}

/** Reads a slot snapshot from the shared database (null when never written). */
export async function getSlot(slot: 'flow' | 'rsp'): Promise<{ at: string; data: unknown } | null> {
  const db = await getLinkDB()
  const record = await db.get('slots', slot)
  return record ?? null
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
    const record = value as {
      name?: unknown
      phone?: unknown
      codes?: unknown
      dates?: unknown
      date?: unknown
      archived?: unknown
    }
    const name = String(record.name ?? '').trim()
    if (!name) continue

    const phone = typeof record.phone === 'string' ? record.phone.trim() : ''
    const rawDate = typeof record.date === 'string' ? record.date : undefined
    const rawCodes = codesOf(record.codes).filter(Boolean)
    const rawDates = Array.isArray(record.dates)
      ? record.dates.map((entry) => (typeof entry === 'string' ? entry : ''))
      : []

    // Deduplicate codes while keeping the first entry date of each one,
    // so `dates` stays aligned with `codes`.
    const seen = new Map<string, string>()
    for (let index = 0; index < rawCodes.length; index += 1) {
      const code = rawCodes[index]
      if (seen.has(code)) continue
      const at = rawDates[index] ?? ''
      seen.set(code, at && !Number.isNaN(Date.parse(at)) ? at : '')
    }

    result.push({
      name,
      ...(phone ? { phone } : {}),
      codes: Array.from(seen.keys()),
      dates: Array.from(seen.values()),
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

/** Saves the distributor lists for the search page and notifies listeners. */
export function storeFlowDistributors(list: FlowDistributor[]): void {
  try {
    localStorage.setItem(DISTRIBUTORS_KEY, JSON.stringify(list))
  } catch {
    /* storage may be unavailable */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('rsp.flow'))
}

/** Reads the cached ColisFlow distributor lists (refreshed by the sync hook). */
export function loadFlowDistributors(): FlowDistributor[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DISTRIBUTORS_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed as FlowDistributor[]
  } catch {
    return []
  }
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
 * returns the full index to publish.
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
 * Full background sync: publishes this app's return statuses into the shared
 * database (only when the index changed) and refreshes the distributor cache
 * used by the search page from ColisFlow's slot.
 */
export async function syncFlow(
  data: () => Parameters<typeof buildReturnIndex>[0],
): Promise<{ pushed: number }> {
  const { index, next, changed } = diffReturnIndex(buildReturnIndex(data()))
  if (changed > 0) await putSlot('rsp', { returns: index })
  saveSnapshot(next)
  const flow = await getSlot('flow')
  storeFlowDistributors(normalizeFlowDistributors(flow?.data ?? []))
  return { pushed: changed }
}
