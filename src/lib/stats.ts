import type {
  AppData,
  BlacklistEntry,
  ReturnList,
  ReturnParcel,
  ScanEvent,
  ScannedCode,
  SessionReportSnapshot,
  ScanSession,
} from '../types'
import { percent } from './utils'

export interface ListStats {
  total: number
  returned: number
  remaining: number
  pending: number
  prohibitedReturned: number
  completion: number
}

export function blacklistCodeSet(blacklist: BlacklistEntry[]): Set<string> {
  return new Set(blacklist.map((entry) => entry.code))
}

export function computeListStats(
  listId: string,
  parcels: ReturnParcel[],
  blacklisted: Set<string>,
): ListStats {
  let total = 0
  let returned = 0
  let pending = 0
  let prohibitedReturned = 0

  for (const parcel of parcels) {
    if (parcel.listId !== listId) continue
    total += 1
    if (parcel.status === 'returned') {
      if (blacklisted.has(parcel.code)) prohibitedReturned += 1
      else returned += 1
    } else {
      pending += 1
    }
  }

  return {
    total,
    returned,
    remaining: total - returned,
    pending,
    prohibitedReturned,
    completion: percent(returned, total),
  }
}

export interface SessionActivity {
  scans: number
  accepted: number
  rejected: number
  duplicate: number
  blacklisted: number
  otherList: number
}

export function sessionActivity(sessionId: string, events: ScanEvent[]): SessionActivity {
  const scoped = events.filter((event) => event.sessionId === sessionId)
  return {
    scans: scoped.length,
    accepted: scoped.filter((event) => event.result === 'accepted').length,
    rejected: scoped.filter((event) => event.result === 'not-required').length,
    duplicate: scoped.filter((event) => event.result === 'duplicate').length,
    blacklisted: scoped.filter((event) => event.result === 'blacklisted').length,
    otherList: scoped.filter((event) => event.result === 'other-list').length,
  }
}

export function buildSessionReport(
  session: ScanSession,
  list: ReturnList | undefined,
  data: AppData,
  endedAt: string,
): SessionReportSnapshot {
  const blacklisted = blacklistCodeSet(data.blacklist)
  const stats = computeListStats(session.listId, data.parcels, blacklisted)
  const activity = sessionActivity(session.id, data.events)
  const scopedEvents = data.events.filter((event) => event.sessionId === session.id)
  const unrequested = new Set(
    scopedEvents
      .filter((event) => event.result === 'not-required')
      .map((event) => event.code),
  ).size

  return {
    generatedAt: endedAt,
    listId: session.listId,
    listName: list?.name ?? session.listName,
    sessionId: session.id,
    listTotal: stats.total,
    listReturned: stats.returned,
    listRemaining: stats.remaining,
    completion: stats.completion,
    sessionScans: activity.scans,
    sessionAccepted: activity.accepted,
    unrequested,
    blacklistedAttempts: activity.blacklisted,
    duplicateAttempts: activity.duplicate,
    otherListAttempts: activity.otherList,
    startedAt: session.startedAt,
    endedAt,
    employeeName: session.employeeName,
  }
}

export interface ListComparison {
  list: ReturnList
  stats: ListStats
  unrequested: ScannedCode[]
  blacklistedScans: number
  repeatedAttempts: number
  otherListAttempts: number
  sessionScans: number
  sessions: ScanSession[]
}

export function buildListComparison(listId: string, data: AppData): ListComparison | null {
  const list = data.lists.find((item) => item.id === listId)
  if (!list) return null
  const blacklisted = blacklistCodeSet(data.blacklist)
  const stats = computeListStats(listId, data.parcels, blacklisted)
  const events = data.events.filter((event) => event.listId === listId)
  const sessions = data.sessions
    .filter((session) => session.listId === listId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  return {
    list,
    stats,
    unrequested: data.registry.filter(
      (entry) => entry.listId === listId && entry.status === 'not-required',
    ),
    blacklistedScans: events.filter((event) => event.result === 'blacklisted').length,
    repeatedAttempts: events.filter((event) => event.result === 'duplicate').length,
    otherListAttempts: events.filter((event) => event.result === 'other-list').length,
    sessionScans: events.length,
    sessions,
  }
}

export interface EmployeeStats {
  employeeId: string
  name: string
  sessions: number
  accepted: number
  scans: number
}

export function computeEmployeeStats(data: AppData): EmployeeStats[] {
  const employeeById = new Map(data.employees.map((employee) => [employee.id, employee]))
  const rows = new Map<string, EmployeeStats>()

  for (const employee of data.employees) {
    rows.set(employee.id, {
      employeeId: employee.id,
      name: employee.name,
      sessions: data.sessions.filter((session) => session.employeeId === employee.id).length,
      accepted: data.parcels.filter(
        (parcel) => parcel.status === 'returned' && parcel.returnedBy === employee.name,
      ).length,
      scans: data.events.filter((event) => event.employeeId === employee.id).length,
    })
  }

  for (const event of data.events) {
    if (!event.employeeId || rows.has(event.employeeId)) continue
    const name = event.employeeName ?? employeeById.get(event.employeeId)?.name ?? event.employeeId
    rows.set(event.employeeId, {
      employeeId: event.employeeId,
      name,
      sessions: data.sessions.filter((session) => session.employeeId === event.employeeId).length,
      accepted: data.parcels.filter(
        (parcel) => parcel.status === 'returned' && parcel.returnedBy === name,
      ).length,
      scans: data.events.filter((item) => item.employeeId === event.employeeId).length,
    })
  }

  return [...rows.values()].sort((a, b) => b.accepted - a.accepted || b.scans - a.scans)
}

export function scanAttemptGroups(events: ScanEvent[], code: string): ScanEvent[] {
  return events
    .filter((event) => event.code === code)
    .sort((a, b) => b.at.localeCompare(a.at))
}
