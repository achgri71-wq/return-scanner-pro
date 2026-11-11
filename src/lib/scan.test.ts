import { describe, expect, it } from 'vitest'
import type { BlacklistEntry, ReturnList, ReturnParcel } from '../types'
import { buildScanIndex, decideScan } from './scan'

const NOW = '2026-10-27T10:00:00.000Z'

function list(id: string, status: ReturnList['status'] = 'active', name = `List ${id}`): ReturnList {
  return {
    id,
    name,
    status,
    source: 'manual',
    notes: '',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function parcel(
  listId: string,
  code: string,
  status: ReturnParcel['status'] = 'pending',
): ReturnParcel {
  return { id: `prc_${listId}_${code}`, listId, code, status, addedAt: NOW, source: 'manual' }
}

function blacklistEntry(code: string, addedAt = NOW): BlacklistEntry {
  return { id: `blk_${code}`, code, reason: 'fraud', addedAt, addedBy: 'admin' }
}

function decide(
  code: string,
  activeListId: string | null,
  lists: ReturnList[],
  parcels: ReturnParcel[],
  blacklist: BlacklistEntry[] = [],
) {
  return decideScan(code, buildScanIndex(activeListId, lists, parcels, blacklist))
}

describe('exact validation priority', () => {
  const l1 = list('L1')
  const l2 = list('L2')
  const code = '001234'

  it('1. reports no-list when no active list is selected', () => {
    expect(decide(code, null, [l1], [parcel('L1', code)])).toEqual({ kind: 'no-list' })
  })

  it('2. reports list-closed before looking at codes', () => {
    const closed = list('L1', 'completed')
    expect(decide(code, 'L1', [closed], [parcel('L1', code)])).toEqual({
      kind: 'list-closed',
      list: closed,
    })
    const archived = list('L1', 'archived')
    expect(decide(code, 'L1', [archived], [parcel('L1', code)]).kind).toBe('list-closed')
  })

  it('3. blacklist wins over every other status (including returned and other lists)', () => {
    const decision = decide(
      code,
      'L1',
      [l1, l2],
      [parcel('L1', code, 'returned'), parcel('L2', code)],
      [blacklistEntry(code)],
    )
    expect(decision.kind).toBe('blacklisted')
  })

  it('4. accepts a pending parcel from the active list', () => {
    const decision = decide(code, 'L1', [l1, l2], [parcel('L1', code), parcel('L2', code)])
    expect(decision.kind).toBe('accepted')
  })

  it('5. flags a returned parcel from the active list as duplicate', () => {
    const decision = decide(code, 'L1', [l1], [parcel('L1', code, 'returned')])
    expect(decision.kind).toBe('duplicate')
  })

  it('6. rejects a code that belongs to another list', () => {
    const decision = decide(code, 'L1', [l1, l2], [parcel('L2', code)])
    expect(decision.kind).toBe('other-list')
    if (decision.kind === 'other-list') expect(decision.list.id).toBe('L2')
  })

  it('7. rejects a completely unknown code as not-required', () => {
    expect(decide('UNKNOWN-99', 'L1', [l1], [parcel('L1', code)])).toEqual({
      kind: 'not-required',
    })
  })
})

describe('buildScanIndex', () => {
  it('only indexes active-list parcels for acceptance while keeping all list holders', () => {
    const index = buildScanIndex(
      'L1',
      [list('L1'), list('L2')],
      [parcel('L1', 'A1'), parcel('L2', 'A1'), parcel('L2', 'B2')],
      [],
    )
    expect(index.parcelByCode.has('A1')).toBe(true)
    expect(index.parcelByCode.has('B2')).toBe(false)
    expect(index.listsByParcelCode.get('A1')?.map((item) => item.id)).toEqual(['L1', 'L2'])
  })

  it('ignores parcels whose list no longer exists', () => {
    const index = buildScanIndex('L1', [list('L1')], [parcel('GHOST', 'A1')], [])
    expect(index.listsByParcelCode.has('A1')).toBe(false)
  })

  it('keeps the most recently added blacklist entry per code', () => {
    const index = buildScanIndex(
      'L1',
      [list('L1')],
      [],
      [blacklistEntry('A1', '2026-01-01T00:00:00.000Z'), blacklistEntry('A1', '2026-06-01T00:00:00.000Z')],
    )
    expect(index.blacklistByCode.get('A1')?.addedAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('prefers an open other list over a completed one', () => {
    const completed = list('L2', 'completed')
    const active = list('L3', 'active')
    const decision = decide('A1', 'L1', [list('L1'), completed, active], [parcel('L2', 'A1'), parcel('L3', 'A1')])
    expect(decision.kind).toBe('other-list')
    if (decision.kind === 'other-list') expect(decision.list.id).toBe('L3')
  })
})
