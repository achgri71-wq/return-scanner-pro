import type {
  AppData,
  BlacklistEntry,
  Employee,
  ReturnList,
  ReturnParcel,
  ScanEvent,
  ScannedCode,
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

export interface EventActivity {
  scans: number
  accepted: number
  rejected: number
  duplicate: number
  blacklisted: number
  otherList: number
}

export function eventActivity(events: ScanEvent[]): EventActivity {
  return {
    scans: events.length,
    accepted: events.filter((event) => event.result === 'accepted').length,
    rejected: events.filter((event) => event.result === 'not-required').length,
    duplicate: events.filter((event) => event.result === 'duplicate').length,
    blacklisted: events.filter((event) => event.result === 'blacklisted').length,
    otherList: events.filter((event) => event.result === 'other-list').length,
  }
}

export interface ListComparison {
  list: ReturnList
  stats: ListStats
  unrequested: ScannedCode[]
  blacklistedScans: number
  repeatedAttempts: number
  otherListAttempts: number
  totalScans: number
}

export function buildListComparison(listId: string, data: AppData): ListComparison | null {
  const list = data.lists.find((item) => item.id === listId)
  if (!list) return null
  const blacklisted = blacklistCodeSet(data.blacklist)
  const stats = computeListStats(listId, data.parcels, blacklisted)
  const events = data.events.filter((event) => event.listId === listId)

  return {
    list,
    stats,
    unrequested: data.registry.filter(
      (entry) => entry.listId === listId && entry.status === 'not-required',
    ),
    blacklistedScans: events.filter((event) => event.result === 'blacklisted').length,
    repeatedAttempts: events.filter((event) => event.result === 'duplicate').length,
    otherListAttempts: events.filter((event) => event.result === 'other-list').length,
    totalScans: events.length,
  }
}

export interface EmployeeStats {
  employeeId: string
  name: string
  accepted: number
  scans: number
}

export function computeEmployeeStats(data: {
  employees: Employee[]
  parcels: ReturnParcel[]
}): EmployeeStats[] {
  const rows = new Map<string, EmployeeStats>()

  for (const employee of data.employees) {
    rows.set(employee.id, {
      employeeId: employee.id,
      name: employee.name,
      accepted: data.parcels.filter(
        (parcel) => parcel.status === 'returned' && parcel.returnedBy === employee.name,
      ).length,
      scans: 0,
    })
  }

  const eventCounts = new Map<string, number>()
  for (const parcel of data.parcels) {
    if (parcel.status !== 'returned' || !parcel.returnedBy) continue
    const match = data.employees.find(
      (employee) => employee.name === parcel.returnedBy,
    )
    if (match) eventCounts.set(match.id, (eventCounts.get(match.id) ?? 0) + 1)
  }
  for (const [id, count] of eventCounts) {
    const row = rows.get(id)
    if (row) row.scans = count
  }

  return [...rows.values()].sort((a, b) => b.accepted - a.accepted || b.scans - a.scans)
}

export function scanAttemptGroups(events: ScanEvent[], code: string): ScanEvent[] {
  return events
    .filter((event) => event.code === code)
    .sort((a, b) => b.at.localeCompare(a.at))
}
