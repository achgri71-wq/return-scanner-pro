import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  AppData,
  AuditEntry,
  BlacklistEntry,
  Employee,
  ReturnList,
  ReturnParcel,
  ScanEvent,
  ScannedCode,
} from '../types'

interface ReturnScannerDB extends DBSchema {
  lists: { key: string; value: ReturnList }
  parcels: { key: string; value: ReturnParcel }
  registry: { key: string; value: ScannedCode }
  events: { key: string; value: ScanEvent }
  blacklist: { key: string; value: BlacklistEntry }
  /** Legacy store kept for schema stability; no longer read or written. */
  sessions: { key: string; value: { id: string } }
  employees: { key: string; value: Employee }
  audit: { key: string; value: AuditEntry }
}

type StoreName =
  | 'lists'
  | 'parcels'
  | 'registry'
  | 'events'
  | 'blacklist'
  | 'sessions'
  | 'employees'
  | 'audit'

const DB_NAME = 'return-scanner-pro'
const DB_VERSION = 1
const STORES: StoreName[] = [
  'lists',
  'parcels',
  'registry',
  'events',
  'blacklist',
  'sessions',
  'employees',
  'audit',
]

let dbPromise: Promise<IDBPDatabase<ReturnScannerDB>> | null = null

function getDB(): Promise<IDBPDatabase<ReturnScannerDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ReturnScannerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

export async function loadAll(): Promise<AppData> {
  const db = await getDB()
  const [lists, parcels, registry, events, blacklist, employees, audit] = await Promise.all([
    db.getAll('lists'),
    db.getAll('parcels'),
    db.getAll('registry'),
    db.getAll('events'),
    db.getAll('blacklist'),
    db.getAll('employees'),
    db.getAll('audit'),
  ])
  return { lists, parcels, registry, events, blacklist, employees, audit }
}

export interface DbChanges {
  lists?: ReturnList[]
  parcels?: ReturnParcel[]
  registry?: ScannedCode[]
  events?: ScanEvent[]
  blacklist?: BlacklistEntry[]
  employees?: Employee[]
  audit?: AuditEntry[]
  deleteLists?: string[]
  deleteParcels?: string[]
  deleteRegistry?: string[]
  deleteEvents?: string[]
  deleteBlacklist?: string[]
  deleteEmployees?: string[]
  deleteAudit?: string[]
}

function storesForChanges(changes: DbChanges): StoreName[] {
  const names = new Set<StoreName>()
  const map: Record<StoreName, [unknown[] | undefined, string[] | undefined]> = {
    lists: [changes.lists, changes.deleteLists],
    parcels: [changes.parcels, changes.deleteParcels],
    registry: [changes.registry, changes.deleteRegistry],
    events: [changes.events, changes.deleteEvents],
    blacklist: [changes.blacklist, changes.deleteBlacklist],
    sessions: [undefined, undefined],
    employees: [changes.employees, changes.deleteEmployees],
    audit: [changes.audit, changes.deleteAudit],
  }
  for (const name of STORES) {
    const [puts, deletes] = map[name]
    if ((puts?.length ?? 0) > 0 || (deletes?.length ?? 0) > 0) names.add(name)
  }
  return [...names]
}

/** Writes several stores in a single IndexedDB transaction. */
export async function writeChanges(changes: DbChanges): Promise<void> {
  const names = storesForChanges(changes)
  if (!names.length) return
  const db = await getDB()
  const tx = db.transaction(names, 'readwrite')
  const tasks: Promise<unknown>[] = []

  const raw = changes as unknown as Record<string, unknown>
  for (const name of names) {
    const store = tx.objectStore(name)
    const puts = raw[name] as Array<{ id: string }> | undefined
    const deleteKey = `delete${name[0].toUpperCase()}${name.slice(1)}`
    const deletes = raw[deleteKey] as string[] | undefined
    if (puts) for (const value of puts) tasks.push(store.put(value as never))
    if (deletes) for (const id of deletes) tasks.push(store.delete(id))
  }

  await Promise.all(tasks)
  await tx.done
}

export async function replaceAll(data: AppData): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORES, 'readwrite')
  await Promise.all(STORES.map((name) => tx.objectStore(name).clear()))
  await Promise.all([
    ...data.lists.map((value) => tx.objectStore('lists').put(value)),
    ...data.parcels.map((value) => tx.objectStore('parcels').put(value)),
    ...data.registry.map((value) => tx.objectStore('registry').put(value)),
    ...data.events.map((value) => tx.objectStore('events').put(value)),
    ...data.blacklist.map((value) => tx.objectStore('blacklist').put(value)),
    ...data.employees.map((value) => tx.objectStore('employees').put(value)),
    ...data.audit.map((value) => tx.objectStore('audit').put(value)),
  ])
  await tx.done
}

export async function storageUsage(): Promise<{ used: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null
    const estimate = await navigator.storage.estimate()
    return { used: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
  } catch {
    return null
  }
}

/** Test helper: closes and deletes the local database. */
export async function deleteDatabase(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise
    db.close()
    dbPromise = null
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => resolve()
  })
}
