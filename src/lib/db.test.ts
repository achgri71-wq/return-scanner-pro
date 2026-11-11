import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { BlacklistEntry, ReturnList, ReturnParcel, ScannedCode } from '../types'
import { deleteDatabase, loadAll, replaceAll, writeChanges } from './db'

const NOW = '2026-10-27T10:00:00.000Z'

function list(id: string, name: string): ReturnList {
  return {
    id,
    name,
    status: 'active',
    source: 'manual',
    notes: '',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function parcel(id: string, listId: string, code: string): ReturnParcel {
  return { id, listId, code, status: 'pending', addedAt: NOW, source: 'manual' }
}

function registry(id: string, listId: string, code: string): ScannedCode {
  return {
    id,
    listId,
    code,
    status: 'not-required',
    firstScanAt: NOW,
    lastAttemptAt: NOW,
    attempts: 1,
    lastResult: 'not-required',
  }
}

function blacklist(id: string, code: string): BlacklistEntry {
  return { id, code, reason: 'test', addedAt: NOW, addedBy: 'admin' }
}

beforeEach(async () => {
  await deleteDatabase()
})

describe('IndexedDB persistence', () => {
  it('starts empty and returns every collection', async () => {
    const data = await loadAll()
    expect(data).toEqual({
      lists: [],
      parcels: [],
      registry: [],
      events: [],
      blacklist: [],
      sessions: [],
      employees: [],
      audit: [],
    })
  })

  it('writes and reloads rows (survives a simulated restart)', async () => {
    await writeChanges({
      lists: [list('L1', 'Casablanca')],
      parcels: [parcel('P1', 'L1', '001234')],
      registry: [registry('R1', 'L1', '001234')],
      blacklist: [blacklist('B1', 'BAD')],
    })

    const data = await loadAll()
    expect(data.lists).toHaveLength(1)
    expect(data.lists[0]?.name).toBe('Casablanca')
    expect(data.parcels[0]).toMatchObject({ id: 'P1', code: '001234' })
    expect(data.registry[0]).toMatchObject({ id: 'R1', status: 'not-required' })
    expect(data.blacklist[0]?.code).toBe('BAD')
  })

  it('updates existing rows by id instead of duplicating them', async () => {
    const first = parcel('P1', 'L1', '001234')
    await writeChanges({ lists: [list('L1', 'One')], parcels: [first] })
    await writeChanges({
      parcels: [{ ...first, status: 'returned', returnedAt: NOW, returnedBy: 'Samir' }],
    })

    const data = await loadAll()
    expect(data.parcels).toHaveLength(1)
    expect(data.parcels[0]).toMatchObject({ status: 'returned', returnedBy: 'Samir' })
  })

  it('deletes rows by id', async () => {
    await writeChanges({
      lists: [list('L1', 'One')],
      parcels: [parcel('P1', 'L1', 'A1'), parcel('P2', 'L1', 'A2')],
      blacklist: [blacklist('B1', 'BAD')],
    })
    await writeChanges({ deleteParcels: ['P1'], deleteBlacklist: ['B1'] })

    const data = await loadAll()
    expect(data.parcels.map((item) => item.id)).toEqual(['P2'])
    expect(data.blacklist).toEqual([])
  })

  it('is a no-op when no change is supplied', async () => {
    await expect(writeChanges({})).resolves.toBeUndefined()
    expect((await loadAll()).lists).toEqual([])
  })
})

describe('replaceAll', () => {
  it('clears previous stores and writes the complete snapshot', async () => {
    await writeChanges({
      lists: [list('OLD', 'Old list')],
      parcels: [parcel('POLD', 'OLD', 'OLD-1')],
      registry: [registry('R-OLD', 'OLD', 'OLD-1')],
      blacklist: [blacklist('BOLD', 'OLD-BAD')],
    })

    await replaceAll({
      lists: [list('NEW', 'New list')],
      parcels: [parcel('PNEW', 'NEW', 'NEW-1')],
      registry: [registry('R-NEW', 'NEW', 'NEW-1')],
      events: [],
      blacklist: [blacklist('BNEW', 'NEW-BAD')],
      sessions: [],
      employees: [],
      audit: [],
    })

    const data = await loadAll()
    expect(data.lists.map((item) => item.id)).toEqual(['NEW'])
    expect(data.parcels.map((item) => item.id)).toEqual(['PNEW'])
    expect(data.registry.map((item) => item.id)).toEqual(['R-NEW'])
    expect(data.blacklist.map((item) => item.id)).toEqual(['BNEW'])
  })

  it('can replace with an empty dataset', async () => {
    await writeChanges({ lists: [list('L1', 'One')], parcels: [parcel('P1', 'L1', 'A1')] })
    await replaceAll({
      lists: [],
      parcels: [],
      registry: [],
      events: [],
      blacklist: [],
      sessions: [],
      employees: [],
      audit: [],
    })
    expect((await loadAll()).lists).toEqual([])
  })
})
