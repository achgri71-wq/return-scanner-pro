import type {
  AppData,
  AuditEntry,
  BackupPayload,
  BlacklistEntry,
  Employee,
  ReturnList,
  ReturnParcel,
  ScanEvent,
  ScannedCode,
  Settings,
} from '../types'

export interface BackupCounts {
  lists: number
  parcels: number
  registry: number
  events: number
  blacklist: number
  employees: number
  audit: number
}

export interface BackupPreview {
  valid: boolean
  errors: string[]
  warnings: string[]
  counts: BackupCounts
  exportedAt?: string
  data?: AppData
  settings?: Partial<Settings>
  totalRecords: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function sanitizeLists(values: unknown[]): ReturnList[] {
  const result: ReturnList[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (!isObject(value)) continue
    const id = text(value.id)
    const name = text(value.name)
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    result.push({
      id,
      name,
      status:
        value.status === 'active' ||
        value.status === 'completed' ||
        value.status === 'archived'
          ? value.status
          : 'new',
      source:
        value.source === 'import' ||
        value.source === 'merge' ||
        value.source === 'replace' ||
        value.source === 'backup'
          ? value.source
          : 'manual',
      notes: text(value.notes),
      createdAt: text(value.createdAt) || new Date().toISOString(),
      updatedAt: text(value.updatedAt) || text(value.createdAt) || new Date().toISOString(),
      sourceFileName: text(value.sourceFileName) || undefined,
      closedAt: text(value.closedAt) || undefined,
      archivedAt: text(value.archivedAt) || undefined,
      lastScanAt: text(value.lastScanAt) || undefined,
    })
  }
  return result
}

function sanitizeParcels(values: unknown[], listIds: Set<string>): ReturnParcel[] {
  const result: ReturnParcel[] = []
  const seen = new Set<string>()
  const codeSeen = new Set<string>()
  for (const value of values) {
    if (!isObject(value)) continue
    const id = text(value.id)
    const listId = text(value.listId)
    const code = text(value.code).trim().toUpperCase()
    if (!id || !listId || !code || !listIds.has(listId) || seen.has(id)) continue
    const key = `${listId}::${code}`
    if (codeSeen.has(key)) continue
    codeSeen.add(key)
    seen.add(id)
    result.push({
      id,
      listId,
      code,
      status: value.status === 'returned' ? 'returned' : 'pending',
      addedAt: text(value.addedAt) || new Date().toISOString(),
      source:
        value.source === 'import' ||
        value.source === 'merge' ||
        value.source === 'replace' ||
        value.source === 'backup'
          ? value.source
          : 'manual',
      returnedAt: text(value.returnedAt) || undefined,
      returnedBy: text(value.returnedBy) || undefined,
    })
  }
  return result
}

function sanitizeRegistry(values: unknown[], listIds: Set<string>): ScannedCode[] {
  const result: ScannedCode[] = []
  const seen = new Set<string>()
  const codeSeen = new Set<string>()
  for (const value of values) {
    if (!isObject(value)) continue
    const id = text(value.id)
    const listId = text(value.listId)
    const code = text(value.code).trim().toUpperCase()
    if (!id || !listId || !code || !listIds.has(listId) || seen.has(id)) continue
    const key = `${listId}::${code}`
    if (codeSeen.has(key)) continue
    codeSeen.add(key)
    seen.add(id)
    result.push({
      id,
      listId,
      code,
      status:
        value.status === 'required-returned' || value.status === 'return-prohibited'
          ? value.status
          : 'not-required',
      firstScanAt: text(value.firstScanAt) || new Date().toISOString(),
      lastAttemptAt: text(value.lastAttemptAt) || new Date().toISOString(),
      attempts: Math.max(1, Number(value.attempts) || 1),
      lastResult:
        value.lastResult === 'accepted' ||
        value.lastResult === 'duplicate' ||
        value.lastResult === 'blacklisted' ||
        value.lastResult === 'other-list'
          ? value.lastResult
          : 'not-required',
      returnedAt: text(value.returnedAt) || undefined,
      blacklistReason: text(value.blacklistReason) || undefined,
      otherListId: text(value.otherListId) || undefined,
      otherListName: text(value.otherListName) || undefined,
    })
  }
  return result
}

function sanitizeEvents(values: unknown[]): ScanEvent[] {
  const result: ScanEvent[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (!isObject(value)) continue
    const id = text(value.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({
      id,
      at: text(value.at) || new Date().toISOString(),
      code: text(value.code).trim().toUpperCase(),
      listId: text(value.listId),
      listName: text(value.listName),
      source:
        value.source === 'camera' || value.source === 'hid' ? value.source : 'manual',
      result:
        value.result === 'accepted' ||
        value.result === 'duplicate' ||
        value.result === 'blacklisted' ||
        value.result === 'other-list'
          ? value.result
          : 'not-required',
      detail: text(value.detail) || undefined,
    })
  }
  return result
}

function sanitizeBlacklist(values: unknown[]): BlacklistEntry[] {
  const result: BlacklistEntry[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (!isObject(value)) continue
    const id = text(value.id)
    const code = text(value.code).trim().toUpperCase()
    if (!id || !code || seen.has(code)) continue
    seen.add(code)
    result.push({
      id,
      code,
      reason: text(value.reason),
      addedAt: text(value.addedAt) || new Date().toISOString(),
      addedBy: text(value.addedBy) || 'local',
      updatedAt: text(value.updatedAt) || undefined,
      updatedBy: text(value.updatedBy) || undefined,
    })
  }
  return result
}

function sanitizeEmployees(values: unknown[]): Employee[] {
  const result: Employee[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (!isObject(value)) continue
    const id = text(value.id)
    const name = text(value.name)
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    result.push({
      id,
      name,
      phone: text(value.phone) || undefined,
      role: value.role === 'admin' ? 'admin' : 'operator',
      active: value.active !== false,
      createdAt: text(value.createdAt) || new Date().toISOString(),
      updatedAt: text(value.updatedAt) || new Date().toISOString(),
    })
  }
  return result
}

function sanitizeAudit(values: unknown[]): AuditEntry[] {
  const result: AuditEntry[] = []
  const seen = new Set<string>()
  for (const value of values) {
    if (!isObject(value)) continue
    const id = text(value.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({
      id,
      at: text(value.at) || new Date().toISOString(),
      action: (text(value.action) || 'settings-update') as AuditEntry['action'],
      actor: text(value.actor) || 'local',
      target: text(value.target) || undefined,
      detail: text(value.detail),
      before: text(value.before) || undefined,
      after: text(value.after) || undefined,
    })
  }
  return result
}

export function validateBackup(value: unknown): BackupPreview {
  const errors: string[] = []
  const warnings: string[] = []
  const emptyCounts: BackupCounts = {
    lists: 0,
    parcels: 0,
    registry: 0,
    events: 0,
    blacklist: 0,
    employees: 0,
    audit: 0,
  }

  if (!isObject(value)) {
    return { valid: false, errors: ['not-object'], warnings, counts: emptyCounts, totalRecords: 0 }
  }
  if (value.app !== 'return-scanner-pro') errors.push('app-mismatch')
  if (value.version !== 1) errors.push('version-mismatch')
  for (const key of ['lists', 'parcels', 'registry', 'events', 'blacklist', 'employees', 'audit']) {
    if (!Array.isArray(value[key])) errors.push(`missing-${key}`)
  }
  if (errors.length) {
    return { valid: false, errors, warnings, counts: emptyCounts, totalRecords: 0 }
  }

  const lists = sanitizeLists(array(value.lists))
  const listIds = new Set(lists.map((list) => list.id))
  const parcels = sanitizeParcels(array(value.parcels), listIds)
  const registry = sanitizeRegistry(array(value.registry), listIds)
  const events = sanitizeEvents(array(value.events))
  const blacklist = sanitizeBlacklist(array(value.blacklist))
  const employees = sanitizeEmployees(array(value.employees))
  const audit = sanitizeAudit(array(value.audit))

  if (lists.length !== array(value.lists).length) warnings.push('invalid-lists-skipped')
  if (parcels.length !== array(value.parcels).length) warnings.push('invalid-parcels-skipped')
  if (registry.length !== array(value.registry).length) warnings.push('invalid-registry-skipped')
  if (events.length !== array(value.events).length) warnings.push('invalid-events-skipped')
  if (blacklist.length !== array(value.blacklist).length) warnings.push('invalid-blacklist-skipped')
  if (employees.length !== array(value.employees).length) warnings.push('invalid-employees-skipped')
  if (audit.length !== array(value.audit).length) warnings.push('invalid-audit-skipped')

  if (events.some((event) => !listIds.has(event.listId))) warnings.push('orphan-events')

  const data: AppData = { lists, parcels, registry, events, blacklist, employees, audit }
  const counts: BackupCounts = {
    lists: lists.length,
    parcels: parcels.length,
    registry: registry.length,
    events: events.length,
    blacklist: blacklist.length,
    employees: employees.length,
    audit: audit.length,
  }

  return {
    valid: true,
    errors,
    warnings,
    counts,
    exportedAt: text(value.exportedAt) || undefined,
    data,
    settings: isObject(value.settings) ? (value.settings as Partial<Settings>) : undefined,
    totalRecords: Object.values(counts).reduce((sum, count) => sum + count, 0),
  }
}

export function isBackupPayload(value: unknown): value is BackupPayload {
  return validateBackup(value).valid
}
