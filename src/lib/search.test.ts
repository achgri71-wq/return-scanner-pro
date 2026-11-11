import { describe, expect, it } from 'vitest'
import type { BlacklistEntry, ReturnList, ReturnParcel, ScannedCode } from '../types'
import { searchRecords } from './search'

const NOW = '2026-10-27T10:00:00.000Z'

function list(id: string, name: string, status: ReturnList['status'] = 'active'): ReturnList {
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
  return {
    id: `prc_${listId}_${code}`,
    listId,
    code,
    status,
    addedAt: NOW,
    source: 'manual',
    returnedAt: status === 'returned' ? NOW : undefined,
  }
}

function registry(
  listId: string,
  code: string,
  status: ScannedCode['status'],
  lastAttemptAt = NOW,
): ScannedCode {
  return {
    id: `reg_${listId}_${code}`,
    listId,
    code,
    status,
    firstScanAt: NOW,
    lastAttemptAt,
    attempts: 2,
    lastResult: status === 'not-required' ? 'not-required' : 'accepted',
  }
}

const lists = [
  list('L1', 'Casablanca Centre'),
  list('L2', 'Rabat Agdal'),
  list('L3', 'Old archive', 'archived'),
]
const parcels = [
  parcel('L1', 'AB-001234'),
  parcel('L1', 'AB-009999', 'returned'),
  parcel('L2', 'RB-001234'),
]
const scanned: ScannedCode[] = [
  registry('L1', 'AB-001234', 'required-returned'),
  registry('L1', 'AB-777777', 'not-required'),
  registry('L2', 'RB-001234', 'required-returned'),
]
const blacklist: BlacklistEntry[] = [
  { id: 'b1', code: 'RB-001234', reason: 'fraud', addedAt: NOW, addedBy: 'admin' },
]

const baseInput = {
  query: '',
  lists,
  parcels,
  registry: scanned,
  blacklist,
}

describe('partial search', () => {
  it('matches any part of a code, case-insensitively', () => {
    const response = searchRecords({ ...baseInput, query: '0012' })
    expect(response.hits.map((hit) => hit.key).sort()).toEqual([
      'L1::AB-001234',
      'L2::RB-001234',
    ])
    expect(response.total).toBe(2)
    expect(response.truncated).toBe(false)
  })

  it('prefers string-start matches and keeps deterministic ordering', () => {
    const response = searchRecords({ ...baseInput, query: 'AB-00' })
    expect(response.hits[0]?.code).toBe('AB-001234')
  })

  it('matches a list name and returns every record in it', () => {
    const response = searchRecords({ ...baseInput, query: 'rabat' })
    expect(response.matchedLists.map((item) => item.name)).toEqual(['Rabat Agdal'])
    expect(response.hits.map((hit) => hit.key)).toEqual(['L2::RB-001234'])
  })

  it('does not leak records from other lists when the query matches one list name', () => {
    const response = searchRecords({ ...baseInput, query: 'Casablanca' })
    expect(response.hits.every((hit) => hit.listId === 'L1')).toBe(true)
    expect(response.hits.map((hit) => hit.code).sort()).toEqual([
      'AB-001234',
      'AB-009999',
      'AB-777777',
    ])
  })

  it('returns no hits for a missing query and no matched list', () => {
    const response = searchRecords({ ...baseInput, query: 'NOTHING-HERE' })
    expect(response.hits).toEqual([])
    expect(response.total).toBe(0)
    expect(response.matchedLists).toEqual([])
  })
})

describe('clearing the search', () => {
  it('returns recent registry records when the query is empty', () => {
    const response = searchRecords({ ...baseInput, query: '   ' })
    expect(response.total).toBe(3)
    expect(response.matchedLists).toEqual([])
    expect(response.hits.map((hit) => hit.code)).toContain('AB-777777')
  })

  it('respects the limit and reports truncation', () => {
    const response = searchRecords({ ...baseInput, query: '', limit: 2 })
    expect(response.hits).toHaveLength(2)
    expect(response.total).toBe(3)
    expect(response.truncated).toBe(true)
  })
})

describe('status and list filters', () => {
  it('marks currently blacklisted codes as prohibited', () => {
    const response = searchRecords({ ...baseInput, query: 'RB-001234' })
    expect(response.hits[0]?.status).toBe('prohibited')
  })

  it('distinguishes returned, pending, not-required and prohibited', () => {
    const returned = searchRecords({ ...baseInput, query: 'AB-009999' })
    expect(returned.hits[0]?.status).toBe('returned')

    const pending = searchRecords({
      ...baseInput,
      query: 'AB-555555',
      parcels: [...parcels, parcel('L1', 'AB-555555')],
    })
    expect(pending.hits[0]?.status).toBe('pending')

    const missing = searchRecords({ ...baseInput, query: 'AB-777777' })
    expect(missing.hits[0]?.status).toBe('not-required')

    const prohibited = searchRecords({ ...baseInput, query: 'RB-001234' })
    expect(prohibited.hits[0]?.status).toBe('prohibited')
  })

  it('filters by status', () => {
    const response = searchRecords({ ...baseInput, query: '', filters: { status: 'not-required' } })
    expect(response.hits.map((hit) => hit.code)).toEqual(['AB-777777'])
  })

  it('filters by list id', () => {
    const response = searchRecords({ ...baseInput, query: '001234', filters: { listId: 'L2' } })
    expect(response.hits.map((hit) => hit.listId)).toEqual(['L2'])
  })

  it('filters by inclusive date range using the last attempt day', () => {
    const input = {
      ...baseInput,
      registry: [
        registry('L1', 'OLD-1', 'not-required', '2026-10-01T09:00:00.000Z'),
        registry('L1', 'NEW-1', 'not-required', '2026-10-27T09:00:00.000Z'),
      ],
      parcels: [],
    }
    const response = searchRecords({
      ...input,
      query: '',
      filters: { from: '2026-10-27', to: '2026-10-27' },
    })
    expect(response.hits.map((hit) => hit.code)).toEqual(['NEW-1'])
  })
})

describe('privacy between lists', () => {
  it('keeps list labels and ids isolated on every hit', () => {
    const response = searchRecords({ ...baseInput, query: '001234' })
    const l1 = response.hits.find((hit) => hit.listId === 'L1')
    const l2 = response.hits.find((hit) => hit.listId === 'L2')
    expect(l1?.listName).toBe('Casablanca Centre')
    expect(l2?.listName).toBe('Rabat Agdal')
    expect(l1?.registryId).not.toBe(l2?.registryId)
  })
})
