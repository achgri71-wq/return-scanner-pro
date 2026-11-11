import { describe, expect, it } from 'vitest'
import type {
  AppData,
  BlacklistEntry,
  Employee,
  ReturnList,
  ReturnParcel,
  ScanEvent,
  ScanSession,
  ScannedCode,
} from '../types'
import {
  buildListComparison,
  buildSessionReport,
  blacklistCodeSet,
  computeDashboardStats,
  computeEmployeeStats,
  computeListStats,
  scanAttemptGroups,
  sessionActivity,
} from './stats'

const NOW = '2026-10-27T10:00:00.000Z'

function list(id: string, status: ReturnList['status'] = 'active'): ReturnList {
  return {
    id,
    name: `List ${id}`,
    status,
    source: 'manual',
    notes: '',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function parcel(listId: string, code: string, status: ReturnParcel['status'] = 'pending'): ReturnParcel {
  return {
    id: `prc_${listId}_${code}`,
    listId,
    code,
    status,
    addedAt: NOW,
    source: 'manual',
    returnedAt: status === 'returned' ? NOW : undefined,
    returnedBy: status === 'returned' ? 'Samir' : undefined,
  }
}

function registryEntry(
  listId: string,
  code: string,
  status: ScannedCode['status'],
  attempts = 1,
  lastAttemptAt = NOW,
): ScannedCode {
  return {
    id: `reg_${listId}_${code}`,
    listId,
    code,
    status,
    firstScanAt: NOW,
    lastAttemptAt,
    attempts,
    lastResult: status === 'not-required' ? 'not-required' : 'accepted',
  }
}

function event(
  id: string,
  code: string,
  result: ScanEvent['result'],
  listId = 'L1',
  sessionId = 'S1',
  employeeId = 'E1',
): ScanEvent {
  return {
    id,
    at: NOW,
    code,
    listId,
    listName: `List ${listId}`,
    sessionId,
    employeeId,
    employeeName: 'Samir',
    source: 'manual',
    result,
  }
}

function session(id = 'S1', listId = 'L1', status: ScanSession['status'] = 'open'): ScanSession {
  return { id, listId, listName: `List ${listId}`, startedAt: NOW, status }
}

function makeData(overrides: Partial<AppData> = {}): AppData {
  return {
    lists: [],
    parcels: [],
    registry: [],
    events: [],
    blacklist: [],
    sessions: [],
    employees: [],
    audit: [],
    ...overrides,
  }
}

describe('computeListStats', () => {
  it('counts total, returned, remaining and completion', () => {
    const stats = computeListStats(
      'L1',
      [parcel('L1', 'A'), parcel('L1', 'B', 'returned'), parcel('L1', 'C'), parcel('L2', 'D')],
      new Set(),
    )
    expect(stats).toEqual({
      total: 3,
      returned: 1,
      remaining: 2,
      pending: 2,
      prohibitedReturned: 0,
      completion: 1 / 3,
    })
  })

  it('excludes currently blacklisted codes from returned totals while keeping them in total', () => {
    const stats = computeListStats(
      'L1',
      [parcel('L1', 'A', 'returned'), parcel('L1', 'B', 'returned'), parcel('L1', 'C')],
      new Set(['A']),
    )
    expect(stats.returned).toBe(1)
    expect(stats.prohibitedReturned).toBe(1)
    expect(stats.remaining).toBe(2)
    expect(stats.total).toBe(3)
  })

  it('returns a zeroed result for empty lists', () => {
    expect(computeListStats('EMPTY', [], new Set())).toEqual({
      total: 0,
      returned: 0,
      remaining: 0,
      pending: 0,
      prohibitedReturned: 0,
      completion: 0,
    })
  })
})

describe('computeDashboardStats', () => {
  it('aggregates lists, registry and events', () => {
    const blacklist: BlacklistEntry[] = [
      { id: 'b1', code: 'A', reason: 'x', addedAt: NOW, addedBy: 'admin' },
    ]
    const data = makeData({
      lists: [list('L1'), list('L2', 'completed'), list('L3', 'new'), list('L4', 'archived')],
      parcels: [
        parcel('L1', 'A', 'returned'),
        parcel('L1', 'B'),
        parcel('L2', 'C', 'returned'),
      ],
      registry: [registryEntry('L1', 'X', 'not-required'), registryEntry('L1', 'B', 'required-returned')],
      events: [
        event('e1', 'A', 'accepted'),
        event('e2', 'A', 'duplicate'),
        event('e3', 'X', 'not-required'),
        event('e4', 'B', 'blacklisted'),
      ],
      blacklist,
    })
    const stats = computeDashboardStats(data)

    expect(stats.totalLists).toBe(4)
    expect(stats.newLists).toBe(1)
    expect(stats.activeLists).toBe(1)
    expect(stats.completedLists).toBe(1)
    expect(stats.archivedLists).toBe(1)
    expect(stats.totalRequired).toBe(3)
    expect(stats.totalReturned).toBe(1)
    expect(stats.totalRemaining).toBe(2)
    expect(stats.notRequired).toBe(1)
    expect(stats.blacklisted).toBe(1)
    expect(stats.repeatedAttempts).toBe(1)
    expect(stats.blacklistedAttempts).toBe(1)
    expect(stats.lists).toHaveLength(4)
    expect(stats.recentEvents[0]?.id).toBeDefined()
  })

  it('sorts recent events by descending date and limits them to eight', () => {
    const events = Array.from({ length: 10 }, (_, index) => ({
      ...event(`e${index}`, `C${index}`, 'not-required'),
      at: `2026-10-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
    }))
    const stats = computeDashboardStats(makeData({ events }))
    expect(stats.recentEvents).toHaveLength(8)
    expect(stats.recentEvents[0]?.at).toBe('2026-10-10T10:00:00.000Z')
    expect(stats.recentEvents[0]?.id).toBe('e9')
  })
})

describe('session activity and reports', () => {
  it('counts scan outcomes for a single session', () => {
    const events = [
      event('1', 'A', 'accepted'),
      event('2', 'A', 'duplicate'),
      event('3', 'X', 'not-required'),
      event('4', 'Y', 'blacklisted'),
      event('5', 'Z', 'other-list'),
      event('6', 'B', 'accepted', 'L1', 'S2'),
    ]
    expect(sessionActivity('S1', events)).toEqual({
      scans: 5,
      accepted: 1,
      rejected: 1,
      duplicate: 1,
      blacklisted: 1,
      otherList: 1,
    })
  })

  it('builds a session report with distinct unrequested codes', () => {
    const data = makeData({
      lists: [list('L1')],
      parcels: [
        parcel('L1', 'A', 'returned'),
        parcel('L1', 'B'),
        parcel('L1', 'C'),
      ],
      events: [
        event('1', 'A', 'accepted'),
        event('2', 'B', 'duplicate'),
        event('3', 'X', 'not-required'),
        event('4', 'X', 'not-required'),
        event('5', 'Y', 'not-required'),
        event('6', 'Z', 'blacklisted'),
        event('7', 'W', 'other-list'),
      ],
      sessions: [session()],
    })
    const report = buildSessionReport(data.sessions[0]!, data.lists[0], data, '2026-10-27T12:00:00.000Z')

    expect(report.listId).toBe('L1')
    expect(report.listTotal).toBe(3)
    expect(report.listReturned).toBe(1)
    expect(report.listRemaining).toBe(2)
    expect(report.sessionScans).toBe(7)
    expect(report.sessionAccepted).toBe(1)
    expect(report.unrequested).toBe(2)
    expect(report.duplicateAttempts).toBe(1)
    expect(report.blacklistedAttempts).toBe(1)
    expect(report.otherListAttempts).toBe(1)
    expect(report.endedAt).toBe('2026-10-27T12:00:00.000Z')
    expect(report.completion).toBeCloseTo(1 / 3)
  })

  it('falls back to the stored session list name when the list is missing', () => {
    const data = makeData({ sessions: [session()] })
    const report = buildSessionReport(
      { ...data.sessions[0]!, listName: 'Archived name' },
      undefined,
      data,
      NOW,
    )
    expect(report.listName).toBe('Archived name')
    expect(report.listTotal).toBe(0)
  })
})

describe('list comparison', () => {
  it('returns null for an unknown list', () => {
    expect(buildListComparison('NOPE', makeData())).toBeNull()
  })

  it('scopes stats, events, sessions and unrequested registry rows to the list', () => {
    const data = makeData({
      lists: [list('L1'), list('L2')],
      parcels: [parcel('L1', 'A', 'returned'), parcel('L2', 'B', 'returned')],
      registry: [
        registryEntry('L1', 'X', 'not-required'),
        registryEntry('L1', 'Y', 'not-required'),
        registryEntry('L2', 'Z', 'not-required'),
      ],
      events: [
        event('1', 'A', 'accepted', 'L1'),
        event('2', 'X', 'not-required', 'L1'),
        event('3', 'Y', 'duplicate', 'L1'),
        event('4', 'Z', 'other-list', 'L1'),
        event('5', 'B', 'accepted', 'L2'),
      ],
      sessions: [
        { ...session('S1', 'L1'), startedAt: '2026-10-01T00:00:00.000Z' },
        { ...session('S2', 'L1'), startedAt: '2026-10-02T00:00:00.000Z' },
        session('S3', 'L2'),
      ],
    })
    const comparison = buildListComparison('L1', data)
    expect(comparison).not.toBeNull()
    expect(comparison?.stats.total).toBe(1)
    expect(comparison?.unrequested.map((entry) => entry.code)).toEqual(['X', 'Y'])
    expect(comparison?.sessionScans).toBe(4)
    expect(comparison?.repeatedAttempts).toBe(1)
    expect(comparison?.otherListAttempts).toBe(1)
    expect(comparison?.sessions.map((item) => item.id)).toEqual(['S2', 'S1'])
  })
})

describe('employee statistics', () => {
  it('counts sessions, accepted parcels and scans per employee', () => {
    const employees: Employee[] = [
      {
        id: 'E1',
        name: 'Samir',
        role: 'operator',
        active: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'E2',
        name: 'Aya',
        role: 'operator',
        active: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]
    const data = makeData({
      employees,
      parcels: [parcel('L1', 'A', 'returned'), parcel('L1', 'B', 'returned')],
      sessions: [{ ...session('S1'), employeeId: 'E1' }, { ...session('S2'), employeeId: 'E2' }],
      events: [
        { ...event('1', 'A', 'accepted'), employeeId: 'E1' },
        { ...event('2', 'B', 'duplicate'), employeeId: 'E1' },
        { ...event('3', 'C', 'not-required'), employeeId: 'E2' },
      ],
    })
    const stats = computeEmployeeStats(data)
    expect(stats.find((row) => row.employeeId === 'E1')).toEqual({
      employeeId: 'E1',
      name: 'Samir',
      sessions: 1,
      accepted: 2,
      scans: 2,
    })
    expect(stats.find((row) => row.employeeId === 'E2')).toMatchObject({
      sessions: 1,
      scans: 1,
    })
  })

  it('adds unknown employee ids that only appear in the event log', () => {
    const data = makeData({
      events: [{ ...event('1', 'A', 'accepted'), employeeId: 'E9', employeeName: 'Ghost' }],
    })
    expect(computeEmployeeStats(data)[0]).toMatchObject({
      employeeId: 'E9',
      name: 'Ghost',
      sessions: 0,
      scans: 1,
    })
  })
})

describe('helpers', () => {
  it('builds a blacklist code set', () => {
    const set = blacklistCodeSet([
      { id: '1', code: 'A', reason: '', addedAt: NOW, addedBy: 'x' },
      { id: '2', code: 'B', reason: '', addedAt: NOW, addedBy: 'x' },
    ])
    expect([...set]).toEqual(['A', 'B'])
  })

  it('groups attempts for one code in reverse chronological order', () => {
    const events = [
      { ...event('1', 'A', 'accepted'), at: '2026-10-01T00:00:00.000Z' },
      { ...event('2', 'A', 'duplicate'), at: '2026-10-03T00:00:00.000Z' },
      { ...event('3', 'B', 'accepted'), at: '2026-10-02T00:00:00.000Z' },
    ]
    expect(scanAttemptGroups(events, 'A').map((item) => item.id)).toEqual(['2', '1'])
  })
})
