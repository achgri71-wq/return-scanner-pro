import { describe, expect, it } from 'vitest'
import type { ScannedCode } from '../types'
import {
  buildReturnIndex,
  diffReturnIndex,
  normalizeFlowDistributors,
  type ReturnIndexEntry,
} from './flowLink'

const NOW = '2026-11-14T10:00:00.000Z'

describe('buildReturnIndex', () => {
  const listNames = new Map([
    ['L1', 'Casablanca'],
    ['L2', 'Rabat'],
  ])

  it('resolves parcel statuses and prefers the strongest one', () => {
    const entries = buildReturnIndex({
      parcels: [
        { code: 'A-1', status: 'returned', returnedAt: NOW, addedAt: NOW, listId: 'L1' },
        { code: 'B-2', status: 'pending', addedAt: NOW, listId: 'L1' },
      ],
      registry: [
        {
          id: 'r1',
          listId: 'L2',
          code: 'C-3',
          status: 'not-required',
          firstScanAt: NOW,
          lastAttemptAt: NOW,
          attempts: 1,
          lastResult: 'not-required',
        } as ScannedCode,
      ],
      blacklist: [{ code: 'D-4' }],
      listNames,
    })

    const byCode = new Map(entries.map((entry) => [entry.code, entry]))
    expect(byCode.get('A-1')?.status).toBe('returned')
    expect(byCode.get('A-1')?.listName).toBe('Casablanca')
    expect(byCode.get('B-2')?.status).toBe('pending')
    expect(byCode.get('C-3')?.status).toBe('not-required')
    expect(byCode.get('D-4')?.status).toBe('prohibited')
  })

  it('prefers returned over pending when a code appears in two lists', () => {
    const entries = buildReturnIndex({
      parcels: [
        { code: 'A-1', status: 'pending', addedAt: NOW, listId: 'L1' },
        { code: 'A-1', status: 'returned', returnedAt: NOW, addedAt: NOW, listId: 'L2' },
      ],
      registry: [],
      blacklist: [],
      listNames,
    })
    expect(entries.find((entry) => entry.code === 'A-1')?.status).toBe('returned')
    expect(entries.find((entry) => entry.code === 'A-1')?.listName).toBe('Rabat')
  })
})

describe('diffReturnIndex', () => {
  const entries: ReturnIndexEntry[] = [
    { code: 'A-1', status: 'returned', listName: 'Casablanca', at: NOW },
    { code: 'B-2', status: 'pending', listName: 'Rabat' },
  ]

  it('publishes the full index and reports changes', () => {
    const first = diffReturnIndex(entries, {})
    expect(Object.keys(first.index).sort()).toEqual(['A-1', 'B-2'])
    expect(first.changed).toBe(2)
    expect(first.index['A-1']).toEqual({ s: 'returned', l: 'Casablanca', at: NOW })

    const changedEntries: ReturnIndexEntry[] = [
      { code: 'A-1', status: 'returned', listName: 'Casablanca', at: NOW },
    ]
    const second = diffReturnIndex(changedEntries, first.next)
    // The index always contains the full snapshot (removed codes included).
    expect(Object.keys(second.index).sort()).toEqual(['A-1', 'B-2'])
    expect(second.index['B-2']?.s).toBe('not-required')
    expect(second.changed).toBe(1)

    const third = diffReturnIndex(changedEntries, second.next)
    expect(third.changed).toBe(0)
  })
})

describe('normalizeFlowDistributors', () => {
  it('reads the shared distributors map and sorts active first', () => {
    const list = normalizeFlowDistributors({
      a: { id: 'a', name: 'Yassine', codes: ['DH123', 'DH123'], date: '2026-11-13T00:00:00.000Z' },
      b: { name: 'Archive', codes: { x: 'SF99' }, archived: true, deletedAt: '2026-11-12T00:00:00.000Z' },
    })
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ name: 'Yassine', codes: ['DH123'], archived: false })
    expect(list[1]).toMatchObject({ name: 'Archive', archived: true })
  })

  it('skips invalid entries and handles null payloads', () => {
    expect(normalizeFlowDistributors({ bad: { name: '  ' }, ok: null, other: 42 })).toEqual([])
    expect(normalizeFlowDistributors(null)).toEqual([])
  })

  it('aligns entry dates with codes and keeps the first date of duplicates', () => {
    const list = normalizeFlowDistributors([
      {
        name: 'Rachid',
        codes: ['DH1', 'DH2', 'DH1'],
        dates: ['2026-11-13T08:00:00.000Z', 'not-a-date', '2026-11-12T08:00:00.000Z'],
      },
    ])
    expect(list[0].codes).toEqual(['DH1', 'DH2'])
    expect(list[0].dates).toEqual(['2026-11-13T08:00:00.000Z', ''])
  })

  it('keeps working with legacy payloads without per-code dates', () => {
    const list = normalizeFlowDistributors([
      { name: 'Rachid', codes: ['DH1', 'DH2'], date: '2026-11-13T00:00:00.000Z' },
    ])
    expect(list[0].codes).toEqual(['DH1', 'DH2'])
    expect(list[0].dates).toEqual(['', ''])
  })
})
