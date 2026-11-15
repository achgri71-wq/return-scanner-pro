import { useEffect, useMemo, useState } from 'react'
import { Boxes, ChevronDown, Inbox, RefreshCw } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useI18n, type TKey } from '../i18n'
import {
  buildReturnIndex,
  loadFlowDistributors,
  syncFlow,
  type FlowDistributor,
  type ReturnStatus,
} from '../lib/flowLink'
import { FIXED_LISTS, isFixedListName } from '../lib/fixedLists'
import { cx, formatDateTime } from '../lib/utils'
import { Badge, EmptyState, PageHeader, SearchField, type Tone } from '../components/ui'

/**
 * Read-only view of the six permanent routeur lists.
 *
 * The page is isolated: it never edits anything. It simply reads the lists
 * ColisFlow publishes through the shared link and shows, for every code, the
 * return status known to this app.
 */

const PER_LIST_CAP = 80
const RESULT_CAP = 200

const STATUS_TONES: Record<ReturnStatus, Tone> = {
  returned: 'success',
  pending: 'warning',
  'not-required': 'warning',
  prohibited: 'danger',
}

const STATUS_KEYS: Record<ReturnStatus, TKey> = {
  returned: 'search.returnedStatus',
  pending: 'search.pendingStatus',
  'not-required': 'search.notRequiredStatus',
  prohibited: 'search.prohibitedStatus',
}

function FixedListCard({
  name,
  codes,
  statusOf,
  query,
  archived,
}: {
  name: string
  codes: string[]
  statusOf: Map<string, ReturnStatus>
  query: string
  archived?: boolean
}) {
  const { t } = useI18n()
  const [limit, setLimit] = useState(PER_LIST_CAP)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    setLimit(PER_LIST_CAP)
  }, [query, name])

  const visible = codes.slice(0, limit)

  return (
    <article className={cx('fixed-card', !open && 'is-collapsed')}>
      <button
        type="button"
        className="fixed-card-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? t('fixed.collapse') : t('fixed.expand')}
      >
        <span className="fixed-card-icon">
          <Boxes size={18} />
        </span>
        <span className="fixed-card-name">{name}</span>
        {archived ? <Badge tone="muted">{t('status.archived')}</Badge> : null}
        <Badge tone="accent">{t('fixed.codes', { count: codes.length })}</Badge>
        <ChevronDown size={18} className="fixed-chevron" />
      </button>

      {open ? (
        codes.length ? (
          <>
            <ul className="fixed-codes">
              {visible.map((code) => {
                const status = statusOf.get(code.toUpperCase())
                return (
                  <li key={code} className="fixed-code-row">
                    <span className="mono">{code}</span>
                    {status ? (
                      <Badge tone={STATUS_TONES[status]}>{t(STATUS_KEYS[status])}</Badge>
                    ) : (
                      <Badge tone="muted">{t('fixed.noStatus')}</Badge>
                    )}
                  </li>
                )
              })}
            </ul>
            {codes.length > limit ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm fixed-more"
                onClick={() => setLimit((value) => value + PER_LIST_CAP)}
              >
                {t('fixed.loadMore', { count: codes.length - limit })}
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

export function FixedListsPage() {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const blacklist = useStore((state) => state.blacklist)

  const [tick, setTick] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const handler = () => setTick((value) => value + 1)
    window.addEventListener('rsp.flow', handler)
    return () => window.removeEventListener('rsp.flow', handler)
  }, [])

  const flow = useMemo<FlowDistributor[]>(() => loadFlowDistributors(), [tick])

  const fixedFlow = useMemo(
    () => flow.filter((item) => isFixedListName(item.name)),
    [flow],
  )

  const byName = useMemo(() => {
    const map = new Map<string, FlowDistributor>()
    for (const item of fixedFlow) map.set(item.name.trim().toLowerCase(), item)
    return map
  }, [fixedFlow])

  const needle = query.trim().toLowerCase()

  const statusOf = useMemo(() => {
    const listNames = new Map(lists.map((list) => [list.id, list.name]))
    const index = buildReturnIndex({ parcels, registry, blacklist, listNames })
    const map = new Map<string, ReturnStatus>()
    for (const entry of index) map.set(entry.code.toUpperCase(), entry.status)
    return map
  }, [lists, parcels, registry, blacklist])

  // Entry date of every code, as published by ColisFlow (empty when unknown).
  const dateOf = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of flow) {
      const dates = item.dates ?? []
      item.codes.forEach((code, index) => {
        const key = code.toUpperCase()
        if (!map.has(key)) map.set(key, dates[index] ?? '')
      })
    }
    return map
  }, [flow])

  // Flat search results: every matching code with its list, entry date and status.
  const results = useMemo(() => {
    if (!needle) return []
    const hits: { code: string; listName: string; date?: string; archived: boolean }[] = []
    for (const item of flow) {
      for (const code of item.codes) {
        if (!code.toLowerCase().includes(needle)) continue
        hits.push({
          code,
          listName: item.name,
          date: dateOf.get(code.toUpperCase()) || item.date,
          archived: item.archived,
        })
      }
    }
    hits.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    return hits
  }, [flow, needle, dateOf])

  const cards = useMemo(
    () =>
      FIXED_LISTS.map((fixed) => {
        const item = byName.get(fixed.name.toLowerCase())
        const codes = (item?.codes ?? []).filter(
          (code) => !needle || code.toLowerCase().includes(needle),
        )
        return { id: fixed.id, name: fixed.name, codes }
      }),
    [byName, needle],
  )

  // Everything else ColisFlow publishes: every distributor and every code,
  // not only the permanent routeur lists.
  const otherCards = useMemo(() => {
    const fixedNames = new Set(FIXED_LISTS.map((fixed) => fixed.name.toLowerCase()))
    return flow
      .filter((item) => !fixedNames.has(item.name.trim().toLowerCase()))
      .map((item) => ({
        id: `other-${item.name.toLowerCase()}`,
        name: item.name,
        codes: item.codes.filter((code) => !needle || code.toLowerCase().includes(needle)),
        archived: item.archived,
      }))
      .filter((card) => card.codes.length > 0)
  }, [flow, needle])

  const totalCodes = useMemo(
    () => flow.reduce((sum, item) => sum + item.codes.length, 0),
    [flow],
  )

  const linked = flow.length > 0
  const visibleCards = needle ? cards.filter((card) => card.codes.length > 0) : cards
  const hasResults = visibleCards.length > 0 || otherCards.length > 0

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
        title={t('fixed.title')}
        subtitle={linked ? t('fixed.total', { count: totalCodes }) : t('fixed.subtitle')}
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

      {linked ? (
        <>
          <div className="toolbar">
            <SearchField value={query} onChange={setQuery} placeholder={t('fixed.search')} />
          </div>

          {needle ? (
            results.length ? (
              <article className="fixed-card">
                <ul className="fixed-codes">
                  {results.slice(0, RESULT_CAP).map((hit) => {
                    const status = statusOf.get(hit.code.toUpperCase())
                    return (
                      <li
                        key={`${hit.listName}-${hit.code}`}
                        className={cx('fixed-result', hit.archived && 'is-archived')}
                      >
                        <div className="fixed-result-top">
                          <span className="mono">{hit.code}</span>
                          {status ? (
                            <Badge tone={STATUS_TONES[status]}>{t(STATUS_KEYS[status])}</Badge>
                          ) : (
                            <Badge tone="muted">{t('fixed.noStatus')}</Badge>
                          )}
                        </div>
                        <div className="fixed-result-sub">
                          <span className="fixed-result-list">{hit.listName}</span>
                          {hit.archived ? <Badge tone="muted">{t('status.archived')}</Badge> : null}
                          <span>{hit.date ? formatDateTime(hit.date, lang) : '—'}</span>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {results.length > RESULT_CAP ? (
                  <p className="fixed-empty">{t('fixed.more', { count: results.length - RESULT_CAP })}</p>
                ) : null}
              </article>
            ) : (
              <EmptyState
                icon={Inbox}
                title={t('fixed.noMatch')}
                text={t('fixed.noMatchText')}
              />
            )
          ) : hasResults ? (
            <>
              {visibleCards.length ? (
                <div className="fixed-grid">
                  {visibleCards.map((card) => (
                    <FixedListCard
                      key={card.id}
                      name={card.name}
                      codes={card.codes}
                      statusOf={statusOf}
                      query={query}
                    />
                  ))}
                </div>
              ) : null}

              {otherCards.length ? (
                <>
                  <h2 className="fixed-section-title">{t('fixed.others')}</h2>
                  <div className="fixed-grid">
                    {otherCards.map((card) => (
                      <FixedListCard
                        key={card.id}
                        name={card.name}
                        codes={card.codes}
                        archived={card.archived}
                        statusOf={statusOf}
                        query={query}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={Inbox}
              title={t('fixed.noMatch')}
              text={t('fixed.noMatchText')}
            />
          )}
        </>
      ) : (
        <EmptyState
          icon={Boxes}
          title={t('fixed.notLinked')}
          text={t('fixed.notLinkedText')}
        />
      )}
    </div>
  )
}
