/**
 * Permanent "routeur" lists.
 *
 * These six lists always exist in ColisFlow (as non-deletable distributors)
 * and are shown here on a read-only page. The names must match ColisFlow's
 * exactly, so the shared link can match them one-to-one.
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

const NORMALIZED = new Set(FIXED_LISTS.map((list) => list.name.toLowerCase()))

/** True when a name is one of the permanent routeur lists. */
export function isFixedListName(name: string): boolean {
  return NORMALIZED.has(String(name ?? '').trim().toLowerCase())
}
