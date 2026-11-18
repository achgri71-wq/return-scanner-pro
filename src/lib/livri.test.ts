import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadLivriCodes, makeLivriCode, saveLivriCodes } from './livri'

/** Minimal in-memory localStorage: the test env is plain Node. */
function installStorage() {
  const map = new Map<string, string>()
  const storage = {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  }
  ;(globalThis as { localStorage?: unknown }).localStorage = storage
  return storage
}

describe('livri storage', () => {
  beforeEach(() => {
    installStorage()
  })

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage
  })

  it('starts empty', () => {
    expect(loadLivriCodes()).toEqual([])
  })

  it('round-trips saved codes', () => {
    saveLivriCodes([makeLivriCode('abc123', '2026-11-18T10:00:00.000Z')])
    const loaded = loadLivriCodes()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].code).toBe('ABC123')
    expect(loaded[0].addedAt).toBe('2026-11-18T10:00:00.000Z')
  })

  it('drops invalid and duplicate entries', () => {
    saveLivriCodes([
      makeLivriCode('AAA001'),
      makeLivriCode('AAA001'),
      { id: 'x', code: '', addedAt: '2026-11-18T10:00:00.000Z' },
    ])
    expect(loadLivriCodes().map((item) => item.code)).toEqual(['AAA001'])
  })

  it('returns an empty list when the stored value is corrupt', () => {
    ;(globalThis as { localStorage: { setItem: (k: string, v: string) => void } }).localStorage.setItem(
      'rsp.livri.codes',
      '{not json',
    )
    expect(loadLivriCodes()).toEqual([])
  })
})
