import { useEffect, useMemo, useState } from 'react'
import { Boxes, Inbox, RefreshCw } from 'lucide-react'
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
import { cx } from '../lib/utils'
import { Badge, EmptyState, PageHeader, SearchField, type Tone } from '../components/ui'

/**
 * Read-only view of the six permanent routeur lists.
 *
 * The page is isolated: it never edits anything. It simply reads the lists
 * ColisFlow publishes through the shared link and shows, for every code, the
 * return status known to this app.
 */

const PER_LIST_CAP = 80

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
}: {
  name: string
  codes: string[]
  statusOf: Map<string, ReturnStatus>
  query: string
}) {
  const { t } = useI18n()
  const [limit, setLimit] = useState(PER_LIST_CAP)

  useEffect(() => {
    setLimit(PER_LIST_CAP)
  }, [query, name])

  const visible = codes.slice(0, limit)

  return (
    <article className="fixed-card">
      <header className="fixed-card-head">
        <span className="fixed-card-icon">
          <Boxes size={18} />
        </span>
        <h2>{name}</h2>
        <Badge tone="accent">{t('fixed.codes', { count: codes.length })}</Badge>
      </header>

      {codes.length ? (
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
      )}
    </article>
  )
}

export function FixedListsPage() {
  const { t } = useI18n()
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

  const statusOf = useMemo(() => {
    const listNames = new Map(lists.map((list) => [list.id, list.name]))
    const index = buildReturnIndex({ parcels, registry, blacklist, listNames })
    const map = new Map<string, ReturnStatus>()
    for (const entry of index) map.set(entry.code.toUpperCase(), entry.status)
    return map
  }, [lists, parcels, registry, blacklist])

  const needle = query.trim().toLowerCase()

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

  const totalCodes = useMemo(
    () =>
      FIXED_LISTS.reduce((sum, fixed) => {
        const item = byName.get(fixed.name.toLowerCase())
        return sum + (item?.codes.length ?? 0)
      }, 0),
    [byName],
  )

  const linked = fixedFlow.length > 0
  const visibleCards = needle ? cards.filter((card) => card.codes.length > 0) : cards

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
