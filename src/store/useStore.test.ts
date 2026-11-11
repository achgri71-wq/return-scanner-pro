import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppData } from '../types'
import { defaultSettings, useStore } from './useStore'
import * as db from '../lib/db'
import { computeListStats, blacklistCodeSet } from '../lib/stats'

const EMPTY: AppData = {
  lists: [],
  parcels: [],
  registry: [],
  events: [],
  blacklist: [],
  employees: [],
  audit: [],
}

function resetState(): void {
  useStore.setState({
    ...EMPTY,
    ready: true,
    settings: { ...defaultSettings },
    persistStatus: 'idle',
    lastOutcome: undefined,
    lastOutcomeSeq: 0,
    persistError: undefined,
    lastSavedAt: undefined,
  })
}

async function settle(): Promise<void> {
  for (let index = 0; index < 200; index += 1) {
    if (useStore.getState().persistStatus !== 'saving') return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('persistence did not settle')
}

function createList(name: string, codes: string[]): string {
  const result = useStore.getState().importCodes({ name, codes, mode: 'new' })
  expect(result.ok).toBe(true)
  expect(result.summary).toBeDefined()
  return result.summary!.listId
}

function activate(listId: string): void {
  const result = useStore.getState().switchList(listId)
  expect(result.ok).toBe(true)
}

function codeRows(code: string, listId?: string) {
  return useStore
    .getState()
    .registry.filter(
      (entry) => entry.code === code && (listId === undefined || entry.listId === listId),
    )
}

beforeEach(async () => {
  await settle()
  await db.replaceAll(EMPTY)
  resetState()
})

describe('list import and isolation', () => {
  it('creates lists with unique names and preserves leading zeros', () => {
    const listId = createList('Casablanca', ['001234', '001235'])
    const list = useStore.getState().lists.find((item) => item.id === listId)
    expect(list?.name).toBe('Casablanca')
    expect(list?.status).toBe('new')

    const parcels = useStore.getState().parcels.filter((parcel) => parcel.listId === listId)
    expect(parcels.map((parcel) => parcel.code)).toEqual(['001234', '001235'])
    expect(parcels.every((parcel) => parcel.status === 'pending')).toBe(true)

    const duplicate = useStore.getState().importCodes({
      name: '  casablanca ',
      codes: ['X1'],
      mode: 'new',
    })
    expect(duplicate.ok).toBe(false)
    expect(duplicate.error).toBe('duplicate-name')
  })

  it('reports duplicates and invalid codes without creating rows', () => {
    const listId = createList('Liste A', ['001', '002'])
    const result = useStore.getState().addCodesToList(listId, ['001', '001', '003', 'A'])
    expect(result.ok).toBe(true)
    expect(result.summary).toMatchObject({
      mode: 'merge',
      imported: 1,
      duplicates: 2,
      rejected: 1,
      totalCodes: 4,
    })
    const codes = useStore
      .getState()
      .parcels.filter((parcel) => parcel.listId === listId)
      .map((parcel) => parcel.code)
    expect(codes).toEqual(['001', '002', '003'])
  })

  it('keeps lists isolated from each other', () => {
    const a = createList('Liste A', ['A-001'])
    const b = createList('Liste B', ['B-001'])
    activate(a)
    const outcome = useStore.getState().scan('B-001', 'manual')
    expect(outcome.status).toBe('other-list')
    expect(outcome.otherListId).toBe(b)
    expect(useStore.getState().parcels.find((parcel) => parcel.listId === b)?.status).toBe('pending')
    expect(codeRows('B-001', b)).toHaveLength(0)
    expect(codeRows('B-001', a)).toHaveLength(1)
    expect(useStore.getState().registry.filter((entry) => entry.listId === a)).toHaveLength(1)
  })
})

describe('scanning acceptance behaviour', () => {
  it('accepts once, then detects the duplicate without adding rows', () => {
    const listId = createList('Scan list', ['001', '002'])
    activate(listId)

    const accepted = useStore.getState().scan('001', 'camera')
    expect(accepted.status).toBe('accepted')
    expect(accepted.listId).toBe(listId)
    expect(accepted.listName).toBe('Scan list')

    const afterAccept = useStore.getState()
    const parcel = afterAccept.parcels.find((item) => item.code === '001')
    expect(parcel?.status).toBe('returned')
    expect(parcel?.returnedAt).toBeDefined()
    expect(codeRows('001')).toHaveLength(1)
    expect(codeRows('001')[0]?.attempts).toBe(1)
    expect(codeRows('001')[0]?.status).toBe('required-returned')
    expect(afterAccept.events).toHaveLength(1)

    const duplicate = useStore.getState().scan('001', 'manual')
    expect(duplicate.status).toBe('duplicate')
    expect(duplicate.parcelId).toBe(accepted.parcelId)

    const afterDuplicate = useStore.getState()
    expect(afterDuplicate.parcels.filter((item) => item.code === '001')).toHaveLength(1)
    expect(afterDuplicate.parcels.filter((item) => item.code === '001')[0]?.status).toBe('returned')
    expect(codeRows('001')).toHaveLength(1)
    expect(codeRows('001')[0]?.attempts).toBe(2)
    expect(codeRows('001')[0]?.lastResult).toBe('duplicate')
    expect(afterDuplicate.events).toHaveLength(2)
    expect(afterDuplicate.events.map((event) => event.result).sort()).toEqual([
      'accepted',
      'duplicate',
    ])
  })

  it('is idempotent for repeated scan ids so a code is never counted twice', () => {
    const listId = createList('Scan list', ['002'])
    activate(listId)

    const first = useStore.getState().scan('002', 'hid', 'scan-request-1')
    const seqAfterFirst = useStore.getState().lastOutcomeSeq
    const second = useStore.getState().scan('002', 'hid', 'scan-request-1')

    expect(first.status).toBe('accepted')
    expect(second.status).toBe('accepted')
    expect(useStore.getState().events).toHaveLength(1)
    expect(codeRows('002')[0]?.attempts).toBe(1)
    expect(useStore.getState().lastOutcomeSeq).toBe(seqAfterFirst)
    expect(useStore.getState().persistStatus).not.toBe('error')
  })

  it('accepts manual entry with lowercase and surrounding whitespace', () => {
    const listId = createList('Scan list', ['ab-0012'])
    activate(listId)
    const outcome = useStore.getState().scan('  ab-0012  ', 'manual')
    expect(outcome.status).toBe('accepted')
    expect(outcome.code).toBe('AB-0012')
    expect(useStore.getState().parcels.find((item) => item.code === 'AB-0012')?.status).toBe(
      'returned',
    )
  })

  it('rejects unrequested and other-list codes as distinct outcomes', () => {
    const a = createList('Liste A', ['A-001'])
    createList('Liste B', ['B-001'])
    activate(a)

    const unknown = useStore.getState().scan('UNKNOWN-99', 'manual')
    expect(unknown.status).toBe('not-required')
    expect(codeRows('UNKNOWN-99', a)[0]?.status).toBe('not-required')
    expect(codeRows('UNKNOWN-99', a)[0]?.lastResult).toBe('not-required')

    const foreign = useStore.getState().scan('B-001', 'manual')
    expect(foreign.status).toBe('other-list')
    expect(foreign.otherListName).toBe('Liste B')
    expect(codeRows('B-001', a)[0]?.status).toBe('not-required')
    expect(codeRows('B-001', a)[0]?.lastResult).toBe('other-list')
    expect(codeRows('B-001', a)[0]?.otherListName).toBe('Liste B')
  })

  it('refuses invalid codes without touching the registry', () => {
    const listId = createList('Scan list', ['001'])
    activate(listId)
    expect(useStore.getState().scan('A', 'manual').status).toBe('invalid')
    expect(useStore.getState().scan('   ', 'camera').status).toBe('invalid')
    expect(useStore.getState().registry).toHaveLength(0)
    expect(useStore.getState().events).toHaveLength(0)
  })

  it('updates attempts without creating rows for repeated rejections and blacklist hits', () => {
    const listId = createList('Scan list', ['A-001'])
    activate(listId)
    useStore.getState().addBlacklist([{ code: 'B-999', reason: 'blocked' }])

    useStore.getState().scan('NOPE-1', 'manual')
    useStore.getState().scan('NOPE-1', 'manual')
    const rejected = codeRows('NOPE-1', listId)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({ attempts: 2, status: 'not-required', lastResult: 'not-required' })

    useStore.getState().scan('B-999', 'manual')
    useStore.getState().scan('B-999', 'manual')
    const blocked = codeRows('B-999', listId)
    expect(blocked).toHaveLength(1)
    expect(blocked[0]).toMatchObject({
      attempts: 2,
      status: 'return-prohibited',
      lastResult: 'blacklisted',
    })
    expect(useStore.getState().events).toHaveLength(4)
    expect(useStore.getState().parcels.find((item) => item.code === 'A-001')?.status).toBe('pending')
  })
})

describe('blacklist priority', () => {
  it('blocks a pending active-list code and a code from another list', () => {
    const a = createList('Liste A', ['A-001', 'A-002'])
    const b = createList('Liste B', ['B-001', 'B-002'])
    activate(a)

    const added = useStore.getState().addBlacklist([
      { code: 'a-001', reason: 'fraud' },
      { code: 'B-001', reason: 'blocked' },
      { code: 'A-001', reason: 'duplicate entry' },
    ])
    expect(added).toEqual({ added: 2, skipped: 1 })
    expect(useStore.getState().blacklist.map((entry) => entry.code).sort()).toEqual([
      'A-001',
      'B-001',
    ])

    const activeHit = useStore.getState().scan('A-001', 'camera')
    expect(activeHit.status).toBe('blacklisted')
    expect(activeHit.reason).toBe('fraud')
    expect(codeRows('A-001', a)[0]?.status).toBe('return-prohibited')
    expect(useStore.getState().parcels.find((item) => item.code === 'A-001')?.status).toBe(
      'pending',
    )

    const foreignHit = useStore.getState().scan('B-001', 'manual')
    expect(foreignHit.status).toBe('blacklisted')
    expect(foreignHit.otherListId).toBeUndefined()
    expect(codeRows('B-001', a)[0]?.status).toBe('return-prohibited')
    expect(useStore.getState().parcels.find((item) => item.listId === b)?.status).toBe('pending')
  })

  it('keeps priority over an already-returned code', () => {
    const listId = createList('Liste A', ['A-001', 'A-002'])
    activate(listId)
    expect(useStore.getState().scan('A-001', 'manual').status).toBe('accepted')

    useStore.getState().addBlacklist([{ code: 'A-001', reason: 'chargeback' }])
    const outcome = useStore.getState().scan('A-001', 'manual')
    expect(outcome.status).toBe('blacklisted')
    expect(codeRows('A-001')[0]?.attempts).toBe(2)
    expect(codeRows('A-001')[0]?.status).toBe('return-prohibited')
  })
})

describe('direct scanning and list closure', () => {
  it('scans directly without any session and records events', () => {
    const listId = createList('Direct', ['001', '002', '003'])
    activate(listId)

    const accepted = useStore.getState().scan('001', 'manual')
    expect(accepted.status).toBe('accepted')
    useStore.getState().scan('001', 'manual')
    useStore.getState().scan('NOPE', 'manual')

    const state = useStore.getState()
    expect(state.events).toHaveLength(3)
    expect(
      state.events.every((event) => (event as unknown as { sessionId?: string }).sessionId === undefined),
    ).toBe(true)
    const parcel = state.parcels.find((item) => item.code === '001')
    expect(parcel?.status).toBe('returned')
    expect(parcel?.returnedBy).toBeTruthy()
    expect(codeRows('001')[0]?.attempts).toBe(2)
  })

  it('completes the list automatically when every parcel is returned', () => {
    const a = createList('Liste A', ['A-001'])
    activate(a)
    expect(useStore.getState().scan('A-001', 'manual').status).toBe('accepted')

    const list = useStore.getState().lists.find((item) => item.id === a)
    expect(list?.status).toBe('completed')

    expect(useStore.getState().scan('A-001', 'manual').status).toBe('list-closed')

    const reopened = useStore.getState().reopenList(a)
    expect(reopened.ok).toBe(true)
    expect(useStore.getState().scan('A-001', 'manual').status).toBe('duplicate')
  })

  it('switching lists is immediate and keeps scanning working on the new list', () => {
    const a = createList('Liste A', ['A-001'])
    const b = createList('Liste B', ['B-001'])
    activate(a)
    useStore.getState().scan('A-001', 'manual')

    const switched = useStore.getState().switchList(b)
    expect(switched.ok).toBe(true)
    expect(useStore.getState().settings.activeListId).toBe(b)
    expect(useStore.getState().scan('B-001', 'manual').status).toBe('accepted')
  })

  it('keeps remaining statistics accurate after accepted and duplicate scans', () => {
    const listId = createList('Stats', ['001', '002', '003'])
    activate(listId)
    useStore.getState().scan('001', 'manual')
    useStore.getState().scan('001', 'manual')
    const state = useStore.getState()
    const stats = computeListStats(listId, state.parcels, blacklistCodeSet(state.blacklist))
    expect(stats).toMatchObject({ total: 3, returned: 1, remaining: 2, pending: 2 })
  })
})

describe('replace import and correction', () => {
  it('replaces list contents but keeps the event log and audit history', () => {
    const listId = createList('Replace me', ['001', '002'])
    activate(listId)
    useStore.getState().scan('001', 'manual')

    const before = useStore.getState()
    const oldParcelIds = before.parcels.map((parcel) => parcel.id)
    const eventCount = before.events.length
    expect(eventCount).toBe(1)
    expect(before.registry.filter((entry) => entry.listId === listId)).toHaveLength(1)

    const result = useStore.getState().importCodes({
      name: 'Replace me',
      codes: ['003', '004'],
      mode: 'replace',
      targetListId: listId,
      sourceFileName: 'new.xlsx',
    })
    expect(result.ok).toBe(true)
    expect(result.summary).toMatchObject({ mode: 'replace', imported: 2 })

    const after = useStore.getState()
    const parcels = after.parcels.filter((parcel) => parcel.listId === listId)
    expect(parcels.map((parcel) => parcel.code)).toEqual(['003', '004'])
    expect(parcels.every((parcel) => parcel.status === 'pending')).toBe(true)
    expect(after.parcels.some((parcel) => oldParcelIds.includes(parcel.id))).toBe(false)
    expect(after.registry.filter((entry) => entry.listId === listId)).toHaveLength(0)
    expect(after.events).toHaveLength(eventCount)
    expect(after.audit.some((entry) => entry.action === 'list-replace')).toBe(true)
    expect(after.lists.find((item) => item.id === listId)?.status).toBe('new')
  })

  it('protects return correction with a reason and the admin PIN', () => {
    const listId = createList('Corrections', ['001'])
    activate(listId)
    const accepted = useStore.getState().scan('001', 'manual')
    const parcelId = accepted.parcelId!
    expect(parcelId).toBeDefined()

    expect(
      useStore.getState().correctReturn({ parcelId, reason: '', actor: 'Admin' }).error,
    ).toBe('reason-required')

    useStore.getState().setSettings({ adminPin: '4321' })
    expect(
      useStore
        .getState()
        .correctReturn({ parcelId, reason: 'wrong parcel', actor: 'Admin', pin: '0000' }).error,
    ).toBe('unauthorized')

    const corrected = useStore
      .getState()
      .correctReturn({ parcelId, reason: 'wrong parcel scanned', actor: 'Admin', pin: '4321' })
    expect(corrected.ok).toBe(true)
    expect(useStore.getState().parcels.find((parcel) => parcel.id === parcelId)?.status).toBe(
      'pending',
    )
    expect(codeRows('001', listId)).toHaveLength(0)
    expect(
      useStore.getState().audit.some((entry) => entry.action === 'return-correction'),
    ).toBe(true)

    const rescanned = useStore.getState().scan('001', 'manual')
    expect(rescanned.status).toBe('accepted')
    expect(codeRows('001', listId)[0]?.attempts).toBe(1)
  })
})

describe('offline persistence', () => {
  it('persists scans, registry, blacklist and audit to IndexedDB', async () => {
    const listId = createList('Offline', ['001', '002'])
    activate(listId)
    useStore.getState().scan('001', 'manual')
    useStore.getState().addBlacklist([{ code: '002', reason: 'blocked' }])
    await settle()

    const loaded = await db.loadAll()
    expect(loaded.lists.find((list) => list.id === listId)?.name).toBe('Offline')
    expect(loaded.parcels.find((parcel) => parcel.code === '001')?.status).toBe('returned')
    expect(
      loaded.registry.find((entry) => entry.code === '001' && entry.listId === listId)?.status,
    ).toBe('required-returned')
    expect(loaded.events).toHaveLength(1)
    expect(loaded.events[0]?.result).toBe('accepted')
    expect(loaded.blacklist[0]?.code).toBe('002')
    expect(loaded.audit.length).toBeGreaterThan(0)

    expect(useStore.getState().persistStatus).toBe('saved')
  })
})
