export type Language = 'fr' | 'ar'
export type ThemeMode = 'dark' | 'light' | 'system'

export type ListStatus = 'new' | 'active' | 'completed' | 'archived'
export type ListSource = 'manual' | 'import' | 'merge' | 'replace' | 'backup'
export type ParcelStatus = 'pending' | 'returned'
export type ScanSource = 'camera' | 'manual' | 'hid'

export type ScanResultKind = 'accepted' | 'duplicate' | 'blacklisted' | 'not-required' | 'other-list'
export type ScanOutcomeStatus =
  | ScanResultKind
  | 'invalid'
  | 'no-list'
  | 'list-closed'
  | 'ignored'

export type RegistryStatus = 'required-returned' | 'not-required' | 'return-prohibited'
export type EmployeeRole = 'operator' | 'admin'

export interface ReturnList {
  id: string
  name: string
  status: ListStatus
  source: ListSource
  notes: string
  createdAt: string
  updatedAt: string
  sourceFileName?: string
  closedAt?: string
  archivedAt?: string
  lastScanAt?: string
}

export interface ReturnParcel {
  id: string
  listId: string
  code: string
  status: ParcelStatus
  addedAt: string
  source: ListSource
  returnedAt?: string
  returnedBy?: string
}

export interface ScannedCode {
  id: string
  listId: string
  code: string
  status: RegistryStatus
  firstScanAt: string
  lastAttemptAt: string
  attempts: number
  lastResult: ScanResultKind
  returnedAt?: string
  blacklistReason?: string
  otherListId?: string
  otherListName?: string
}

export interface ScanEvent {
  id: string
  at: string
  code: string
  listId: string
  listName: string
  source: ScanSource
  result: ScanResultKind
  detail?: string
}

export interface BlacklistEntry {
  id: string
  code: string
  reason: string
  addedAt: string
  addedBy: string
  updatedAt?: string
  updatedBy?: string
}

export interface Employee {
  id: string
  name: string
  phone?: string
  role: EmployeeRole
  active: boolean
  createdAt: string
  updatedAt: string
}

export type AuditAction =
  | 'list-create'
  | 'list-rename'
  | 'list-import'
  | 'list-merge'
  | 'list-replace'
  | 'list-update'
  | 'list-close'
  | 'list-reopen'
  | 'list-archive'
  | 'return-correction'
  | 'code-delete'
  | 'blacklist-add'
  | 'blacklist-update'
  | 'blacklist-remove'
  | 'blacklist-import'
  | 'employee-create'
  | 'employee-update'
  | 'backup-export'
  | 'backup-import'
  | 'settings-update'

export interface AuditEntry {
  id: string
  at: string
  action: AuditAction
  actor: string
  target?: string
  detail: string
  before?: string
  after?: string
}

export interface Settings {
  lang: Language
  theme: ThemeMode
  sounds: boolean
  volume: number
  speech: boolean
  haptics: boolean
  keepAwake: boolean
  autoFocus: boolean
  confirmSwitch: boolean
  backupReminderDays: number
  lastBackupAt?: string
  activeListId?: string | null
  currentEmployeeId?: string | null
  operatorName: string
  adminPin: string
}

export interface AppData {
  lists: ReturnList[]
  parcels: ReturnParcel[]
  registry: ScannedCode[]
  events: ScanEvent[]
  blacklist: BlacklistEntry[]
  employees: Employee[]
  audit: AuditEntry[]
}

export interface BackupPayload extends AppData {
  app: 'return-scanner-pro'
  version: 1
  exportedAt: string
  settings?: Partial<Settings>
}

export interface ScanOutcome {
  id: string
  at: string
  raw: string
  code: string
  status: ScanOutcomeStatus
  listId?: string
  listName?: string
  parcelId?: string
  registryId?: string
  reason?: string
  otherListId?: string
  otherListName?: string
}

export interface ImportSummary {
  listId: string
  listName: string
  mode: 'new' | 'merge' | 'replace'
  imported: number
  duplicates: number
  rejected: number
  totalCodes: number
}

export interface CorrectionRequest {
  parcelId: string
  reason: string
  actor: string
  pin?: string
}

export type PersistStatus = 'idle' | 'saving' | 'saved' | 'error'
