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
  RefreshCw,
  Square,
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
import { loadRequestedCodes } from '../lib/colisDemande'
import { cx, formatDate, relativeTime } from '../lib/utils'
import { Badge, EmptyState, PageHeader, SearchField } from '../components/ui'
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
/** Local numbers (06…) are turned into international form for wa.me. */
const COUNTRY_CODE = '212'

interface LateCode {
  code: string
  at: string
  days: number
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
}: {
  group: LateGroup
  checked: boolean
  expanded: boolean
  onSelect: () => void
  onToggle: () => void
  onOpenCode: (group: LateGroup, code: LateCode) => void
  onCopy: (codes: LateCode[]) => void
}) {
  const { t, lang } = useI18n()
  const [limit, setLimit] = useState(CODE_PAGE_SIZE)

  useEffect(() => setLimit(CODE_PAGE_SIZE), [group.id, group.codes.length])

  const header = t('late.waHeader', { name: group.name, count: group.codes.length })
  const lines = group.codes.map((item) => `• ${item.code} — ${formatDate(item.at, lang)}`)
  const message = [header, '', ...lines, '', t('late.waFooter')].join('\n')

  return (
    <article className={cx('late-card', !expanded && 'is-collapsed')}>
      <header className="late-card-head">
        <label className="late-group-check" title={t('late.selectGroup', { name: group.name })}>
          <input type="checkbox" checked={checked} onChange={onSelect} />
        </label>
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
        <Badge tone="danger">{t('fixed.codes', { count: group.codes.length })}</Badge>
        <button
          type="button"
          className="icon-btn late-copy-group"
          onClick={() => onCopy(group.codes)}
          title={t('late.copyList')}
          aria-label={t('late.copyList')}
        >
          <Copy size={15} />
        </button>
        <a
          className="btn btn-primary btn-sm late-wa"
          href={whatsappLink(group.phone, message)}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={16} />
          {t('late.whatsapp')}
        </a>
      </header>

      {expanded ? (
        <>
          <ul className="late-codes">
            {group.codes.slice(0, limit).map((item) => (
              <li className="late-code-item" key={item.code}>
                <button
                  type="button"
                  className="late-code-row"
                  onClick={() => onOpenCode(group, item)}
                  aria-label={item.code}
                >
                  <span className="mono">{item.code}</span>
                  <span className="late-code-meta">
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

  useEffect(() => {
    const handler = () => setTick((value) => value + 1)
    const reloadRequested = () => setRequestedCodes(loadRequestedCodes())
    window.addEventListener('rsp.flow', handler)
    window.addEventListener('rsp.colis-demande', reloadRequested)
    window.addEventListener('storage', reloadRequested)
    return () => {
      window.removeEventListener('rsp.flow', handler)
      window.removeEventListener('rsp.colis-demande', reloadRequested)
      window.removeEventListener('storage', reloadRequested)
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

  const needle = query.trim().toLocaleLowerCase()
  const visibleGroups = useMemo(() => {
    if (!needle) return groups
    return groups.flatMap((group) => {
      const nameMatches = group.name.toLocaleLowerCase().includes(needle)
      const codes = nameMatches
        ? group.codes
        : group.codes.filter((item) => item.code.toLocaleLowerCase().includes(needle))
      return nameMatches || codes.length ? [{ ...group, codes }] : []
    })
  }, [groups, needle])
  const selectedVisible = visibleGroups.filter((group) => selectedGroups.has(group.id))
  const allVisibleSelected =
    visibleGroups.length > 0 && selectedVisible.length === visibleGroups.length
  const allVisibleExpanded =
    visibleGroups.length > 0 && visibleGroups.every((group) => expandedGroups.has(group.id))

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
      if (allVisibleExpanded) visibleGroups.forEach((group) => next.delete(group.id))
      else visibleGroups.forEach((group) => next.add(group.id))
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

  const mergeSelectedForWhatsApp = () => {
    if (!selectedVisible.length) return
    const byCode = new Map<string, { code: LateCode; groupName: string }>()
    for (const group of selectedVisible) {
      for (const code of group.codes) {
        const key = code.code.toUpperCase()
        if (!byCode.has(key)) byCode.set(key, { code, groupName: group.name })
      }
    }
    const entries = Array.from(byCode.values())
    const header = t('late.waMergedHeader', {
      count: entries.length,
      groups: selectedVisible.length,
    })
    const lines = entries.map(
      ({ code, groupName }) => `• ${code.code} — ${formatDate(code.at, lang)} (${groupName})`,
    )
    const message = [header, '', ...lines, '', t('late.waFooter')].join('\n')
    window.open(whatsappLink(undefined, message), '_blank', 'noopener,noreferrer')
  }

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

      {!flow.length ? (
        <EmptyState
          icon={Boxes}
          title={t('late.linkTitle')}
          text={
            publishedAt
              ? t('late.linkSeen', { when: relativeTime(publishedAt, lang) })
              : t('late.linkNever')
          }
        />
      ) : !groups.length ? (
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
                disabled={!visibleGroups.length}
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
                onClick={mergeSelectedForWhatsApp}
                disabled={!selectedVisible.length}
              >
                <ListChecks size={15} /> {t('late.mergeSelected')}
              </button>
            </div>
            <small className="late-merge-hint">{t('late.mergeHint')}</small>
          </div>

          {visibleGroups.length ? (
            <div className="late-grid">
              {visibleGroups.map((group) => (
                <LateGroupCard
                  key={group.id}
                  group={group}
                  checked={selectedGroups.has(group.id)}
                  expanded={expandedGroups.has(group.id)}
                  onSelect={() => {
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
                      listName: target.name,
                      date: code.at,
                      archived: false,
                      inEntrepot: false,
                    })
                  }
                  onCopy={(items) => void copyCodes(items)}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon={Inbox} title={t('late.searchEmpty')} text={t('late.searchEmptyText')} />
          )}
        </>
      )}

      <CodeRecordModal hit={selected} statusOf={statusOf} onClose={() => setSelected(null)} />
    </div>
  )
}
