import { useEffect, useMemo, useState } from 'react'
import {
  AlarmClock,
  Boxes,
  CheckSquare,
  ChevronDown,
  Copy,
  Inbox,
  ListChecks,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  Truck,
  X,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useI18n } from '../i18n'
import {
  buildReturnIndex,
  loadFlowDistributors,
  loadFlowPublishedAt,
  syncFlow,
  type FlowDistributor,
  type ReturnStatus,
} from '../lib/flowLink'
import { isFixedDistributor } from '../lib/fixedLists'
import { loadRequestedCodes, saveRequestedCodes } from '../lib/colisDemande'
import { createLateMerge, loadLateMerges, saveLateMerges, type LateMerge } from '../lib/lateMerges'
import { cx, formatDate, formatNumber, relativeTime } from '../lib/utils'
import { Badge, ConfirmDialog, EmptyState, Modal, PageHeader, SearchField, StatCard } from '../components/ui'
import { CodeRecordModal, type CodeHit } from '../components/CodeRecord'
import { toast } from '../components/Toast'

/**
 * Late-code notices.
 *
 * A code is "late" when it has been sitting in a normal ColisFlow distributor
 * for the configured number of days (Settings) without being resolved: it has
 * not been returned to us, moved to a permanent routeur list, nor scanned into
 * the Entrepôt. When a code was moved to another distributor the count restarts
 * from the move date, while the list keeps showing the code's original scan
 * date.
 *
 * Each distributor can be notified on WhatsApp with the list of its late codes.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const CODE_PAGE_SIZE = 100

function isSenditCode(code: string): boolean {
  const normalized = code.trim().toUpperCase()
  return normalized.startsWith('DH') || normalized.startsWith('DXH') || normalized.startsWith('DSH')
}

function senditDeliveryUrl(code: string): string | null {
  return isSenditCode(code)
    ? `https://app.sendit.ma/deliveries/${encodeURIComponent(code.trim())}`
    : null
}
/** Local numbers (06…) are turned into international form for wa.me. */
const COUNTRY_CODE = '212'

interface LateCode {
  code: string
  at: string
  days: number
  sourceName?: string
}

interface LateGroup {
  id: string
  name: string
  phone?: string
  codes: LateCode[]
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const input = document.createElement('textarea')
    input.value = text
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    const copied = document.execCommand('copy')
    input.remove()
    if (!copied) throw new Error('Clipboard unavailable')
  }
}

function LateGroupCard({
  group,
  checked,
  expanded,
  onSelect,
  onToggle,
  onOpenCode,
  onCopy,
  onDeleteCode,
  onDeleteGroup,
  virtual = false,
  onRemoveVirtual,
  onRenameVirtual,
  onAddSources,
}: {
  group: LateGroup
  checked: boolean
  expanded: boolean
  onSelect: () => void
  onToggle: () => void
  onOpenCode: (group: LateGroup, code: LateCode) => void
  onCopy: (codes: LateCode[]) => void
  onDeleteCode: (group: LateGroup, code: LateCode) => void
  onDeleteGroup: (group: LateGroup) => void
  virtual?: boolean
  onRemoveVirtual?: () => void
  onRenameVirtual?: () => void
  onAddSources?: () => void
}) {
  const { t, lang } = useI18n()
  const [limit, setLimit] = useState(CODE_PAGE_SIZE)

  useEffect(() => setLimit(CODE_PAGE_SIZE), [group.id, group.codes.length])

  const header = t('late.waHeader', { name: group.name, count: group.codes.length })
  const lines = group.codes.map((item) => {
    const source = item.sourceName ? ` (${item.sourceName})` : ''
    const url = senditDeliveryUrl(item.code)
    return `• ${item.code} — ${formatDate(item.at, lang)}${source}${url ? `\n  ${url}` : ''}`
  })
  const message = [header, '', ...lines, '', t('late.waFooter')].join('\n')

  return (
    <article className={cx('late-card', !expanded && 'is-collapsed')}>
      <header className="late-card-head">
        {!virtual ? (
          <label className="late-group-check" title={t('late.selectGroup', { name: group.name })}>
            <input type="checkbox" checked={checked} onChange={onSelect} />
          </label>
        ) : null}
        <span className="late-card-icon"><AlarmClock size={18} /></span>
        <button
          type="button"
          className="late-card-toggle"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="late-card-name">{group.name}</span>
          <ChevronDown size={17} className="late-card-chevron" />
        </button>
        <Badge tone={virtual ? 'accent' : 'danger'}>
          {virtual ? t('late.mergedBadge', { count: group.codes.length }) : t('fixed.codes', { count: group.codes.length })}
        </Badge>
        <button
          type="button"
          className="icon-btn late-copy-group"
          onClick={() => onCopy(group.codes)}
          title={t('late.copyList')}
          aria-label={t('late.copyList')}
        >
          <Copy size={15} />
        </button>
        {virtual ? (
          <>
            <button
              type="button"
              className="icon-btn late-add-sources"
              onClick={onAddSources}
              title={t('late.addLists')}
              aria-label={t('late.addLists')}
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              className="icon-btn late-rename-merged"
              onClick={onRenameVirtual}
              title={t('late.renameMerge')}
              aria-label={t('late.renameMerge')}
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              className="icon-btn late-remove-merged"
              onClick={onRemoveVirtual}
              title={t('late.closeMerged')}
              aria-label={t('late.closeMerged')}
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <button
            type="button"
            className="icon-btn late-delete-group"
            onClick={() => onDeleteGroup(group)}
            title={t('late.deleteGroupButton')}
            aria-label={t('late.deleteGroupButton')}
          >
            <Trash2 size={15} />
          </button>
        )}
        <a
          className="btn btn-primary btn-sm late-wa"
          href={whatsappLink(group.phone, message)}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!group.codes.length}
          onClick={(event) => {
            if (!group.codes.length) event.preventDefault()
          }}
        >
          <MessageCircle size={16} />
          {t('late.whatsapp')}
        </a>
      </header>

      {expanded ? (
        group.codes.length ? (
          <>
          <ul className="late-codes">
            {group.codes.slice(0, limit).map((item) => (
              <li className="late-code-item" key={item.code}>
                {!virtual ? (
                  <button
                    type="button"
                    className="icon-btn late-delete-code"
                    onClick={() => onDeleteCode(group, item)}
                    title={t('late.deleteCodeButton')}
                    aria-label={t('late.deleteCodeButton')}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="late-code-row"
                  onClick={() => onOpenCode(group, item)}
                  aria-label={item.code}
                >
                  <span className="mono">{item.code}</span>
                  <span className="late-code-meta">
                    {item.sourceName ? <span className="late-code-source">{item.sourceName}</span> : null}
                    <span>{formatDate(item.at, lang)}</span>
                    <Badge tone="danger">{t('late.days', { count: item.days })}</Badge>
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn late-copy-code"
                  onClick={() => onCopy([item])}
                  title={t('late.copyCode')}
                  aria-label={t('late.copyCode')}
                >
                  <Copy size={14} />
                </button>
              </li>
            ))}
          </ul>
          {group.codes.length > limit ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm late-load-more"
              onClick={() => setLimit((current) => current + CODE_PAGE_SIZE)}
            >
              {t('late.loadMore', { count: group.codes.length - limit })}
            </button>
          ) : null}
          </>
        ) : (
          <p className="late-merged-empty">{t('late.mergedNoLateCodes')}</p>
        )
      ) : null}
    </article>
  )
}

function whatsappLink(phone: string | undefined, text: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const intl = digits.startsWith('0') ? `${COUNTRY_CODE}${digits.slice(1)}` : digits
  const query = `text=${encodeURIComponent(text)}`
  return intl ? `https://wa.me/${intl}?${query}` : `https://wa.me/?${query}`
}

export function LateCodesPage() {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const blacklist = useStore((state) => state.blacklist)
  const lateDays = useStore((state) => state.settings.lateDays)

  const [tick, setTick] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<CodeHit | null>(null)
  const [requestedCodes, setRequestedCodes] = useState(() => loadRequestedCodes())
  const [query, setQuery] = useState('')
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(() => new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
  const [savedMerges, setSavedMerges] = useState<LateMerge[]>(() => loadLateMerges())
  const [mergeDialog, setMergeDialog] = useState<{
    id?: string
    name: string
    sourceNames: string[]
  } | null>(null)
  const [removeMergeId, setRemoveMergeId] = useState<string | null>(null)
  const [addSourcesMergeId, setAddSourcesMergeId] = useState<string | null>(null)
  const [selectedAdditionalSources, setSelectedAdditionalSources] = useState<Set<string>>(() => new Set())
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: 'code'; group: LateGroup; code: LateCode }
    | { type: 'group'; group: LateGroup }
    | null
  >(null)

  useEffect(() => {
    const handler = () => setTick((value) => value + 1)
    const reloadRequested = () => setRequestedCodes(loadRequestedCodes())
    const reloadMerges = () => setSavedMerges(loadLateMerges())
    window.addEventListener('rsp.flow', handler)
    window.addEventListener('rsp.colis-demande', reloadRequested)
    window.addEventListener('rsp.late-merges', reloadMerges)
    window.addEventListener('storage', reloadRequested)
    window.addEventListener('storage', reloadMerges)
    return () => {
      window.removeEventListener('rsp.flow', handler)
      window.removeEventListener('rsp.colis-demande', reloadRequested)
      window.removeEventListener('rsp.late-merges', reloadMerges)
      window.removeEventListener('storage', reloadRequested)
      window.removeEventListener('storage', reloadMerges)
    }
  }, [])

  const flow = useMemo<FlowDistributor[]>(() => loadFlowDistributors(), [tick])
  // When ColisFlow last published on this browser; null means it never did.
  const publishedAt = useMemo(() => loadFlowPublishedAt(), [tick])
  const requestedSet = useMemo(
    () => new Set(requestedCodes.map((item) => item.code.toUpperCase())),
    [requestedCodes],
  )

  const statusOf = useMemo(() => {
    const listNames = new Map(lists.map((list) => [list.id, list.name]))
    const index = buildReturnIndex({ parcels, registry, blacklist, listNames })
    const map = new Map<string, ReturnStatus>()
    for (const entry of index) map.set(entry.code.toUpperCase(), entry.status)
    return map
  }, [lists, parcels, registry, blacklist])

  const groups = useMemo<LateGroup[]>(() => {
    const now = Date.now()

    // Codes already resolved: returned to us, scanned into the Entrepôt, or
    // moved to one of the permanent routeur lists.
    const done = new Set<string>()
    for (const parcel of parcels) {
      if (parcel.status === 'returned') done.add(parcel.code.toUpperCase())
    }
    for (const entry of registry) done.add(entry.code.toUpperCase())
    for (const item of flow) {
      if (!isFixedDistributor(item)) continue
      for (const code of item.codes) done.add(code.toUpperCase())
    }

    const result: LateGroup[] = []
    for (const item of flow) {
      // Archived distributors still count: only permanent routeur lists are
      // excluded from late-code notices.
      if (isFixedDistributor(item)) continue
      const dates = item.dates ?? []
      const since = item.since ?? []
      const late: LateCode[] = []
      item.codes.forEach((code, index) => {
        const key = code.toUpperCase()
        // A ColisFlow parcel only counts as late when the operator has also
        // added it to the independent Colis Demandé list in this app.
        if (!requestedSet.has(key)) return
        if (done.has(key)) return
        const at = dates[index]
        // The late count runs from the move date when the code was moved;
        // without a move it falls back to the original scan date.
        const from = since[index] || at
        if (!from) return
        const stamp = Date.parse(from)
        if (Number.isNaN(stamp)) return
        const days = Math.floor((now - stamp) / DAY_MS)
        // One full day with the distributor already counts as late.
        if (days < lateDays) return
        late.push({ code, at: at || from, days })
      })
      if (!late.length) continue
      late.sort((a, b) => a.at.localeCompare(b.at))
      result.push({
        id: item.name.trim().toLocaleLowerCase(),
        name: item.name,
        phone: item.phone,
        codes: late,
      })
    }

    // Order the distributors by the first letters of their name.
    result.sort((a, b) => a.name.localeCompare(b.name, lang === 'ar' ? 'ar' : 'fr'))
    return result
  }, [flow, parcels, registry, lang, lateDays, requestedSet])

  const total = useMemo(
    () => groups.reduce((sum, group) => sum + group.codes.length, 0),
    [groups],
  )
  const senditTotal = useMemo(
    () => new Set(groups.flatMap((group) => group.codes.map((item) => item.code.toUpperCase()).filter(isSenditCode)).values()).size,
    [groups],
  )

  const mergedSourceNames = useMemo(
    () => new Set(savedMerges.flatMap((merge) => merge.sourceNames.map((name) => name.trim().toLocaleLowerCase()))),
    [savedMerges],
  )
  const unmergedGroups = useMemo(
    () => groups.filter((group) => !mergedSourceNames.has(group.id)),
    [groups, mergedSourceNames],
  )
  const needle = query.trim().toLocaleLowerCase()
  const visibleGroups = useMemo(() => {
    if (!needle) return unmergedGroups
    return unmergedGroups.flatMap((group) => {
      const nameMatches = group.name.toLocaleLowerCase().includes(needle)
      const codes = nameMatches
        ? group.codes
        : group.codes.filter((item) => item.code.toLocaleLowerCase().includes(needle))
      return nameMatches || codes.length ? [{ ...group, codes }] : []
    })
  }, [unmergedGroups, needle])
  const mergedGroups = useMemo<LateGroup[]>(() => savedMerges.map((merge) => {
    const sources = new Set(merge.sourceNames.map((name) => name.trim().toLocaleLowerCase()))
    const byCode = new Map<string, LateCode>()
    for (const group of groups) {
      if (!sources.has(group.id)) continue
      for (const code of group.codes) {
        const key = code.code.toUpperCase()
        if (!byCode.has(key)) byCode.set(key, { ...code, sourceName: group.name })
      }
    }
    return { id: merge.id, name: merge.name, codes: Array.from(byCode.values()) }
  }), [groups, savedMerges])
  const visibleMergedGroups = useMemo(() => mergedGroups.flatMap((group) => {
    if (!needle) return [group]
    const nameMatches = group.name.toLocaleLowerCase().includes(needle)
    const codes = nameMatches
      ? group.codes
      : group.codes.filter((item) => item.code.toLocaleLowerCase().includes(needle))
    return nameMatches || codes.length ? [{ ...group, codes }] : []
  }), [mergedGroups, needle])
  const mergedIds = useMemo(() => new Set(savedMerges.map((merge) => merge.id)), [savedMerges])
  const pageGroups = [...visibleMergedGroups, ...visibleGroups]
  const addSourcesMerge = savedMerges.find((merge) => merge.id === addSourcesMergeId) ?? null
  const existingSourceNames = new Set(
    (addSourcesMerge?.sourceNames ?? []).map((name) => name.trim().toLocaleLowerCase()),
  )
  const addableGroups = groups.filter((group) => !existingSourceNames.has(group.id))
  const selectedVisible = visibleGroups.filter((group) => selectedGroups.has(group.id))
  const allVisibleSelected =
    visibleGroups.length > 0 && selectedVisible.length === visibleGroups.length
  const allVisibleExpanded =
    pageGroups.length > 0 && pageGroups.every((group) => expandedGroups.has(group.id))

  const toggleSelectedGroups = () => {
    setSelectedGroups((current) => {
      const next = new Set(current)
      if (allVisibleSelected) visibleGroups.forEach((group) => next.delete(group.id))
      else visibleGroups.forEach((group) => next.add(group.id))
      return next
    })
  }

  const toggleExpandedGroups = () => {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (allVisibleExpanded) pageGroups.forEach((group) => next.delete(group.id))
      else pageGroups.forEach((group) => next.add(group.id))
      return next
    })
  }

  const copyCodes = async (items: LateCode[]) => {
    if (!items.length) return
    try {
      await copyText(items.map((item) => item.code).join('\n'))
      toast(t('late.copied', { count: items.length }), 'success')
    } catch {
      toast(t('late.copyFailed'), 'error')
    }
  }

  const mergeSelectedLists = () => {
    const selectedInOrder = Array.from(selectedGroups)
      .map((id) => visibleGroups.find((group) => group.id === id))
      .filter((group): group is LateGroup => Boolean(group))
    if (selectedInOrder.length < 2) return
    setMergeDialog({
      name: selectedInOrder[0].name,
      sourceNames: selectedInOrder.map((group) => group.name),
    })
  }

  const editMergeName = (merge: LateMerge) => {
    setMergeDialog({ id: merge.id, name: merge.name, sourceNames: merge.sourceNames })
  }

  const addSourcesToMerge = () => {
    if (!addSourcesMergeId || !selectedAdditionalSources.size) return
    const merge = savedMerges.find((item) => item.id === addSourcesMergeId)
    if (!merge) return
    const additions = groups.filter((group) => selectedAdditionalSources.has(group.id))
    if (!additions.length) return
    const nextSourceNames = Array.from(new Set([
      ...merge.sourceNames,
      ...additions.map((group) => group.name),
    ]))
    const next = savedMerges.map((item) => item.id === merge.id
      ? { ...item, sourceNames: nextSourceNames }
      : item)
    try {
      saveLateMerges(next)
      setSavedMerges(next)
      setSelectedGroups(new Set())
      setSelectedAdditionalSources(new Set())
      setAddSourcesMergeId(null)
      toast(t('late.listsAdded', { count: additions.length }), 'success')
    } catch {
      toast(t('late.mergeSaveFailed'), 'error')
    }
  }

  const saveMerge = () => {
    if (!mergeDialog || !mergeDialog.name.trim()) return
    const existing = mergeDialog.id
      ? savedMerges.find((item) => item.id === mergeDialog.id)
      : undefined
    if (mergeDialog.id && !existing) {
      setMergeDialog(null)
      return
    }
    const nextMerge = existing
      ? { ...existing, name: mergeDialog.name.trim() }
      : createLateMerge(mergeDialog.name, mergeDialog.sourceNames)
    const next = mergeDialog.id
      ? savedMerges.map((item) => item.id === mergeDialog.id ? nextMerge : item)
      : [...savedMerges, nextMerge]
    try {
      saveLateMerges(next)
      setSavedMerges(next)
      if (!mergeDialog.id) {
        setSelectedGroups(new Set())
        setExpandedGroups((current) => new Set([...current, nextMerge.id]))
      }
      toast(t(existing ? 'late.mergeRenamed' : 'late.mergeSaved'), 'success')
      setMergeDialog(null)
    } catch {
      toast(t('late.mergeSaveFailed'), 'error')
    }
  }

  const removeSavedMerge = () => {
    if (!removeMergeId) return
    const next = savedMerges.filter((item) => item.id !== removeMergeId)
    try {
      saveLateMerges(next)
      setSavedMerges(next)
      setExpandedGroups((current) => {
        const nextExpanded = new Set(current)
        nextExpanded.delete(removeMergeId)
        return nextExpanded
      })
      toast(t('late.mergeRemoved'), 'success')
      setRemoveMergeId(null)
    } catch {
      toast(t('late.mergeSaveFailed'), 'error')
    }
  }

  const confirmDeleteFromDemand = () => {
    if (!deleteTarget) return
    const removed = new Set(
      deleteTarget.type === 'code'
        ? [deleteTarget.code.code.toUpperCase()]
        : deleteTarget.group.codes.map((item) => item.code.toUpperCase()),
    )
    const next = requestedCodes.filter((item) => !removed.has(item.code.toUpperCase()))
    try {
      saveRequestedCodes(next)
      setRequestedCodes(next)
      if (deleteTarget.type === 'group') {
        setSelectedGroups((current) => {
          const nextSelection = new Set(current)
          nextSelection.delete(deleteTarget.group.id)
          return nextSelection
        })
      }
      toast(t('late.deletedFromDemand', { count: requestedCodes.length - next.length }), 'success')
      setDeleteTarget(null)
    } catch {
      toast(t('demande.saveFailed'), 'error')
    }
  }

  const deleteMessage = deleteTarget?.type === 'group'
    ? t('late.deleteGroupMsg', {
        name: deleteTarget.group.name,
        count: deleteTarget.group.codes.length,
      })
    : deleteTarget?.type === 'code'
      ? t('late.deleteCodeMsg', { code: deleteTarget.code.code })
      : ''

  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const state = useStore.getState()
      await syncFlow(() => ({
        parcels: state.parcels,
        registry: state.registry,
        blacklist: state.blacklist,
        listNames: new Map(state.lists.map((list) => [list.id, list.name])),
      }))
    } finally {
      setRefreshing(false)
      setTick((value) => value + 1)
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={t('late.title')}
        subtitle={
          flow.length
            ? t('late.summary', { count: total, distributors: groups.length })
            : t('late.subtitle')
        }
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={cx(refreshing && 'spin')} />
            {t('fixed.refresh')}
          </button>
        }
      />
      <p className="late-demand-hint">{t('late.demandHint')}</p>
      <div className="stats-grid late-stats">
        <StatCard
          icon={Boxes}
          label={t('late.totalLabel')}
          value={formatNumber(total, lang)}
          tone="accent"
        />
        <StatCard
          icon={Truck}
          label={t('late.senditLabel')}
          value={formatNumber(senditTotal, lang)}
          hint="DH · DXH · DSH"
          tone="info"
        />
      </div>

      {!flow.length && !savedMerges.length ? (
        <EmptyState
          icon={Boxes}
          title={t('late.linkTitle')}
          text={
            publishedAt
              ? t('late.linkSeen', { when: relativeTime(publishedAt, lang) })
              : t('late.linkNever')
          }
        />
      ) : (
        <>
          {!flow.length ? (
            <EmptyState
              icon={Boxes}
              title={t('late.linkTitle')}
              text={publishedAt ? t('late.linkSeen', { when: relativeTime(publishedAt, lang) }) : t('late.linkNever')}
            />
          ) : null}

          {!groups.length && !savedMerges.length ? (
            <EmptyState icon={Inbox} title={t('late.empty')} text={t('late.emptyText')} />
          ) : (
            <>
          <div className="late-toolbar">
            <SearchField value={query} onChange={setQuery} placeholder={t('late.search')} />
            <div className="late-toolbar-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={toggleExpandedGroups}
                disabled={!pageGroups.length}
              >
                <ChevronDown size={15} className={cx(allVisibleExpanded && 'is-rotated')} />
                {allVisibleExpanded ? t('late.collapseAll') : t('late.expandAll')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={toggleSelectedGroups}
                disabled={!visibleGroups.length}
              >
                {allVisibleSelected ? <Square size={15} /> : <CheckSquare size={15} />}
                {allVisibleSelected ? t('late.deselectAll') : t('late.selectAll')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void copyCodes(selectedVisible.flatMap((group) => group.codes))}
                disabled={!selectedVisible.length}
              >
                <Copy size={15} /> {t('late.copySelected')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={mergeSelectedLists}
                disabled={selectedVisible.length < 2}
              >
                <ListChecks size={15} /> {t('late.mergeSelected')}
              </button>
            </div>
            <small className="late-merge-hint">{t('late.mergeHint')}</small>
          </div>

          {pageGroups.length ? (
            <div className="late-grid">
              {pageGroups.map((group) => {
                const virtual = mergedIds.has(group.id)
                return (
                  <LateGroupCard
                    key={group.id}
                    group={group}
                    checked={!virtual && selectedGroups.has(group.id)}
                    expanded={expandedGroups.has(group.id)}
                    onSelect={() => {
                      if (virtual) return
                      setSelectedGroups((current) => {
                        const next = new Set(current)
                        if (next.has(group.id)) next.delete(group.id)
                        else next.add(group.id)
                        return next
                      })
                    }}
                    onToggle={() => {
                      setExpandedGroups((current) => {
                        const next = new Set(current)
                        if (next.has(group.id)) next.delete(group.id)
                        else next.add(group.id)
                        return next
                      })
                    }}
                    onOpenCode={(target, code) =>
                      setSelected({
                        code: code.code,
                        listName: code.sourceName || target.name,
                        date: code.at,
                        archived: false,
                        inEntrepot: false,
                      })
                    }
                    onCopy={(items) => void copyCodes(items)}
                    onDeleteCode={(target, code) => setDeleteTarget({ type: 'code', group: target, code })}
                    onDeleteGroup={(target) => setDeleteTarget({ type: 'group', group: target })}
                    virtual={virtual}
                    onRemoveVirtual={() => setRemoveMergeId(group.id)}
                    onAddSources={() => {
                      setSelectedAdditionalSources(new Set())
                      setAddSourcesMergeId(group.id)
                    }}
                    onRenameVirtual={() => {
                      const merge = savedMerges.find((item) => item.id === group.id)
                      if (merge) editMergeName(merge)
                    }}
                  />
                )
              })}
            </div>
          ) : (
            <EmptyState icon={Inbox} title={t('late.searchEmpty')} text={t('late.searchEmptyText')} />
          )}
            </>
          )}
        </>
      )}

      <CodeRecordModal hit={selected} statusOf={statusOf} onClose={() => setSelected(null)} />
      <Modal
        open={mergeDialog !== null}
        title={t(mergeDialog?.id ? 'late.renameMergeTitle' : 'late.nameMergeTitle')}
        onClose={() => setMergeDialog(null)}
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setMergeDialog(null)}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveMerge}
              disabled={!mergeDialog?.name.trim()}
            >
              {t('late.saveMerge')}
            </button>
          </>
        )}
      >
        <div className="field">
          <label className="field-label" htmlFor="late-merge-name">{t('late.mergeNameLabel')}</label>
          <input
            id="late-merge-name"
            className="input"
            value={mergeDialog?.name ?? ''}
            onChange={(event) => setMergeDialog((current) => current ? { ...current, name: event.target.value } : current)}
            maxLength={80}
            autoFocus
          />
        </div>
      </Modal>
      <Modal
        open={addSourcesMerge !== null}
        title={t('late.addListsTitle', { name: addSourcesMerge?.name ?? '' })}
        onClose={() => setAddSourcesMergeId(null)}
        size="sm"
        footer={(
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setAddSourcesMergeId(null)}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={addSourcesToMerge}
              disabled={!selectedAdditionalSources.size}
            >
              {t('late.addSelectedLists')}
            </button>
          </>
        )}
      >
        {addableGroups.length ? (
          <div className="late-add-source-list">
            {addableGroups.map((group) => (
              <label className="late-add-source-option" key={group.id}>
                <input
                  type="checkbox"
                  checked={selectedAdditionalSources.has(group.id)}
                  onChange={() => setSelectedAdditionalSources((current) => {
                    const next = new Set(current)
                    if (next.has(group.id)) next.delete(group.id)
                    else next.add(group.id)
                    return next
                  })}
                />
                <span>{group.name}</span>
                <Badge tone="danger">{t('fixed.codes', { count: group.codes.length })}</Badge>
              </label>
            ))}
          </div>
        ) : (
          <EmptyState icon={Inbox} title={t('late.noMoreLists')} text={t('late.noMoreListsText')} />
        )}
      </Modal>
      <ConfirmDialog
        open={removeMergeId !== null}
        title={t('late.removeMergeTitle')}
        message={t('late.removeMergeText', { name: savedMerges.find((item) => item.id === removeMergeId)?.name ?? '' })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={removeSavedMerge}
        onClose={() => setRemoveMergeId(null)}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        title={t(deleteTarget?.type === 'group' ? 'late.deleteGroupTitle' : 'late.deleteCodeTitle')}
        message={deleteMessage}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={confirmDeleteFromDemand}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
