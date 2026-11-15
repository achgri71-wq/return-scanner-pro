/**
 * Permanent "routeur" lists.
 *
 * ColisFlow keeps them as non-deletable distributors and this app shows them
 * on a read-only page. ColisFlow now flags its routeur lists in the shared
 * link, so the page prefers that flag; the names below remain the fallback
 * slots, matched tolerantly (extra "e" in ROUTEUR(E), doubled spaces and
 * accents) so a list renamed on the other side still lands on the right slot.
 */

export interface FixedList {
  id: string
  name: string
}

export const FIXED_LISTS: FixedList[] = [
  { id: 'fixed-routeure-ayoub', name: 'ROUTEURE AYOUB' },
  { id: 'fixed-routeur-anass', name: 'ROUTEUR ANASS' },
  { id: 'fixed-routeure-lazrak', name: 'ROUTEURE LAZRAK' },
  { id: 'fixed-routeure-bourbiaa', name: 'ROUTEURE BOURBIAA' },
  { id: 'fixed-routeure-yassin', name: 'ROUTEURE YASSIN' },
  { id: 'fixed-routeure', name: 'ROUTEURE' },
]

/** Folds a list name into a comparable key (accents, spaces, ROUTEUR(E)). */
export function normalizeFixedName(name: string): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^routeure\b/, 'routeur')
}

const NORMALIZED = new Set(FIXED_LISTS.map((list) => normalizeFixedName(list.name)))

/** True when a name is one of the permanent routeur lists (tolerant). */
export function isFixedListName(name: string): boolean {
  return NORMALIZED.has(normalizeFixedName(name))
}

/** Built-in slot matching a tolerant name, when there is one. */
export function fixedSlotFor(name: string): FixedList | undefined {
  return FIXED_LISTS.find((list) => normalizeFixedName(list.name) === normalizeFixedName(name))
}

/**
 * True when a ColisFlow distributor is one of the permanent routeur lists.
 * ColisFlow flags them in the shared link, which is authoritative and survives
 * a rename; the name match is the fallback for older published payloads.
 */
export function isFixedDistributor(item: { name: string; fixed?: boolean }): boolean {
  return Boolean(item.fixed) || isFixedListName(item.name)
}
