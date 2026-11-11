import { create } from 'zustand'
import type {
  AppData,
  AuditAction,
  AuditEntry,
  BackupPayload,
  BlacklistEntry,
  CorrectionRequest,
  Employee,
  ImportSummary,
  ListSource,
  PersistStatus,
  ReturnList,
  ReturnParcel,
  ScanEvent,
  ScanOutcome,
  ScanSession,
  ScanSource,
  ScannedCode,
  Settings,
} from '../types'
import * as db from '../lib/db'
import { normalizeCode, isValidCode } from '../lib/codes'
import { buildScanIndex, decideScan, type ScanIndex } from '../lib/scan'
import { buildSessionReport } from '../lib/stats'
import { playFeedback } from '../lib/feedback'
import { clamp, uid } from '../lib/utils'
import { validateBackup, type BackupPreview } from '../lib/backup'

const SETTINGS_KEY = 'returnscanner.settings'

export const defaultSettings: Settings = {
  lang: 'fr',
  theme: 'dark',
  sounds: true,
  volume: 0.75,
  speech: false,
  haptics: true,
  keepAwake: false,
  autoFocus: true,
  confirmSwitch: true,
  backupReminderDays: 7,
  operatorName: '',
  adminPin: '',
  activeListId: null,
  currentEmployeeId: null,
}

function loadSettings(): Settings {
  try {
    if (typeof localStorage === 'undefined') return { ...defaultSettings }
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<Settings>
    return {
      ...defaultSettings,
      ...raw,
      volume: clamp(Number(raw.volume ?? defaultSettings.volume), 0, 1),
      backupReminderDays: clamp(
        Math.round(Number(raw.backupReminderDays ?? defaultSettings.backupReminderDays)),
        1,
        365,
      ),
      activeListId: raw.activeListId ?? null,
      currentEmployeeId: raw.currentEmployeeId ?? null,
    }
  } catch {
    return { ...defaultSettings }
  }
}

function persistSettings(settings: Settings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    }
  } catch {
    /* storage may be unavailable */
  }
}

export interface SimpleResult {
  ok: boolean
  error?: string
}

export interface ListResult extends SimpleResult {
  list?: ReturnList
}

export interface SessionResult extends SimpleResult {
  session?: ScanSession
}

export interface CloseResult extends SimpleResult {
  report?: ScanSession['report']
}

export interface ImportResult extends SimpleResult {
  summary?: ImportSummary
}

export interface ImportCodesInput {
  name: string
  codes: string[]
  mode: 'new' | 'merge' | 'replace'
  targetListId?: string
  notes?: string
  sourceFileName?: string
  fileDuplicates?: number
  fileRejected?: number
}

export interface BlacklistResult {
  added: number
  skipped: number
}

export interface EmployeeResult extends SimpleResult {
  employee?: Employee
}

export interface RestoreResult extends SimpleResult {
  added: number
  skipped: number
  preview?: BackupPreview
}

interface StoreState extends AppData {
  ready: boolean
  loadError?: string
  settings: Settings
  persistStatus: PersistStatus
  lastSavedAt?: string
  persistError?: string
  lastOutcome?: ScanOutcome
  lastOutcomeSeq: number
  init: () => Promise<void>
  setSettings: (patch: Partial<Settings>) => void
  createList: (input: { name: string; notes?: string }) => ListResult
  importCodes: (input: ImportCodesInput) => ImportResult
  addCodesToList: (listId: string, codes: string[]) => ImportResult
  switchList: (listId: string) => SimpleResult
  startSession: (listId?: string, employeeId?: string) => SessionResult
  closeSession: (sessionId?: string) => CloseResult
  reopenSession: (sessionId: string) => SessionResult
  reopenList: (listId: string) => SimpleResult
  archiveList: (listId: string) => SimpleResult
  renameList: (listId: string, name: string) => SimpleResult
  updateListNotes: (listId: string, notes: string) => SimpleResult
  scan: (raw: string, source: ScanSource, scanId?: string) => ScanOutcome
  addBlacklist: (entries: Array<{ code: string; reason: string }>, actor?: string) => BlacklistResult
  updateBlacklist: (
    id: string,
    patch: { code?: string; reason?: string },
    actor?: string,
  ) => SimpleResult
  removeBlacklist: (id: string, actor?: string) => SimpleResult
  addEmployee: (input: { name: string; phone?: string; role?: 'operator' | 'admin' }) => EmployeeResult
  updateEmployee: (
    id: string,
    patch: Partial<Pick<Employee, 'name' | 'phone' | 'role' | 'active'>>,
  ) => SimpleResult
  correctReturn: (request: CorrectionRequest) => SimpleResult
  createBackup: () => BackupPayload
  markBackupExported: () => void
  restoreBackup: (payload: unknown, mode: 'merge' | 'replace') => RestoreResult
}

let initPromise: Promise<void> | null = null
const processedScans = new Map<string, { outcome: ScanOutcome; at: number }>()

function readableId(prefix: string, existing: Set<string>): string {
  const now = new Date()
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}`
  let candidate = ''
  do {
    candidate = `${prefix}-${date}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  } while (existing.has(candidate))
  return candidate
}

function cleanName(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

function nameTaken(lists: ReturnList[], name: string, exceptId?: string): boolean {
  const needle = name.toLocaleLowerCase()
  return lists.some(
    (list) => list.id !== exceptId && list.name.toLocaleLowerCase() === needle,
  )
}

function normaliseCodeList(codes: string[]): {
  codes: string[]
  invalid: number
  duplicates: number
} {
  const seen = new Set<string>()
  const result: string[] = []
  let invalid = 0
  let duplicates = 0
  for (const raw of codes) {
    const code = normalizeCode(raw)
    if (!code || !isValidCode(code)) {
      invalid += 1
      continue
    }
    if (seen.has(code)) {
      duplicates += 1
      continue
    }
    seen.add(code)
    result.push(code)
  }
  return { codes: result, invalid, duplicates }
}

function sanitizeBackupSettings(patch: Partial<Settings> | undefined, current: Settings): Settings {
  if (!patch) return current
  return {
    ...current,
    lang: patch.lang === 'ar' || patch.lang === 'fr' ? patch.lang : current.lang,
    theme:
      patch.theme === 'dark' || patch.theme === 'light' || patch.theme === 'system'
        ? patch.theme
        : current.theme,
    sounds: typeof patch.sounds === 'boolean' ? patch.sounds : current.sounds,
    volume: typeof patch.volume === 'number' ? clamp(patch.volume, 0, 1) : current.volume,
    speech: typeof patch.speech === 'boolean' ? patch.speech : current.speech,
    haptics: typeof patch.haptics === 'boolean' ? patch.haptics : current.haptics,
    keepAwake: typeof patch.keepAwake === 'boolean' ? patch.keepAwake : current.keepAwake,
    autoFocus: typeof patch.autoFocus === 'boolean' ? patch.autoFocus : current.autoFocus,
    confirmSwitch:
      typeof patch.confirmSwitch === 'boolean' ? patch.confirmSwitch : current.confirmSwitch,
    backupReminderDays:
      typeof patch.backupReminderDays === 'number'
        ? clamp(Math.round(patch.backupReminderDays), 1, 365)
        : current.backupReminderDays,
    operatorName:
      typeof patch.operatorName === 'string' ? patch.operatorName : current.operatorName,
    adminPin: typeof patch.adminPin === 'string' ? patch.adminPin : current.adminPin,
  }
}

export const useStore = create<StoreState>((set, get) => {
  let pendingSaves = 0
  let saveChain: Promise<void> = Promise.resolve()
  let scanCache: {
    lists: ReturnList[]
    parcels: ReturnParcel[]
    blacklist: BlacklistEntry[]
    registry: ScannedCode[]
    activeListId: string | null
    index: ScanIndex
    registryByKey: Map<string, ScannedCode>
    listById: Map<string, ReturnList>
  } | null = null

  const persist = (changes: db.DbChanges) => {
    pendingSaves += 1
    set({ persistStatus: 'saving' })
    saveChain = saveChain.then(async () => {
      try {
        await db.writeChanges(changes)
        pendingSaves -= 1
        if (pendingSaves === 0) {
          set({
            persistStatus: 'saved',
            lastSavedAt: new Date().toISOString(),
            persistError: undefined,
          })
        }
      } catch (error) {
        pendingSaves -= 1
        set({
          persistStatus: 'error',
          persistError: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  /** Full database replacement, serialized with every pending incremental save. */
  const replaceAllPersisted = (data: AppData) => {
    pendingSaves += 1
    set({ persistStatus: 'saving' })
    saveChain = saveChain.then(async () => {
      try {
        await db.replaceAll(data)
        pendingSaves -= 1
        if (pendingSaves === 0) {
          set({
            persistStatus: 'saved',
            lastSavedAt: new Date().toISOString(),
            persistError: undefined,
          })
        }
      } catch (error) {
        pendingSaves -= 1
        set({
          persistStatus: 'error',
          persistError: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }

  const actorFor = (state: StoreState, explicit?: string): string => {
    if (explicit?.trim()) return explicit.trim()
    const employee = state.employees.find((item) => item.id === state.settings.currentEmployeeId)
    return employee?.name || state.settings.operatorName.trim() || 'local'
  }

  const audit = (
    state: StoreState,
    action: AuditAction,
    detail: string,
    target?: string,
    before?: string,
    after?: string,
    actor?: string,
  ): AuditEntry => ({
    id: uid('aud'),
    at: new Date().toISOString(),
    action,
    actor: actorFor(state, actor),
    target,
    detail,
    before,
    after,
  })

  const scanCacheFor = (state: StoreState) => {
    const activeListId = state.settings.activeListId ?? null
    if (
      scanCache &&
      scanCache.lists === state.lists &&
      scanCache.parcels === state.parcels &&
      scanCache.blacklist === state.blacklist &&
      scanCache.registry === state.registry &&
      scanCache.activeListId === activeListId
    ) {
      return scanCache
    }
    const index = buildScanIndex(activeListId, state.lists, state.parcels, state.blacklist)
    scanCache = {
      lists: state.lists,
      parcels: state.parcels,
      blacklist: state.blacklist,
      registry: state.registry,
      activeListId,
      index,
      registryByKey: new Map(
        state.registry.map((entry) => [`${entry.listId}::${entry.code}`, entry]),
      ),
      listById: new Map(state.lists.map((list) => [list.id, list])),
    }
    return scanCache
  }

  const soundOptions = (state: StoreState) => ({
    enabled: state.settings.sounds,
    volume: state.settings.volume,
    speech: state.settings.speech,
    haptics: state.settings.haptics,
    lang: state.settings.lang,
  })

  const closeSessionInternal = (session: ScanSession, now: string) => {
    const state = get()
    const list = state.lists.find((item) => item.id === session.listId)
    if (!list) return null
    const report = buildSessionReport(session, list, state, now)
    const updatedSession: ScanSession = {
      ...session,
      status: 'closed',
      endedAt: now,
      lastActivityAt: now,
      report,
      reportHistory: [...(session.reportHistory ?? []), report],
    }
    const updatedList: ReturnList = {
      ...list,
      status: 'completed',
      closedAt: now,
      updatedAt: now,
    }
    const sessionAudit = audit(
      state,
      'session-close',
      `${list.name}: ${report.listReturned}/${report.listTotal} (${Math.round(report.completion * 100)}%)`,
      session.id,
    )
    const listAudit = audit(state, 'list-close', list.name, list.id)

    set((current) => ({
      sessions: current.sessions.map((item) =>
        item.id === session.id ? updatedSession : item,
      ),
      lists: current.lists.map((item) => (item.id === list.id ? updatedList : item)),
      audit: [listAudit, sessionAudit, ...current.audit],
    }))
    persist({
      sessions: [updatedSession],
      lists: [updatedList],
      audit: [sessionAudit, listAudit],
    })
    return report
  }

  const updateListAfterScan = (list: ReturnList, now: string): ReturnList => ({
    ...list,
    status: list.status === 'new' ? 'active' : list.status,
    lastScanAt: now,
    updatedAt: now,
  })

  return {
    ready: false,
    lists: [],
    parcels: [],
    registry: [],
    events: [],
    blacklist: [],
    sessions: [],
    employees: [],
    audit: [],
    settings: loadSettings(),
    persistStatus: 'idle',
    lastOutcomeSeq: 0,

    init: async () => {
      if (get().ready) return
      if (initPromise) return initPromise
      initPromise = (async () => {
        try {
          const data = await db.loadAll()
          const settings = get().settings
          const listIds = new Set(data.lists.map((list) => list.id))
          const openSessions = data.sessions
            .filter((session) => session.status === 'open' && listIds.has(session.listId))
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
          const keepOpen = openSessions[0]
          const now = new Date().toISOString()
          const fixedSessions = data.sessions.map((session) =>
            session.status === 'open' && session.id !== keepOpen?.id
              ? { ...session, status: 'closed' as const, endedAt: now }
              : session,
          )
          const fixedLists = data.lists.map((list) => {
            if (list.status === 'completed' || list.status === 'archived') {
              const hasOpen = fixedSessions.some(
                (session) => session.status === 'open' && session.listId === list.id,
              )
              if (hasOpen) {
                return { ...list, status: 'active' as const, closedAt: undefined, archivedAt: undefined }
              }
            }
            return list
          })

          let activeListId = settings.activeListId ?? null
          if (keepOpen) activeListId = keepOpen.listId
          else if (
            !activeListId ||
            !fixedLists.some(
              (list) =>
                list.id === activeListId &&
                (list.status === 'new' || list.status === 'active'),
            )
          ) {
            activeListId = null
          }
          const currentEmployeeId =
            settings.currentEmployeeId &&
            data.employees.some(
              (employee) => employee.id === settings.currentEmployeeId && employee.active,
            )
              ? settings.currentEmployeeId
              : null
          const nextSettings = { ...settings, activeListId, currentEmployeeId }
          persistSettings(nextSettings)
          const nextData: AppData = { ...data, lists: fixedLists, sessions: fixedSessions }
          set({ ...nextData, settings: nextSettings, ready: true })
          if (
            fixedSessions.some(
              (session, index) => session.status !== data.sessions[index]?.status,
            ) ||
            fixedLists.some((list, index) => list.status !== data.lists[index]?.status)
          ) {
            const changedSessions = fixedSessions.filter(
              (session, index) => session.status !== data.sessions[index]?.status,
            )
            const changedLists = fixedLists.filter(
              (list, index) => list.status !== data.lists[index]?.status,
            )
            persist({ sessions: changedSessions, lists: changedLists })
          }
        } catch (error) {
          set({
            ready: true,
            loadError: error instanceof Error ? error.message : String(error),
          })
        }
      })()
      return initPromise
    },

    setSettings: (patch) => {
      const current = get().settings
      const settings: Settings = {
        ...current,
        ...patch,
        volume: clamp(Number(patch.volume ?? current.volume), 0, 1),
        backupReminderDays: clamp(
          Math.round(Number(patch.backupReminderDays ?? current.backupReminderDays)),
          1,
          365,
        ),
        activeListId:
          patch.activeListId !== undefined ? patch.activeListId : current.activeListId,
        currentEmployeeId:
          patch.currentEmployeeId !== undefined
            ? patch.currentEmployeeId
            : current.currentEmployeeId,
      }
      set({ settings })
      persistSettings(settings)
    },

    createList: ({ name, notes = '' }) => {
      const state = get()
      const clean = cleanName(name)
      if (!clean) return { ok: false, error: 'empty-name' }
      if (nameTaken(state.lists, clean)) return { ok: false, error: 'duplicate-name' }
      const now = new Date().toISOString()
      const list: ReturnList = {
        id: readableId('RL', new Set(state.lists.map((item) => item.id))),
        name: clean,
        status: 'new',
        source: 'manual',
        notes: String(notes ?? '').trim(),
        createdAt: now,
        updatedAt: now,
      }
      const entry = audit(state, 'list-create', clean, list.id)
      set((current) => ({
        lists: [list, ...current.lists],
        audit: [entry, ...current.audit],
      }))
      persist({ lists: [list], audit: [entry] })
      return { ok: true, list }
    },

    importCodes: (input) => {
      const state = get()
      const mode = input.mode
      const parsed = normaliseCodeList(input.codes)
      const fileDuplicates = Math.max(0, Number(input.fileDuplicates) || 0)
      const fileRejected = Math.max(0, Number(input.fileRejected) || 0)
      const now = new Date().toISOString()

      let list: ReturnList | undefined
      if (mode === 'new') {
        const clean = cleanName(input.name)
        if (!clean) return { ok: false, error: 'empty-name' }
        if (nameTaken(state.lists, clean)) return { ok: false, error: 'duplicate-name' }
        list = {
          id: readableId('RL', new Set(state.lists.map((item) => item.id))),
          name: clean,
          status: 'new',
          source: 'import',
          notes: String(input.notes ?? '').trim(),
          createdAt: now,
          updatedAt: now,
          sourceFileName: input.sourceFileName,
        }
      } else {
        list = state.lists.find((item) => item.id === input.targetListId)
        if (!list) return { ok: false, error: 'list-not-found' }
        if (list.status === 'completed' || list.status === 'archived') {
          return { ok: false, error: 'list-closed' }
        }
        if (mode === 'replace') {
          const hasOpenSession = state.sessions.some(
            (session) => session.status === 'open' && session.listId === list?.id,
          )
          if (hasOpenSession) return { ok: false, error: 'session-open' }
        }
      }

      const existingParcels =
        mode === 'new' ? [] : state.parcels.filter((parcel) => parcel.listId === list?.id)
      const existingCodes = new Set(existingParcels.map((parcel) => parcel.code))
      const toAdd =
        mode === 'replace'
          ? parsed.codes
          : parsed.codes.filter((code) => !existingCodes.has(code))
      const existingDuplicates =
        mode === 'new' ? 0 : parsed.codes.length - toAdd.length
      const source: ListSource = mode === 'new' ? 'import' : mode === 'replace' ? 'replace' : 'merge'
      const parcels: ReturnParcel[] = toAdd.map((code) => ({
        id: uid('prc'),
        listId: list?.id ?? '',
        code,
        status: 'pending',
        addedAt: now,
        source,
      }))

      let updatedList: ReturnList
      if (mode === 'new') {
        updatedList = list as ReturnList
      } else if (mode === 'replace') {
        updatedList = {
          ...(list as ReturnList),
          status: 'new',
          source: 'replace',
          notes: String(input.notes ?? (list as ReturnList).notes ?? '').trim(),
          updatedAt: now,
          sourceFileName: input.sourceFileName,
          lastScanAt: undefined,
          closedAt: undefined,
          archivedAt: undefined,
        }
      } else {
        updatedList = {
          ...(list as ReturnList),
          updatedAt: now,
          sourceFileName: input.sourceFileName ?? (list as ReturnList).sourceFileName,
        }
      }

      const summary: ImportSummary = {
        listId: updatedList.id,
        listName: updatedList.name,
        mode,
        imported: parcels.length,
        duplicates: fileDuplicates + parsed.duplicates + existingDuplicates,
        rejected: fileRejected + parsed.invalid,
        totalCodes:
          parcels.length +
          fileDuplicates +
          parsed.duplicates +
          existingDuplicates +
          fileRejected +
          parsed.invalid,
      }

      const action: AuditAction =
        mode === 'new' ? 'list-import' : mode === 'replace' ? 'list-replace' : 'list-merge'
      const entry = audit(
        state,
        action,
        `${updatedList.name}: +${summary.imported}, ${summary.duplicates} doublons, ${summary.rejected} rejetés`,
        updatedList.id,
        mode === 'replace' ? `${existingParcels.length} codes remplacés` : undefined,
        `${parcels.length} codes`,
      )

      const oldParcels = mode === 'replace' ? existingParcels : []
      const oldRegistry =
        mode === 'replace' ? state.registry.filter((item) => item.listId === updatedList.id) : []

      set((current) => ({
        lists:
          mode === 'new'
            ? [updatedList, ...current.lists]
            : current.lists.map((item) => (item.id === updatedList.id ? updatedList : item)),
        parcels:
          mode === 'merge'
            ? [...current.parcels, ...parcels]
            : [
                ...current.parcels.filter((parcel) => parcel.listId !== updatedList.id),
                ...parcels,
              ],
        registry:
          mode === 'replace'
            ? current.registry.filter((item) => item.listId !== updatedList.id)
            : current.registry,
        audit: [entry, ...current.audit],
      }))

      persist({
        lists: [updatedList],
        parcels,
        registry: mode === 'replace' ? [] : undefined,
        deleteParcels: oldParcels.map((parcel) => parcel.id),
        deleteRegistry: oldRegistry.map((item) => item.id),
        audit: [entry],
      })

      return { ok: true, summary }
    },

    addCodesToList: (listId, codes) => {
      const list = get().lists.find((item) => item.id === listId)
      if (!list) return { ok: false, error: 'list-not-found' }
      return get().importCodes({
        name: list.name,
        codes,
        mode: 'merge',
        targetListId: listId,
      })
    },

    switchList: (listId) => {
      const state = get()
      const list = state.lists.find((item) => item.id === listId)
      if (!list) return { ok: false, error: 'list-not-found' }
      if (list.status === 'completed' || list.status === 'archived') {
        return { ok: false, error: 'list-closed' }
      }
      if (state.settings.activeListId === listId) return { ok: true }

      const open = state.sessions.find((session) => session.status === 'open')
      if (open && open.listId !== listId) {
        const closed = get().closeSession(open.id)
        if (!closed.ok) return { ok: false, error: closed.error ?? 'close-failed' }
      }
      get().setSettings({ activeListId: listId })
      return { ok: true }
    },

    startSession: (listId, employeeId) => {
      const state = get()
      const targetId = listId ?? state.settings.activeListId
      if (!targetId) return { ok: false, error: 'no-list' }
      let list = state.lists.find((item) => item.id === targetId)
      if (!list) return { ok: false, error: 'list-not-found' }
      if (list.status === 'completed' || list.status === 'archived') {
        return { ok: false, error: 'list-closed' }
      }
      const existing = state.sessions.find(
        (session) => session.status === 'open' && session.listId === targetId,
      )
      if (existing) {
        get().setSettings({ activeListId: targetId })
        return { ok: true, session: existing }
      }
      const otherOpen = state.sessions.find((session) => session.status === 'open')
      if (otherOpen) {
        const closed = get().closeSession(otherOpen.id)
        if (!closed.ok) return { ok: false, error: closed.error ?? 'close-failed' }
      }
      list = get().lists.find((item) => item.id === targetId)
      if (!list) return { ok: false, error: 'list-not-found' }

      const employeeChoice =
        state.employees.find(
          (employee) =>
            employee.id === (employeeId ?? state.settings.currentEmployeeId) && employee.active,
        ) ?? state.employees.find((employee) => employee.id === employeeId)
      const now = new Date().toISOString()
      const session: ScanSession = {
        id: readableId('SES', new Set(state.sessions.map((item) => item.id))),
        listId: list.id,
        listName: list.name,
        employeeId: employeeChoice?.id,
        employeeName: employeeChoice?.name,
        startedAt: now,
        status: 'open',
        lastActivityAt: now,
      }
      const updatedList: ReturnList = {
        ...list,
        status: 'active',
        updatedAt: now,
        closedAt: undefined,
        archivedAt: undefined,
      }
      const entry = audit(state, 'session-start', list.name, session.id)
      set((current) => ({
        sessions: [session, ...current.sessions],
        lists: current.lists.map((item) => (item.id === list?.id ? updatedList : item)),
        audit: [entry, ...current.audit],
      }))
      get().setSettings({ activeListId: list.id })
      persist({ sessions: [session], lists: [updatedList], audit: [entry] })
      return { ok: true, session }
    },

    closeSession: (sessionId) => {
      const state = get()
      const session = sessionId
        ? state.sessions.find((item) => item.id === sessionId && item.status === 'open')
        : state.sessions.find((item) => item.status === 'open')
      if (!session) return { ok: false, error: 'no-session' }
      const report = closeSessionInternal(session, new Date().toISOString())
      if (!report) return { ok: false, error: 'list-not-found' }
      return { ok: true, report }
    },

    reopenSession: (sessionId) => {
      const state = get()
      const target = state.sessions.find((item) => item.id === sessionId)
      if (!target) return { ok: false, error: 'session-not-found' }
      const list = state.lists.find((item) => item.id === target.listId)
      if (!list) return { ok: false, error: 'list-not-found' }
      if (target.status === 'open') return { ok: true, session: target }

      const otherOpen = state.sessions.find(
        (session) => session.status === 'open' && session.id !== target.id,
      )
      if (otherOpen) {
        const closed = get().closeSession(otherOpen.id)
        if (!closed.ok) return { ok: false, error: closed.error ?? 'close-failed' }
      }
      const current = get()
      const now = new Date().toISOString()
      const reopened: ScanSession = {
        ...target,
        status: 'open',
        endedAt: undefined,
        lastActivityAt: now,
      }
      const updatedList: ReturnList = {
        ...list,
        status: 'active',
        closedAt: undefined,
        archivedAt: undefined,
        updatedAt: now,
      }
      const entry = audit(current, 'session-reopen', list.name, target.id)
      set((stateNow) => ({
        sessions: stateNow.sessions.map((item) => (item.id === target.id ? reopened : item)),
        lists: stateNow.lists.map((item) => (item.id === list.id ? updatedList : item)),
        audit: [entry, ...stateNow.audit],
      }))
      get().setSettings({ activeListId: list.id })
      persist({ sessions: [reopened], lists: [updatedList], audit: [entry] })
      return { ok: true, session: reopened }
    },

    reopenList: (listId) => {
      const state = get()
      const list = state.lists.find((item) => item.id === listId)
      if (!list) return { ok: false, error: 'list-not-found' }
      if (list.status === 'new' || list.status === 'active') return { ok: true }
      const now = new Date().toISOString()
      const updated: ReturnList = {
        ...list,
        status: 'active',
        closedAt: undefined,
        archivedAt: undefined,
        updatedAt: now,
      }
      const entry = audit(state, 'list-reopen', list.name, list.id)
      set((current) => ({
        lists: current.lists.map((item) => (item.id === list.id ? updated : item)),
        audit: [entry, ...current.audit],
      }))
      persist({ lists: [updated], audit: [entry] })
      return { ok: true }
    },

    archiveList: (listId) => {
      const state = get()
      const list = state.lists.find((item) => item.id === listId)
      if (!list) return { ok: false, error: 'list-not-found' }
      if (list.status === 'archived') return { ok: true }
      if (list.status !== 'completed') return { ok: false, error: 'not-completed' }
      const now = new Date().toISOString()
      const updated: ReturnList = { ...list, status: 'archived', archivedAt: now, updatedAt: now }
      const entry = audit(state, 'list-archive', list.name, list.id)
      set((current) => ({
        lists: current.lists.map((item) => (item.id === list.id ? updated : item)),
        audit: [entry, ...current.audit],
      }))
      if (state.settings.activeListId === list.id) get().setSettings({ activeListId: null })
      persist({ lists: [updated], audit: [entry] })
      return { ok: true }
    },

    renameList: (listId, name) => {
      const state = get()
      const list = state.lists.find((item) => item.id === listId)
      if (!list) return { ok: false, error: 'list-not-found' }
      const clean = cleanName(name)
      if (!clean) return { ok: false, error: 'empty-name' }
      if (nameTaken(state.lists, clean, listId)) return { ok: false, error: 'duplicate-name' }
      const now = new Date().toISOString()
      const updated: ReturnList = { ...list, name: clean, updatedAt: now }
      const sessions = state.sessions
        .filter((session) => session.listId === listId)
        .map((session) => ({ ...session, listName: clean }))
      const entry = audit(state, 'list-rename', `${list.name} → ${clean}`, listId, list.name, clean)
      set((current) => ({
        lists: current.lists.map((item) => (item.id === listId ? updated : item)),
        sessions: current.sessions.map((session) =>
          session.listId === listId ? { ...session, listName: clean } : session,
        ),
        audit: [entry, ...current.audit],
      }))
      persist({ lists: [updated], sessions, audit: [entry] })
      return { ok: true }
    },

    updateListNotes: (listId, notes) => {
      const state = get()
      const list = state.lists.find((item) => item.id === listId)
      if (!list) return { ok: false, error: 'list-not-found' }
      const clean = String(notes ?? '').trim()
      if (clean === list.notes) return { ok: true }
      const now = new Date().toISOString()
      const updated: ReturnList = { ...list, notes: clean, updatedAt: now }
      const entry = audit(state, 'list-update', 'Notes modifiées', listId, list.notes, clean)
      set((current) => ({
        lists: current.lists.map((item) => (item.id === listId ? updated : item)),
        audit: [entry, ...current.audit],
      }))
      persist({ lists: [updated], audit: [entry] })
      return { ok: true }
    },

    scan: (raw, source, scanId) => {
      const state = get()
      const now = new Date().toISOString()
      const requestId = scanId ?? uid('scanreq')
      const processed = processedScans.get(requestId)
      if (processed && Date.now() - processed.at < 60_000) return processed.outcome

      if (processedScans.size > 400) {
        const cutoff = Date.now() - 60_000
        for (const [key, value] of processedScans) {
          if (value.at < cutoff) processedScans.delete(key)
        }
      }

      const remember = (outcome: ScanOutcome): ScanOutcome => {
        processedScans.set(requestId, { outcome, at: Date.now() })
        set((current) => ({ lastOutcome: outcome, lastOutcomeSeq: current.lastOutcomeSeq + 1 }))
        return outcome
      }

      const code = normalizeCode(raw)
      const base = { id: requestId, at: now, raw: String(raw ?? ''), code }
      if (!code || !isValidCode(code)) {
        return remember({ ...base, status: 'invalid' })
      }

      const activeListId = state.settings.activeListId ?? null
      if (!activeListId) return remember({ ...base, status: 'no-list' })
      const list = state.lists.find((item) => item.id === activeListId)
      if (!list) return remember({ ...base, status: 'no-list' })
      if (list.status === 'completed' || list.status === 'archived') {
        return remember({ ...base, status: 'list-closed', listId: list.id, listName: list.name })
      }

      const session = state.sessions.find(
        (item) => item.status === 'open' && item.listId === activeListId,
      )
      if (!session) {
        return remember({ ...base, status: 'no-session', listId: list.id, listName: list.name })
      }

      const cache = scanCacheFor(state)
      const decision = decideScan(code, cache.index)
      if (decision.kind === 'no-list') return remember({ ...base, status: 'no-list' })
      if (decision.kind === 'list-closed') {
        return remember({
          ...base,
          status: 'list-closed',
          listId: decision.list.id,
          listName: decision.list.name,
        })
      }

      const existingRegistry = cache.registryByKey.get(`${list.id}::${code}`)
      const upsertRegistry = (patch: Partial<ScannedCode>): ScannedCode => {
        if (existingRegistry) {
          return {
            ...existingRegistry,
            lastAttemptAt: now,
            attempts: existingRegistry.attempts + 1,
            lastSessionId: session.id,
            ...patch,
          }
        }
        return {
          id: uid('reg'),
          listId: list.id,
          code,
          status: 'not-required',
          firstScanAt: now,
          lastAttemptAt: now,
          attempts: 1,
          lastResult: 'not-required',
          firstSessionId: session.id,
          lastSessionId: session.id,
          ...patch,
        }
      }

      const makeEvent = (
        result: ScanEvent['result'],
        detail?: string,
      ): ScanEvent => ({
        id: uid('evt'),
        at: now,
        code,
        listId: list.id,
        listName: list.name,
        sessionId: session.id,
        employeeId: session.employeeId,
        employeeName: session.employeeName,
        source,
        result,
        detail,
      })

      const nextList = updateListAfterScan(list, now)
      const nextSession: ScanSession = { ...session, lastActivityAt: now }

      if (decision.kind === 'blacklisted') {
        const registry = upsertRegistry({
          status: 'return-prohibited',
          lastResult: 'blacklisted',
          blacklistReason: decision.entry.reason || undefined,
        })
        const event = makeEvent('blacklisted', decision.entry.reason || undefined)
        set((current) => ({
          registry: existingRegistry
            ? current.registry.map((item) => (item.id === registry.id ? registry : item))
            : [registry, ...current.registry],
          events: [event, ...current.events],
          lists: current.lists.map((item) => (item.id === list.id ? nextList : item)),
          sessions: current.sessions.map((item) =>
            item.id === session.id ? nextSession : item,
          ),
          lastOutcome: {
            ...base,
            status: 'blacklisted',
            listId: list.id,
            listName: list.name,
            registryId: registry.id,
            reason: decision.entry.reason || undefined,
          },
          lastOutcomeSeq: current.lastOutcomeSeq + 1,
        }))
        persist({
          registry: [registry],
          events: [event],
          lists: [nextList],
          sessions: [nextSession],
        })
        playFeedback('warning', soundOptions(state))
        const outcome: ScanOutcome = {
          ...base,
          status: 'blacklisted',
          listId: list.id,
          listName: list.name,
          registryId: registry.id,
          reason: decision.entry.reason || undefined,
        }
        processedScans.set(requestId, { outcome, at: Date.now() })
        return outcome
      }

      if (decision.kind === 'accepted') {
        const parcel: ReturnParcel = {
          ...decision.parcel,
          status: 'returned',
          returnedAt: now,
          returnedBy: session.employeeName ?? actorFor(state),
          sessionId: session.id,
        }
        const registry = upsertRegistry({
          status: 'required-returned',
          lastResult: 'accepted',
          returnedAt: now,
          blacklistReason: undefined,
          otherListId: undefined,
          otherListName: undefined,
        })
        const event = makeEvent('accepted')
        set((current) => ({
          parcels: current.parcels.map((item) => (item.id === parcel.id ? parcel : item)),
          registry: existingRegistry
            ? current.registry.map((item) => (item.id === registry.id ? registry : item))
            : [registry, ...current.registry],
          events: [event, ...current.events],
          lists: current.lists.map((item) => (item.id === list.id ? nextList : item)),
          sessions: current.sessions.map((item) =>
            item.id === session.id ? nextSession : item,
          ),
          lastOutcome: {
            ...base,
            status: 'accepted',
            listId: list.id,
            listName: list.name,
            parcelId: parcel.id,
            registryId: registry.id,
          },
          lastOutcomeSeq: current.lastOutcomeSeq + 1,
        }))
        persist({
          parcels: [parcel],
          registry: [registry],
          events: [event],
          lists: [nextList],
          sessions: [nextSession],
        })
        playFeedback('success', soundOptions(state))
        const outcome: ScanOutcome = {
          ...base,
          status: 'accepted',
          listId: list.id,
          listName: list.name,
          parcelId: parcel.id,
          registryId: registry.id,
        }
        processedScans.set(requestId, { outcome, at: Date.now() })
        return outcome
      }

      if (decision.kind === 'duplicate') {
        const registry = upsertRegistry({
          status: 'required-returned',
          lastResult: 'duplicate',
          returnedAt: decision.parcel.returnedAt ?? now,
          blacklistReason: undefined,
          otherListId: undefined,
          otherListName: undefined,
        })
        const event = makeEvent('duplicate')
        set((current) => ({
          registry: existingRegistry
            ? current.registry.map((item) => (item.id === registry.id ? registry : item))
            : [registry, ...current.registry],
          events: [event, ...current.events],
          lists: current.lists.map((item) => (item.id === list.id ? nextList : item)),
          sessions: current.sessions.map((item) =>
            item.id === session.id ? nextSession : item,
          ),
          lastOutcome: {
            ...base,
            status: 'duplicate',
            listId: list.id,
            listName: list.name,
            parcelId: decision.parcel.id,
            registryId: registry.id,
          },
          lastOutcomeSeq: current.lastOutcomeSeq + 1,
        }))
        persist({
          registry: [registry],
          events: [event],
          lists: [nextList],
          sessions: [nextSession],
        })
        playFeedback('duplicate', soundOptions(state))
        const outcome: ScanOutcome = {
          ...base,
          status: 'duplicate',
          listId: list.id,
          listName: list.name,
          parcelId: decision.parcel.id,
          registryId: registry.id,
        }
        processedScans.set(requestId, { outcome, at: Date.now() })
        return outcome
      }

      const otherList = decision.kind === 'other-list' ? decision.list : undefined
      const registry = upsertRegistry({
        status: 'not-required',
        lastResult: otherList ? 'other-list' : 'not-required',
        otherListId: otherList?.id,
        otherListName: otherList?.name,
        blacklistReason: undefined,
      })
      const event = makeEvent(otherList ? 'other-list' : 'not-required', otherList?.name)
      const outcome: ScanOutcome = {
        ...base,
        status: otherList ? 'other-list' : 'not-required',
        listId: list.id,
        listName: list.name,
        registryId: registry.id,
        otherListId: otherList?.id,
        otherListName: otherList?.name,
      }
      set((current) => ({
        registry: existingRegistry
          ? current.registry.map((item) => (item.id === registry.id ? registry : item))
          : [registry, ...current.registry],
        events: [event, ...current.events],
        lists: current.lists.map((item) => (item.id === list.id ? nextList : item)),
        sessions: current.sessions.map((item) => (item.id === session.id ? nextSession : item)),
        lastOutcome: outcome,
        lastOutcomeSeq: current.lastOutcomeSeq + 1,
      }))
      persist({
        registry: [registry],
        events: [event],
        lists: [nextList],
        sessions: [nextSession],
      })
      playFeedback('rejection', soundOptions(state))
      processedScans.set(requestId, { outcome, at: Date.now() })
      return outcome
    },

    addBlacklist: (entries, actor) => {
      const state = get()
      const now = new Date().toISOString()
      const existing = new Set(state.blacklist.map((entry) => entry.code))
      const additions: BlacklistEntry[] = []
      let skipped = 0
      for (const input of entries) {
        const code = normalizeCode(input.code)
        if (!code || !isValidCode(code) || existing.has(code)) {
          skipped += 1
          continue
        }
        existing.add(code)
        additions.push({
          id: uid('blk'),
          code,
          reason: String(input.reason ?? '').trim(),
          addedAt: now,
          addedBy: actorFor(state, actor),
        })
      }
      if (!additions.length) return { added: 0, skipped }
      const entry = audit(
        state,
        'blacklist-add',
        `${additions.length} code(s): ${additions
          .slice(0, 8)
          .map((item) => item.code)
          .join(', ')}${additions.length > 8 ? '…' : ''}`,
        undefined,
        undefined,
        undefined,
        actor,
      )
      set((current) => ({
        blacklist: [...additions, ...current.blacklist],
        audit: [entry, ...current.audit],
      }))
      persist({ blacklist: additions, audit: [entry] })
      return { added: additions.length, skipped }
    },

    updateBlacklist: (id, patch, actor) => {
      const state = get()
      const existing = state.blacklist.find((entry) => entry.id === id)
      if (!existing) return { ok: false, error: 'not-found' }
      const code = patch.code !== undefined ? normalizeCode(patch.code) : existing.code
      if (!code || !isValidCode(code)) return { ok: false, error: 'invalid-code' }
      if (state.blacklist.some((entry) => entry.id !== id && entry.code === code)) {
        return { ok: false, error: 'duplicate-code' }
      }
      const updated: BlacklistEntry = {
        ...existing,
        code,
        reason: patch.reason !== undefined ? String(patch.reason).trim() : existing.reason,
        updatedAt: new Date().toISOString(),
        updatedBy: actorFor(state, actor),
      }
      const entry = audit(
        state,
        'blacklist-update',
        `${existing.code} → ${updated.code} | ${updated.reason || '—'}`,
        updated.code,
        `${existing.code} | ${existing.reason}`,
        `${updated.code} | ${updated.reason}`,
        actor,
      )
      set((current) => ({
        blacklist: current.blacklist.map((item) => (item.id === id ? updated : item)),
        audit: [entry, ...current.audit],
      }))
      persist({ blacklist: [updated], audit: [entry] })
      return { ok: true }
    },

    removeBlacklist: (id, actor) => {
      const state = get()
      const existing = state.blacklist.find((entry) => entry.id === id)
      if (!existing) return { ok: false, error: 'not-found' }
      const entry = audit(
        state,
        'blacklist-remove',
        `${existing.code} | ${existing.reason || '—'}`,
        existing.code,
        `${existing.code} | ${existing.reason}`,
        'removed',
        actor,
      )
      set((current) => ({
        blacklist: current.blacklist.filter((item) => item.id !== id),
        audit: [entry, ...current.audit],
      }))
      persist({ deleteBlacklist: [id], audit: [entry] })
      return { ok: true }
    },

    addEmployee: (input) => {
      const state = get()
      const name = cleanName(input.name)
      if (!name) return { ok: false, error: 'empty-name' }
      if (
        state.employees.some(
          (employee) => employee.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      ) {
        return { ok: false, error: 'duplicate-name' }
      }
      const now = new Date().toISOString()
      const employee: Employee = {
        id: uid('emp'),
        name,
        phone: String(input.phone ?? '').trim() || undefined,
        role: input.role === 'admin' ? 'admin' : 'operator',
        active: true,
        createdAt: now,
        updatedAt: now,
      }
      const entry = audit(state, 'employee-create', `${name} (${employee.role})`, employee.id)
      set((current) => ({
        employees: [employee, ...current.employees],
        audit: [entry, ...current.audit],
      }))
      persist({ employees: [employee], audit: [entry] })
      return { ok: true, employee }
    },

    updateEmployee: (id, patch) => {
      const state = get()
      const existing = state.employees.find((employee) => employee.id === id)
      if (!existing) return { ok: false, error: 'not-found' }
      const name = patch.name !== undefined ? cleanName(patch.name) : existing.name
      if (!name) return { ok: false, error: 'empty-name' }
      if (
        state.employees.some(
          (employee) =>
            employee.id !== id &&
            employee.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      ) {
        return { ok: false, error: 'duplicate-name' }
      }
      const updated: Employee = {
        ...existing,
        name,
        phone: patch.phone !== undefined ? String(patch.phone).trim() || undefined : existing.phone,
        role: patch.role ?? existing.role,
        active: patch.active ?? existing.active,
        updatedAt: new Date().toISOString(),
      }
      const entry = audit(
        state,
        'employee-update',
        `${existing.name} → ${updated.name}${updated.active ? '' : ' (inactif)'}`,
        id,
        JSON.stringify({ name: existing.name, role: existing.role, active: existing.active }),
        JSON.stringify({ name: updated.name, role: updated.role, active: updated.active }),
      )
      set((current) => ({
        employees: current.employees.map((employee) => (employee.id === id ? updated : employee)),
        audit: [entry, ...current.audit],
      }))
      if (!updated.active && state.settings.currentEmployeeId === id) {
        get().setSettings({ currentEmployeeId: null })
      }
      persist({ employees: [updated], audit: [entry] })
      return { ok: true }
    },

    correctReturn: (request) => {
      const state = get()
      if (state.settings.adminPin && request.pin !== state.settings.adminPin) {
        return { ok: false, error: 'unauthorized' }
      }
      const reason = String(request.reason ?? '').trim()
      if (reason.length < 5) return { ok: false, error: 'reason-required' }
      const parcel = state.parcels.find((item) => item.id === request.parcelId)
      if (!parcel) return { ok: false, error: 'not-found' }
      if (parcel.status !== 'returned') return { ok: false, error: 'not-returned' }
      const list = state.lists.find((item) => item.id === parcel.listId)
      const registry = state.registry.find(
        (item) => item.listId === parcel.listId && item.code === parcel.code,
      )
      const actor = request.actor.trim() || actorFor(state)
      const now = new Date().toISOString()
      const updated: ReturnParcel = {
        ...parcel,
        status: 'pending',
        returnedAt: undefined,
        returnedBy: undefined,
        sessionId: undefined,
      }
      const entry = audit(
        state,
        'return-correction',
        `Correction de ${parcel.code} — ${reason}`,
        parcel.code,
        `${list?.name ?? parcel.listId} | retourné le ${parcel.returnedAt ?? '—'} | ${parcel.returnedBy ?? '—'}`,
        `remis en attente le ${now} par ${actor}`,
        actor,
      )
      set((current) => ({
        parcels: current.parcels.map((item) => (item.id === parcel.id ? updated : item)),
        registry: current.registry.filter((item) => item.id !== registry?.id),
        audit: [entry, ...current.audit],
      }))
      persist({
        parcels: [updated],
        deleteRegistry: registry ? [registry.id] : undefined,
        audit: [entry],
      })
      return { ok: true }
    },

    createBackup: () => {
      const state = get()
      return {
        app: 'return-scanner-pro',
        version: 1,
        exportedAt: new Date().toISOString(),
        lists: state.lists,
        parcels: state.parcels,
        registry: state.registry,
        events: state.events,
        blacklist: state.blacklist,
        sessions: state.sessions,
        employees: state.employees,
        audit: state.audit,
        settings: state.settings,
      }
    },

    markBackupExported: () => {
      const state = get()
      const now = new Date().toISOString()
      get().setSettings({ lastBackupAt: now })
      const entry = audit(
        state,
        'backup-export',
        `${state.lists.length} listes, ${state.parcels.length} colis, ${state.events.length} événements`,
      )
      set((current) => ({ audit: [entry, ...current.audit] }))
      persist({ audit: [entry] })
    },

    restoreBackup: (payload, mode) => {
      const preview = validateBackup(payload)
      if (!preview.valid || !preview.data) {
        return { ok: false, error: 'invalid-backup', added: 0, skipped: 0, preview }
      }
      const state = get()
      const incoming = preview.data
      const now = new Date().toISOString()

      if (mode === 'replace') {
        const openSessions = incoming.sessions
          .filter((session) => session.status === 'open')
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        const keepOpen = openSessions[0]
        const sessions = incoming.sessions.map((session) =>
          session.status === 'open' && session.id !== keepOpen?.id
            ? { ...session, status: 'closed' as const, endedAt: now }
            : session,
        )
        const lists = incoming.lists.map((list) =>
          keepOpen?.listId === list.id
            ? { ...list, status: 'active' as const, closedAt: undefined, archivedAt: undefined }
            : list,
        )
        const entry = audit(
          state,
          'backup-import',
          `Restauration complète: ${incoming.lists.length} listes, ${incoming.parcels.length} colis`,
          undefined,
          undefined,
          undefined,
        )
        const data: AppData = {
          lists,
          parcels: incoming.parcels,
          registry: incoming.registry,
          events: incoming.events,
          blacklist: incoming.blacklist,
          sessions,
          employees: incoming.employees,
          audit: [entry, ...incoming.audit],
        }
        let activeListId = preview.settings?.activeListId ?? null
        if (!activeListId || !lists.some((list) => list.id === activeListId)) {
          activeListId = keepOpen?.listId ?? null
        }
        const currentEmployeeId =
          preview.settings?.currentEmployeeId &&
          incoming.employees.some(
            (employee) =>
              employee.id === preview.settings?.currentEmployeeId && employee.active,
          )
            ? preview.settings.currentEmployeeId
            : null
        const settings = sanitizeBackupSettings(preview.settings, state.settings)
        const nextSettings: Settings = {
          ...settings,
          activeListId,
          currentEmployeeId,
          lastBackupAt: state.settings.lastBackupAt,
        }
        set({ ...data, settings: nextSettings, lastOutcome: undefined })
        persistSettings(nextSettings)
        replaceAllPersisted(data)
        return {
          ok: true,
          added: preview.totalRecords,
          skipped: 0,
          preview,
        }
      }

      const existingListIds = new Set(state.lists.map((list) => list.id))
      const existingParcelIds = new Set(state.parcels.map((item) => item.id))
      const existingParcelKeys = new Set(
        state.parcels.map((item) => `${item.listId}::${item.code}`),
      )
      const existingRegistryIds = new Set(state.registry.map((item) => item.id))
      const existingRegistryKeys = new Set(
        state.registry.map((item) => `${item.listId}::${item.code}`),
      )
      const existingEventIds = new Set(state.events.map((item) => item.id))
      const existingBlacklistCodes = new Set(state.blacklist.map((item) => item.code))
      const existingSessionIds = new Set(state.sessions.map((item) => item.id))
      const existingEmployeeIds = new Set(state.employees.map((item) => item.id))
      const existingAuditIds = new Set(state.audit.map((item) => item.id))

      const addedLists = incoming.lists.filter((list) => !existingListIds.has(list.id))
      const allowedLists = new Set([...existingListIds, ...addedLists.map((list) => list.id)])
      const addedParcels = incoming.parcels.filter((parcel) => {
        const key = `${parcel.listId}::${parcel.code}`
        return (
          allowedLists.has(parcel.listId) &&
          !existingParcelIds.has(parcel.id) &&
          !existingParcelKeys.has(key)
        )
      })
      const addedRegistry = incoming.registry.filter((entry) => {
        const key = `${entry.listId}::${entry.code}`
        return (
          allowedLists.has(entry.listId) &&
          !existingRegistryIds.has(entry.id) &&
          !existingRegistryKeys.has(key)
        )
      })
      const addedEvents = incoming.events.filter(
        (event) => allowedLists.has(event.listId) && !existingEventIds.has(event.id),
      )
      const addedBlacklist = incoming.blacklist.filter(
        (entry) => !existingBlacklistCodes.has(entry.code),
      )
      const addedSessions = incoming.sessions.filter(
        (session) => allowedLists.has(session.listId) && !existingSessionIds.has(session.id),
      )
      const addedEmployees = incoming.employees.filter(
        (employee) => !existingEmployeeIds.has(employee.id),
      )
      const addedAudit = incoming.audit.filter((entry) => !existingAuditIds.has(entry.id))
      const entry = audit(
        state,
        'backup-import',
        `Fusion: +${addedLists.length} listes, +${addedParcels.length} colis, +${addedRegistry.length} registre`,
      )
      const openSessions = [...state.sessions, ...addedSessions]
        .filter((session) => session.status === 'open')
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      const keepOpen = openSessions[0]
      const fixedExistingSessions = state.sessions.map((session) =>
        session.status === 'open' && session.id !== keepOpen?.id
          ? { ...session, status: 'closed' as const, endedAt: now }
          : session,
      )
      const fixedAddedSessions = addedSessions.map((session) =>
        session.status === 'open' && session.id !== keepOpen?.id
          ? { ...session, status: 'closed' as const, endedAt: now }
          : session,
      )
      const changedExisting = fixedExistingSessions.filter(
        (session, index) => session.status !== state.sessions[index]?.status,
      )

      set((current) => ({
        lists: [...addedLists, ...current.lists],
        parcels: [...addedParcels, ...current.parcels],
        registry: [...addedRegistry, ...current.registry],
        events: [...addedEvents, ...current.events],
        blacklist: [...addedBlacklist, ...current.blacklist],
        sessions: [...fixedAddedSessions, ...fixedExistingSessions],
        employees: [...addedEmployees, ...current.employees],
        audit: [entry, ...addedAudit, ...current.audit],
      }))
      persist({
        lists: addedLists,
        parcels: addedParcels,
        registry: addedRegistry,
        events: addedEvents,
        blacklist: addedBlacklist,
        sessions: [...fixedAddedSessions, ...changedExisting],
        employees: addedEmployees,
        audit: [entry, ...addedAudit],
      })
      return {
        ok: true,
        added:
          addedLists.length +
          addedParcels.length +
          addedRegistry.length +
          addedEvents.length +
          addedBlacklist.length +
          addedSessions.length +
          addedEmployees.length +
          addedAudit.length,
        skipped: preview.totalRecords -
          (addedLists.length +
            addedParcels.length +
            addedRegistry.length +
            addedEvents.length +
            addedBlacklist.length +
            addedSessions.length +
            addedEmployees.length +
            addedAudit.length),
        preview,
      }
    },
  }
})

export function useActiveSession(): ScanSession | undefined {
  return useStore((state) => state.sessions.find((session) => session.status === 'open'))
}

export function useActiveList(): ReturnList | undefined {
  return useStore((state) =>
    state.lists.find((list) => list.id === state.settings.activeListId),
  )
}
