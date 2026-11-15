import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  Inbox,
  RefreshCw,
  Truck,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import type { ScannedCode } from '../types'
import { useI18n } from '../i18n'
import {
  buildReturnIndex,
  loadFlowDistributors,
  loadFlowPublishedAt,
  pullFlowDistributors,
  type FlowDistributor,
  type ReturnStatus,
} from '../lib/flowLink'
import {
  fixedSlotFor,
  FIXED_LISTS,
  isFixedDistributor,
  normalizeFixedName,
} from '../lib/fixedLists'
import { cx, formatDateTime, relativeTime } from '../lib/utils'
import { Badge, EmptyState, PageHeader, SearchField, StatCard } from '../components/ui'
import { toast } from '../components/Toast'
import { CodeRecordModal, STATUS_KEYS, STATUS_TONES, type CodeHit } from '../components/CodeRecord'

const PER_LIST_CAP = 80
const RESULT_CAP = 200
interface RouteurCardData {
  id: string
  name: string
  codes: string[]
  archived: boolean
}

function CodeRows({
  codes,
  dates,
  statusOf,
  registryOf,
  listOf,
  archivedOf,
  onOpenCode,
}: {
  codes: string[]
  dates: Map<string, string>
  statusOf: Map<string, ReturnStatus>
  registryOf: Map<string, ScannedCode>
  listOf?: Map<string, string>
  archivedOf?: Set<string>
  onOpenCode: (code: string) => void
}) {
  const { t, lang } = useI18n()

  return (
    <ul className="fixed-codes">
      {codes.map((code) => {
        const key = code.toUpperCase()
        const status = statusOf.get(key)
        const date = dates.get(key)
        const inWarehouse = registryOf.has(key)
        const listName = listOf?.get(key)
        const archived = archivedOf?.has(key) ?? false
        return (
          <li key={code}>
            <button
              type="button"
              className="fixed-code-row"
              onClick={() => onOpenCode(code)}
              aria-label={code}
            >
              <span className="fixed-code-main">
                <strong className="mono">{code}</strong>
                <span className="fixed-code-meta">
                  {listName ? <span>{listName}</span> : null}
                  {archived ? <Badge tone="muted">{t('status.archived')}</Badge> : null}
                  {date ? <><CalendarDays size={12} /> {formatDateTime(date, lang)}</> : '—'}
                </span>
              </span>
              <span className="fixed-code-badges">
                {inWarehouse ? <Badge tone="info">{t('fixed.inEntrepot')}</Badge> : null}
                {status ? (
                  <Badge tone={STATUS_TONES[status]}>{t(STATUS_KEYS[status])}</Badge>
                ) : (
                  <Badge tone="muted">{t('fixed.noStatus')}</Badge>
                )}
                <ChevronRight size={15} className="fixed-result-chevron" />
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function DistributorCard({
  card,
  fixed,
  dates,
  statusOf,
  registryOf,
  query,
  onOpenCode,
}: {
  card: RouteurCardData
  fixed: boolean
  dates: Map<string, string>
  statusOf: Map<string, ReturnStatus>
  registryOf: Map<string, ScannedCode>
  query: string
  onOpenCode: (code: string, listName: string) => void
}) {
  const { t } = useI18n()
  const [limit, setLimit] = useState(PER_LIST_CAP)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setLimit(PER_LIST_CAP)
    setOpen(Boolean(query))
  }, [query, card.id])

  const visible = card.codes.slice(0, limit)

  return (
    <article className={cx('fixed-card', open && 'is-open', card.archived && 'is-archived')}>
      <button
        type="button"
        className="fixed-card-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={cx('fixed-card-icon', !fixed && 'is-other')}>
          {fixed ? <Truck size={17} /> : <Boxes size={17} />}
        </span>
        <span className="fixed-card-name">{card.name}</span>
        {card.archived ? <Badge tone="muted">{t('status.archived')}</Badge> : null}
        <Badge tone={card.codes.length ? 'accent' : 'muted'}>
          {t('fixed.codes', { count: card.codes.length })}
        </Badge>
        <ChevronDown size={17} className="fixed-chevron" />
      </button>

      {open ? (
        card.codes.length ? (
          <>
            <CodeRows
              codes={visible}
              dates={dates}
              statusOf={statusOf}
              registryOf={registryOf}
              onOpenCode={(code) => onOpenCode(code, card.name)}
            />
            {card.codes.length > limit ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm fixed-more"
                onClick={() => setLimit((value) => value + PER_LIST_CAP)}
              >
                {t('fixed.loadMore', { count: card.codes.length - limit })}
              </button>
            ) : null}
          </>
        ) : (
          <p className="fixed-empty">{t('fixed.emptyList')}</p>
        )
      ) : null}
    </article>
  )
}

/**
 * Routeurs page: the six permanent ColisFlow routeur lists plus any other
 * distributor list, filled straight from ColisFlow's shared link.
 *
 * Import works two ways: a manual button (tap to pull right now) and an
 * automatic background refresh (the shared link's `rsp.flow` event, plus a
 * light poll), so the lists appear on their own without any tap.
 */
export function FixedListsPage() {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const blacklist = useStore((state) => state.blacklist)

  const [tick, setTick] = useState(0)
  const [importing, setImporting] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CodeHit | null>(null)

  const busy = useRef(false)

  // Instant refresh whenever the shared link publishes something new.
  useEffect(() => {
    const handler = () => setTick((value) => value + 1)
    window.addEventListener('rsp.flow', handler)
    return () => window.removeEventListener('rsp.flow', handler)
  }, [])

  const flow = useMemo<FlowDistributor[]>(() => loadFlowDistributors(), [tick])
  const publishedAt = useMemo(() => loadFlowPublishedAt(), [tick])
  const fixedFlow = useMemo(() => flow.filter(isFixedDistributor), [flow])
  const flowByName = useMemo(
    () => new Map(flow.map((item) => [item.name.trim().toLowerCase(), item])),
    [flow],
  )
  const needle = query.trim().toLocaleLowerCase()
  const linked = flow.length > 0 || publishedAt !== null

  const statusOf = useMemo(() => {
    const listNames = new Map(lists.map((list) => [list.id, list.name]))
    const index = buildReturnIndex({ parcels, registry, blacklist, listNames })
    return new Map(index.map((entry) => [entry.code.toUpperCase(), entry.status]))
  }, [lists, parcels, registry, blacklist])

  const dateOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of flow) {
      const dates = item.dates ?? []
      item.codes.forEach((code, index) => {
        const key = code.toUpperCase()
        if (!map.has(key)) map.set(key, dates[index] || item.date || '')
      })
    }
    return map
  }, [flow])

  const registryOf = useMemo(() => {
    const map = new Map<string, ScannedCode>()
    for (const entry of registry) {
      const key = entry.code.trim().toUpperCase()
      if (key && !map.has(key)) map.set(key, entry)
    }
    return map
  }, [registry])

  const results = useMemo<CodeHit[]>(() => {
    if (!needle) return []
    const hits: CodeHit[] = []
    const seen = new Set<string>()
    for (const item of flow) {
      for (const code of item.codes) {
        const key = code.toUpperCase()
        if (seen.has(key) || !code.toLocaleLowerCase().includes(needle)) continue
        seen.add(key)
        hits.push({
          code,
          listName: item.name,
          date: dateOf.get(key) || item.date,
          archived: item.archived,
          inEntrepot: registryOf.has(key),
        })
      }
    }
    for (const [key, entry] of registryOf) {
      if (seen.has(key) || !key.toLocaleLowerCase().includes(needle)) continue
      seen.add(key)
      hits.push({ code: entry.code, date: entry.firstScanAt, archived: false, inEntrepot: true })
    }
    hits.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    return hits
  }, [flow, needle, dateOf, registryOf])

  const cards = useMemo<RouteurCardData[]>(() => {
    const matched = new Set<string>()
    const slots = FIXED_LISTS.map((fixed) => {
      const item = fixedFlow.find(
        (entry) => normalizeFixedName(entry.name) === normalizeFixedName(fixed.name),
      )
      if (item) matched.add(item.name.trim().toLowerCase())
      return {
        id: fixed.id,
        name: item?.name ?? fixed.name,
        codes: (item?.codes ?? []).filter((code) => !needle || code.toLocaleLowerCase().includes(needle)),
        archived: item?.archived ?? false,
      }
    })
    const extraFixed = fixedFlow
      .filter(
        (item) =>
          !matched.has(item.name.trim().toLowerCase()) && !fixedSlotFor(item.name),
      )
      .map((item) => ({
        id: `fixed-${item.name.toLowerCase()}`,
        name: item.name,
        codes: item.codes.filter((code) => !needle || code.toLocaleLowerCase().includes(needle)),
        archived: item.archived,
      }))
    return [...slots, ...extraFixed]
  }, [fixedFlow, needle])

  const otherCards = useMemo<RouteurCardData[]>(
    () =>
      flow
        .filter((item) => !isFixedDistributor(item))
        .map((item) => ({
          id: `other-${item.name.toLowerCase()}`,
          name: item.name,
          codes: item.codes.filter((code) => !needle || code.toLocaleLowerCase().includes(needle)),
          archived: item.archived,
        })),
    [flow, needle],
  )

  const totalCodes = useMemo(
    () => flow.reduce((sum, item) => sum + item.codes.length, 0),
    [flow],
  )
  const routeurCodes = useMemo(
    () => fixedFlow.reduce((sum, item) => sum + item.codes.length, 0),
    [fixedFlow],
  )
  const otherCodes = useMemo(
    () => otherCards.reduce((sum, card) => sum + card.codes.length, 0),
    [otherCards],
  )
  const populatedRouteurs = cards.filter((card) => card.codes.length > 0).length

  const openRecord = (code: string, listName?: string) => {
    const item = listName ? flowByName.get(listName.trim().toLowerCase()) : undefined
    setSelected({
      code,
      listName,
      date: dateOf.get(code.toUpperCase()) || item?.date,
      archived: item?.archived ?? false,
      inEntrepot: registryOf.has(code.toUpperCase()),
    })
  }

  /** Manual import: pulls ColisFlow's lists right now and reports the result. */
  const importNow = async () => {
    if (busy.current) return
    busy.current = true
    setImporting(true)
    try {
      const list = await pullFlowDistributors()
      const codes = list.reduce((sum, item) => sum + item.codes.length, 0)
      if (list.length) {
        toast(t('fixed.imported', { lists: list.length, codes }), 'success')
      } else {
        toast(t('fixed.importEmpty'), 'warning')
      }
    } catch (error) {
      console.warn('routeur import failed:', error)
      toast(t('fixed.importFailed'), 'error')
    } finally {
      busy.current = false
      setImporting(false)
      setTick((value) => value + 1)
    }
  }

  return (
    <div className="page fixed-page">
      <PageHeader
        title={t('fixed.title')}
        subtitle={linked ? t('fixed.total', { count: totalCodes }) : t('fixed.subtitle')}
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void importNow()}
            disabled={importing}
          >
            {importing ? (
              <RefreshCw size={16} className="spin" />
            ) : (
              <Download size={16} />
            )}
            {importing ? t('fixed.importing') : t('fixed.import')}
          </button>
        }
      />

      <div className={cx('fixed-link', linked && 'is-linked')}>
        <span className="fixed-sync-dot" aria-hidden="true" />
        <div className="fixed-link-text">
          <strong>{linked ? t('fixed.linked') : t('fixed.notLinkedShort')}</strong>
          <small>
            {publishedAt
              ? t('fixed.lastSync', { when: relativeTime(publishedAt, lang) })
              : t('fixed.syncWaiting')}
          </small>
        </div>
      </div>
      <p className="fixed-auto-hint">{t('fixed.autoHint')}</p>

      {linked ? (
        <>
          <div className="stats-grid fixed-overview">
            <StatCard
              icon={Truck}
              label={t('fixed.routeurGroups')}
              value={`${populatedRouteurs}/${cards.length}`}
              hint={t('fixed.routeurCodes', { count: routeurCodes })}
              tone="accent"
            />
            <StatCard
              icon={Boxes}
              label={t('fixed.otherGroups')}
              value={otherCards.length}
              hint={t('fixed.otherCodes', { count: otherCodes })}
              tone="info"
            />
          </div>

          <div className="fixed-toolbar">
            <SearchField value={query} onChange={setQuery} placeholder={t('fixed.search')} />
            {needle ? (
              <span className="fixed-search-count">
                {t('fixed.searchCount', { count: results.length })}
              </span>
            ) : null}
          </div>

          {needle ? (
            results.length ? (
              <section className="fixed-section">
                <div className="fixed-section-heading">
                  <div>
                    <h2>{t('fixed.searchResults')}</h2>
                    <p>{t('fixed.searchCount', { count: results.length })}</p>
                  </div>
                </div>
                <article className="fixed-card fixed-search-card">
                  <CodeRows
                    codes={results.slice(0, RESULT_CAP).map((hit) => hit.code)}
                    dates={new Map(results.map((hit) => [hit.code.toUpperCase(), hit.date ?? '']))}
                    listOf={new Map(results.map((hit) => [hit.code.toUpperCase(), hit.listName ?? '']))}
                    archivedOf={new Set(results.filter((hit) => hit.archived).map((hit) => hit.code.toUpperCase()))}
                    statusOf={statusOf}
                    registryOf={registryOf}
                    onOpenCode={(code) => {
                      const hit = results.find((result) => result.code === code)
                      if (hit) setSelected(hit)
                    }}
                  />
                  {results.length > RESULT_CAP ? (
                    <p className="fixed-empty">
                      {t('fixed.more', { count: results.length - RESULT_CAP })}
                    </p>
                  ) : null}
                </article>
              </section>
            ) : (
              <EmptyState icon={Inbox} title={t('fixed.noMatch')} text={t('fixed.noMatchText')} />
            )
          ) : (
            <>
              <section className="fixed-section">
                <div className="fixed-section-heading">
                  <div>
                    <h2>{t('fixed.routeurSection')}</h2>
                    <p>{t('fixed.routeurSectionHint')}</p>
                  </div>
                  <Badge tone="accent">{t('fixed.listCount', { count: cards.length })}</Badge>
                </div>
                <div className="fixed-grid">
                  {cards.map((card) => (
                    <DistributorCard
                      key={card.id}
                      card={card}
                      fixed
                      dates={dateOf}
                      statusOf={statusOf}
                      registryOf={registryOf}
                      query={query}
                      onOpenCode={openRecord}
                    />
                  ))}
                </div>
              </section>

              {otherCards.length ? (
                <section className="fixed-section">
                  <div className="fixed-section-heading">
                    <div>
                      <h2>{t('fixed.otherSection')}</h2>
                      <p>{t('fixed.otherSectionHint', { count: otherCards.length })}</p>
                    </div>
                    <Badge tone="info">{t('fixed.codes', { count: otherCodes })}</Badge>
                  </div>
                  <div className="fixed-grid">
                    {otherCards.map((card) => (
                      <DistributorCard
                        key={card.id}
                        card={card}
                        fixed={false}
                        dates={dateOf}
                        statusOf={statusOf}
                        registryOf={registryOf}
                        query={query}
                        onOpenCode={openRecord}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </>
      ) : (
        <EmptyState
          icon={Boxes}
          title={t('fixed.notLinked')}
          text={t('fixed.notLinkedText')}
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void importNow()}
              disabled={importing}
            >
              {importing ? (
                <RefreshCw size={16} className="spin" />
              ) : (
                <Download size={16} />
              )}
              {importing ? t('fixed.importing') : t('fixed.import')}
            </button>
          }
        />
      )}

      <CodeRecordModal
        hit={selected}
        statusOf={statusOf}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
