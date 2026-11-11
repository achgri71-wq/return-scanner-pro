import type { BlacklistEntry, ReturnList, ReturnParcel } from '../types'

export interface ScanIndex {
  activeList?: ReturnList
  parcelByCode: Map<string, ReturnParcel>
  blacklistByCode: Map<string, BlacklistEntry>
  listsByParcelCode: Map<string, ReturnList[]>
}

export type ScanDecision =
  | { kind: 'no-list' }
  | { kind: 'list-closed'; list: ReturnList }
  | { kind: 'blacklisted'; entry: BlacklistEntry }
  | { kind: 'accepted'; parcel: ReturnParcel }
  | { kind: 'duplicate'; parcel: ReturnParcel }
  | { kind: 'other-list'; list: ReturnList }
  | { kind: 'not-required' }

export function buildScanIndex(
  activeListId: string | null | undefined,
  lists: ReturnList[],
  parcels: ReturnParcel[],
  blacklist: BlacklistEntry[],
): ScanIndex {
  const activeList = activeListId ? lists.find((list) => list.id === activeListId) : undefined
  const parcelByCode = new Map<string, ReturnParcel>()
  const listsByParcelCode = new Map<string, ReturnList[]>()
  const listById = new Map(lists.map((list) => [list.id, list]))

  for (const parcel of parcels) {
    const list = listById.get(parcel.listId)
    if (!list) continue
    if (activeListId && parcel.listId === activeListId) {
      parcelByCode.set(parcel.code, parcel)
    }
    const holders = listsByParcelCode.get(parcel.code)
    if (holders) holders.push(list)
    else listsByParcelCode.set(parcel.code, [list])
  }

  const blacklistByCode = new Map<string, BlacklistEntry>()
  for (const entry of blacklist) {
    const existing = blacklistByCode.get(entry.code)
    if (!existing || existing.addedAt < entry.addedAt) blacklistByCode.set(entry.code, entry)
  }

  return { activeList, parcelByCode, blacklistByCode, listsByParcelCode }
}

/**
 * Applies the mandatory validation priority:
 * blacklist → active-list membership → already returned → other list → not required.
 */
export function decideScan(code: string, index: ScanIndex): ScanDecision {
  if (!index.activeList) return { kind: 'no-list' }
  if (index.activeList.status === 'completed' || index.activeList.status === 'archived') {
    return { kind: 'list-closed', list: index.activeList }
  }

  const blacklisted = index.blacklistByCode.get(code)
  if (blacklisted) return { kind: 'blacklisted', entry: blacklisted }

  const parcel = index.parcelByCode.get(code)
  if (parcel) {
    return parcel.status === 'returned'
      ? { kind: 'duplicate', parcel }
      : { kind: 'accepted', parcel }
  }

  const holders = (index.listsByParcelCode.get(code) ?? []).filter(
    (list) => list.id !== index.activeList?.id,
  )
  if (holders.length) {
    const preferred =
      holders.find((list) => list.status === 'active' || list.status === 'new') ?? holders[0]
    return { kind: 'other-list', list: preferred }
  }

  return { kind: 'not-required' }
}
