import { describe, expect, it } from 'vitest'
import type {
  AppData,
  Employee,
  ReturnList,
  ReturnParcel,
  ScanEvent,
  ScannedCode,
} from '../types'
import {
  buildListComparison,
  blacklistCodeSet,
  computeEmployeeStats,
  computeListStats,
  eventActivity,
  scanAttemptGroups,
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
): ScanEvent {
  return {
    id,
    at: NOW,
    code,
    listId,
    listName: `List ${listId}`,
    source: 'manual',
    result,
  }
}

function makeData(overrides: Partial<AppData> = {}): AppData {
  return {
    lists: [],
    parcels: [],
    registry: [],
    events: [],
    blacklist: [],
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

describe('event activity', () => {
  it('counts scan outcomes for a set of events', () => {
    const events = [
      event('1', 'A', 'accepted'),
      event('2', 'A', 'duplicate'),
      event('3', 'X', 'not-required'),
      event('4', 'Y', 'blacklisted'),
      event('5', 'Z', 'other-list'),
    ]
    expect(eventActivity(events)).toEqual({
      scans: 5,
      accepted: 1,
      rejected: 1,
      duplicate: 1,
      blacklisted: 1,
      otherList: 1,
    })
  })
})

describe('list comparison', () => {
  it('returns null for an unknown list', () => {
    expect(buildListComparison('NOPE', makeData())).toBeNull()
  })

  it('scopes stats, events and unrequested registry rows to the list', () => {
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
    })
    const comparison = buildListComparison('L1', data)
    expect(comparison).not.toBeNull()
    expect(comparison?.stats.total).toBe(1)
    expect(comparison?.unrequested.map((entry) => entry.code)).toEqual(['X', 'Y'])
    expect(comparison?.totalScans).toBe(4)
    expect(comparison?.repeatedAttempts).toBe(1)
    expect(comparison?.otherListAttempts).toBe(1)
  })
})

describe('employee statistics', () => {
  it('counts accepted parcels and scans per employee', () => {
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
    const stats = computeEmployeeStats({
      employees,
      parcels: [
        { ...parcel('L1', 'A', 'returned'), returnedBy: 'Samir' },
        { ...parcel('L1', 'B', 'returned'), returnedBy: 'Samir' },
        { ...parcel('L1', 'C', 'returned'), returnedBy: 'Aya' },
      ],
    })
    expect(stats.find((row) => row.employeeId === 'E1')).toEqual({
      employeeId: 'E1',
      name: 'Samir',
      accepted: 2,
      scans: 2,
    })
    expect(stats.find((row) => row.employeeId === 'E2')).toMatchObject({
      accepted: 1,
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
