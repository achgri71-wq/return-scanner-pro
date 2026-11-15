import { describe, expect, it } from 'vitest'
import { FIXED_LISTS, fixedSlotFor, isFixedDistributor, isFixedListName, normalizeFixedName } from './fixedLists'

describe('normalizeFixedName', () => {
  it('collapses spacing, accents and the ROUTEUR(E) spelling', () => {
    expect(normalizeFixedName('ROUTEURE AYOUB')).toBe('routeur ayoub')
    expect(normalizeFixedName('ROUTEUR  AYOUB')).toBe('routeur ayoub')
    expect(normalizeFixedName(' routeur ayoub ')).toBe('routeur ayoub')
    expect(normalizeFixedName('ROUTEURÉ AYOUB')).toBe('routeur ayoub')
  })
})

describe('isFixedListName', () => {
  it('accepts the six built-in names as written', () => {
    for (const list of FIXED_LISTS) expect(isFixedListName(list.name)).toBe(true)
  })

  it('still matches when the operator spelled or spaced it differently', () => {
    // The built-in slot is spelled ROUTEUR ANASS; a ROUTEURE ANASS elsewhere
    // must not fall out of the routeur group and duplicate the list.
    expect(isFixedListName('ROUTEURE ANASS')).toBe(true)
    expect(isFixedListName('ROUTEURE   AYOUB')).toBe(true)
    expect(isFixedListName('routeure ayoub')).toBe(true)
  })

  it('never matches a normal distributor', () => {
    expect(isFixedListName('LIVREUR TEST')).toBe(false)
    expect(isFixedListName('AYOUB EXPRESS')).toBe(false)
    expect(isFixedListName('')).toBe(false)
  })
})

describe('fixedSlotFor', () => {
  it('resolves a renamed or respelled list back to its slot', () => {
    expect(fixedSlotFor('ROUTEURE ANASS')?.id).toBe('fixed-routeur-anass')
    expect(fixedSlotFor('LIVREUR TEST')).toBeUndefined()
  })
})

describe('isFixedDistributor', () => {
  it('trusts the flag ColisFlow publishes, even after a rename', () => {
    expect(isFixedDistributor({ name: 'MAGASIN CENTRAL', fixed: true })).toBe(true)
    expect(isFixedDistributor({ name: 'LIVREUR TEST' })).toBe(false)
    // Name fallback keeps older payloads working.
    expect(isFixedDistributor({ name: 'ROUTEURE AYOUB' })).toBe(true)
  })
})
