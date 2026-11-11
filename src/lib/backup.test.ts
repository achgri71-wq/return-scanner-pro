import { describe, expect, it } from 'vitest'
import { isBackupPayload, validateBackup } from './backup'

const NOW = '2026-10-27T10:00:00.000Z'

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    app: 'return-scanner-pro',
    version: 1,
    exportedAt: NOW,
    lists: [
      {
        id: 'L1',
        name: 'Casablanca',
        status: 'active',
        source: 'import',
        notes: '',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    parcels: [
      {
        id: 'P1',
        listId: 'L1',
        code: 'ab-0012',
        status: 'returned',
        addedAt: NOW,
        source: 'import',
        returnedAt: NOW,
        returnedBy: 'Samir',
      },
    ],
    registry: [
      {
        id: 'R1',
        listId: 'L1',
        code: 'ab-0012',
        status: 'required-returned',
        firstScanAt: NOW,
        lastAttemptAt: NOW,
        attempts: 2,
        lastResult: 'duplicate',
      },
    ],
    events: [
      {
        id: 'E1',
        at: NOW,
        code: 'ab-0012',
        listId: 'L1',
        listName: 'Casablanca',
        sessionId: 'S1',
        source: 'camera',
        result: 'accepted',
      },
    ],
    blacklist: [
      { id: 'B1', code: 'bad-code', reason: 'fraud', addedAt: NOW, addedBy: 'admin' },
    ],
    sessions: [
      {
        id: 'S1',
        listId: 'L1',
        listName: 'Casablanca',
        startedAt: NOW,
        status: 'open',
      },
    ],
    employees: [
      { id: 'EM1', name: 'Samir', role: 'operator', active: true, createdAt: NOW, updatedAt: NOW },
    ],
    audit: [
      { id: 'A1', at: NOW, action: 'list-create', actor: 'admin', detail: 'created' },
    ],
    settings: { lang: 'ar', sounds: false, activeListId: 'L1' },
    ...overrides,
  }
}

describe('validateBackup', () => {
  it('accepts a valid payload and sanitises every store', () => {
    const preview = validateBackup(validPayload())
    expect(preview.valid).toBe(true)
    expect(preview.errors).toEqual([])
    expect(preview.warnings).toEqual([])
    expect(preview.totalRecords).toBe(8)
    expect(preview.counts).toMatchObject({
      lists: 1,
      parcels: 1,
      registry: 1,
      events: 1,
      blacklist: 1,
      sessions: 1,
      employees: 1,
      audit: 1,
    })
    expect(preview.exportedAt).toBe(NOW)
    expect(preview.settings).toMatchObject({ lang: 'ar', sounds: false, activeListId: 'L1' })
    expect(preview.data?.parcels[0]?.code).toBe('AB-0012')
    expect(preview.data?.registry[0]?.code).toBe('AB-0012')
    expect(preview.data?.blacklist[0]?.code).toBe('BAD-CODE')
    expect(preview.data?.events[0]?.source).toBe('camera')
  })

  it('rejects non-objects and foreign applications', () => {
    expect(validateBackup(null).errors).toContain('not-object')
    expect(validateBackup([]).errors).toContain('not-object')
    expect(validateBackup(validPayload({ app: 'other-app' })).errors).toContain('app-mismatch')
    expect(validateBackup(validPayload({ version: 2 })).errors).toContain('version-mismatch')
  })

  it('reports every missing collection', () => {
    const preview = validateBackup({ app: 'return-scanner-pro', version: 1 })
    expect(preview.valid).toBe(false)
    expect(preview.errors).toEqual(
      expect.arrayContaining([
        'missing-lists',
        'missing-parcels',
        'missing-registry',
        'missing-events',
        'missing-blacklist',
        'missing-sessions',
        'missing-employees',
        'missing-audit',
      ]),
    )
    expect(preview.totalRecords).toBe(0)
  })

  it('drops orphaned records and warns about them', () => {
    const preview = validateBackup(
      validPayload({
        parcels: [
          { id: 'P1', listId: 'L1', code: 'A1', status: 'pending', addedAt: NOW },
          { id: 'P2', listId: 'GHOST', code: 'A2', status: 'pending', addedAt: NOW },
        ],
        registry: [{ id: 'R2', listId: 'GHOST', code: 'A2' }],
        sessions: [{ id: 'S2', listId: 'GHOST', listName: 'Ghost', startedAt: NOW }],
      }),
    )
    expect(preview.valid).toBe(true)
    expect(preview.warnings).toContain('invalid-parcels-skipped')
    expect(preview.warnings).toContain('invalid-registry-skipped')
    expect(preview.warnings).toContain('invalid-sessions-skipped')
    expect(preview.data?.parcels.map((item) => item.id)).toEqual(['P1'])
    expect(preview.data?.registry).toEqual([])
    expect(preview.data?.sessions).toEqual([])
  })

  it('deduplicates ids and codes, and normalises defaults', () => {
    const preview = validateBackup(
      validPayload({
        lists: [
          { id: 'L1', name: 'One' },
          { id: 'L1', name: 'Duplicate id' },
          { id: '', name: 'No id' },
        ],
        parcels: [
          { id: 'P1', listId: 'L1', code: 'a1', status: 'returned' },
          { id: 'P2', listId: 'L1', code: 'A1', status: 'returned' },
          { id: 'P1', listId: 'L1', code: 'A2' },
        ],
        registry: [
          { id: 'R1', listId: 'L1', code: 'A1', status: 'weird', attempts: 0 },
          { id: 'R2', listId: 'L1', code: 'A1' },
        ],
        blacklist: [
          { id: 'B1', code: 'bad' },
          { id: 'B2', code: 'BAD', reason: 'dup' },
        ],
      }),
    )
    expect(preview.data?.lists).toHaveLength(1)
    expect(preview.data?.lists[0]?.status).toBe('new')
    expect(preview.data?.lists[0]?.source).toBe('manual')
    expect(preview.data?.parcels).toHaveLength(1)
    expect(preview.data?.parcels[0]).toMatchObject({ id: 'P1', code: 'A1', status: 'returned' })
    expect(preview.data?.registry).toHaveLength(1)
    expect(preview.data?.registry[0]).toMatchObject({
      code: 'A1',
      status: 'not-required',
      attempts: 1,
      lastResult: 'not-required',
    })
    expect(preview.data?.blacklist).toHaveLength(1)
    expect(preview.data?.blacklist[0]?.code).toBe('BAD')
    expect(preview.warnings).toContain('invalid-lists-skipped')
  })

  it('warns about multiple open sessions and orphan events', () => {
    const preview = validateBackup(
      validPayload({
        sessions: [
          { id: 'S1', listId: 'L1', listName: 'A', startedAt: NOW, status: 'open' },
          { id: 'S2', listId: 'L1', listName: 'A', startedAt: NOW, status: 'open' },
        ],
        events: [
          {
            id: 'E1',
            at: NOW,
            code: 'A1',
            listId: 'GHOST',
            listName: 'Ghost',
            result: 'accepted',
            source: 'manual',
          },
        ],
      }),
    )
    expect(preview.warnings).toContain('multiple-open-sessions')
    expect(preview.warnings).toContain('orphan-events')
  })

  it('keeps unknown audit actions verbatim but defaults missing text', () => {
    const preview = validateBackup(
      validPayload({
        audit: [{ id: 'A1', action: 'custom-action', detail: 'x' }],
      }),
    )
    expect(preview.data?.audit[0]).toMatchObject({
      action: 'custom-action',
      actor: 'local',
      detail: 'x',
    })
  })
})

describe('isBackupPayload', () => {
  it('narrows only valid payloads', () => {
    expect(isBackupPayload(validPayload())).toBe(true)
    expect(isBackupPayload({ app: 'return-scanner-pro', version: 1 })).toBe(false)
  })
})
