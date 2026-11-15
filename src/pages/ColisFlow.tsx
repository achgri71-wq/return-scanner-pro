import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Boxes,
  CalendarDays,
  Cloud,
  CloudOff,
  Download,
  Inbox,
  RefreshCw,
  Search,
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
import { isFixedDistributor } from '../lib/fixedLists'
import { cx, formatDateTime, formatNumber, relativeTime } from '../lib/utils'
import { toast } from '../components/Toast'
import { Badge, EmptyState, PageHeader, SearchField, StatCard } from '../components/ui'
import { CodeRecordModal, STATUS_KEYS, STATUS_TONES, type CodeHit } from '../components/CodeRecord'

const CLOUD_POLL_MS = 3 * 1000
const PAGE_SIZE = 120

function DistributorCard({
  item,
  codes,
  query,
  statusOf,
  registryOf,
  onOpenCode,
}: {
  item: FlowDistributor
  codes: string[]
  query: string
  statusOf: Map<string, ReturnStatus>
  registryOf: Map<string, ScannedCode>
  onOpenCode: (item: FlowDistributor, code: string, date?: string) => void
}) {
  const { t, lang } = useI18n()
  const [limit, setLimit] = useState(PAGE_SIZE)
  const fixed = isFixedDistributor(item)
  const dates = useMemo(
    () => new Map(item.codes.map((code, index) => [code.toUpperCase(), item.dates?.[index] || item.date || ''])),
    [item.codes, item.dates, item.date],
  )

  useEffect(() => setLimit(PAGE_SIZE), [item.name, query])

  return (
    <article className="card colisflow-distributor">
      <header className="colisflow-distributor-head">
        <span className={cx('colisflow-distributor-icon', fixed && 'is-fixed')}>
          {fixed ? <Truck size={18} /> : <Boxes size={18} />}
        </span>
        <div className="colisflow-distributor-title">
          <h2>{item.name}</h2>
          {item.phone ? <small>{item.phone}</small> : null}
        </div>
        {fixed ? <Badge tone="accent">{t('flowPage.routeur')}</Badge> : null}
        {item.archived ? <Badge tone="muted">{t('status.archived')}</Badge> : null}
        <Badge tone={item.codes.length ? 'info' : 'muted'}>
          {t('fixed.codes', { count: item.codes.length })}
        </Badge>
      </header>

      {codes.length ? (
        <div className="colisflow-code-list">
          {codes.slice(0, limit).map((code) => {
            const key = code.toUpperCase()
            const status = statusOf.get(key)
            const inWarehouse = registryOf.has(key)
            const date = dates.get(key) || item.date
            return (
              <button
                key={`${item.name}-${code}`}
                type="button"
                className="colisflow-code-row"
                onClick={() => onOpenCode(item, code, date)}
              >
                <span className="colisflow-code-main">
                  <strong className="mono">{code}</strong>
                  <small>
                    {date ? <><CalendarDays size={12} /> {formatDateTime(date, lang)}</> : '—'}
                  </small>
                </span>
                <span className="colisflow-code-badges">
                  {inWarehouse ? <Badge tone="info">{t('fixed.inEntrepot')}</Badge> : null}
                  {status ? (
                    <Badge tone={STATUS_TONES[status]}>{t(STATUS_KEYS[status])}</Badge>
                  ) : (
                    <Badge tone="muted">{t('fixed.noStatus')}</Badge>
                  )}
                </span>
              </button>
            )
          })}
          {codes.length > limit ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm colisflow-load-more"
              onClick={() => setLimit((current) => current + PAGE_SIZE)}
            >
              {t('flowPage.loadMore', { count: codes.length - limit })}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="colisflow-no-codes">{t('flowPage.noCodes')}</p>
      )}
    </article>
  )
}

/** All ColisFlow distributors and their codes, refreshed from the cloud live. */
export function ColisFlowPage() {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const blacklist = useStore((state) => state.blacklist)

  const [flow, setFlow] = useState<FlowDistributor[]>(() => loadFlowDistributors())
  const [publishedAt, setPublishedAt] = useState<string | null>(() => loadFlowPublishedAt())
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CodeHit | null>(null)
  const [syncError, setSyncError] = useState(false)
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const busy = useRef(false)

  const refresh = useCallback(async (manual = false) => {
    if (busy.current) return
    busy.current = true
    if (manual) setManualRefreshing(true)
    try {
      const next = await pullFlowDistributors()
      setFlow(next)
      setPublishedAt(loadFlowPublishedAt())
      setSyncError(false)
      if (manual) {
        const codes = next.reduce((sum, item) => sum + item.codes.length, 0)
        toast(t('flowPage.refreshed', { lists: next.length, codes }), 'success')
      }
    } catch (error) {
      console.warn('ColisFlow page cloud refresh failed:', error)
      setSyncError(true)
      if (manual) toast(t('flowPage.syncFailed'), 'error')
    } finally {
      busy.current = false
      if (manual) setManualRefreshing(false)
    }
  }, [t])

  useEffect(() => {
    const onLocalUpdate = () => {
      setFlow(loadFlowDistributors())
      setPublishedAt(loadFlowPublishedAt())
    }
    const onOnline = () => {
      setOnline(true)
      void refresh()
    }
    const onOffline = () => setOnline(false)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }

    window.addEventListener('rsp.flow', onLocalUpdate)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibility)
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, CLOUD_POLL_MS)

    return () => {
      window.removeEventListener('rsp.flow', onLocalUpdate)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(timer)
    }
  }, [refresh])

  const statusOf = useMemo(() => {
    const listNames = new Map(lists.map((list) => [list.id, list.name]))
    const index = buildReturnIndex({ parcels, registry, blacklist, listNames })
    return new Map(index.map((entry) => [entry.code.toUpperCase(), entry.status]))
  }, [lists, parcels, registry, blacklist])

  const registryOf = useMemo(() => {
    const result = new Map<string, ScannedCode>()
    for (const entry of registry) {
      const key = entry.code.trim().toUpperCase()
      if (key && !result.has(key)) result.set(key, entry)
    }
    return result
  }, [registry])

  const needle = query.trim().toLocaleLowerCase()
  const visible = useMemo(() => {
    return flow.flatMap((item) => {
      const nameMatches = item.name.toLocaleLowerCase().includes(needle)
      const codes = needle && !nameMatches
        ? item.codes.filter((code) => code.toLocaleLowerCase().includes(needle))
        : item.codes
      if (needle && !nameMatches && !codes.length) return []
      return [{ item, codes }]
    })
  }, [flow, needle])

  const totalCodes = useMemo(
    () => flow.reduce((sum, item) => sum + item.codes.length, 0),
    [flow],
  )

  const openCode = (item: FlowDistributor, code: string, date?: string) => {
    setSelected({
      code,
      listName: item.name,
      date,
      archived: item.archived,
      inEntrepot: registryOf.has(code.toUpperCase()),
    })
  }

  return (
    <div className="page colisflow-page">
      <PageHeader
        title={t('flowPage.title')}
        subtitle={t('flowPage.subtitle')}
        actions={(
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void refresh(true)}
            disabled={manualRefreshing}
          >
            {manualRefreshing ? <RefreshCw size={16} className="spin" /> : <Download size={16} />}
            {t('flowPage.refresh')}
          </button>
        )}
      />

      <div className="stats-grid colisflow-stats">
        <StatCard
          icon={Boxes}
          label={t('flowPage.distributors')}
          value={formatNumber(flow.length, lang)}
          tone="accent"
        />
        <StatCard
          icon={Truck}
          label={t('flowPage.codes')}
          value={formatNumber(totalCodes, lang)}
          tone="info"
        />
      </div>

      <div className="colisflow-sync-line">
        <span className={cx('colisflow-sync-dot', (!online || syncError) && 'is-offline')} />
        <span>
          {!online || syncError
            ? t('flowPage.syncFailed')
            : publishedAt
              ? t('flowPage.lastSync', { when: relativeTime(publishedAt, lang) })
              : t('flowPage.waiting')}
        </span>
        <Badge tone={online && !syncError ? 'success' : 'warning'}>
          {online && !syncError ? <Cloud size={13} /> : <CloudOff size={13} />}
          {online && !syncError ? t('flowPage.connected') : t('flowPage.offline')}
        </Badge>
      </div>

      <div className="colisflow-toolbar">
        <SearchField value={query} onChange={setQuery} placeholder={t('flowPage.search')} />
        {needle ? <span className="colisflow-result-count">{t('flowPage.found', { count: visible.length })}</span> : null}
      </div>

      {visible.length ? (
        <div className="colisflow-distributor-grid">
          {visible.map(({ item, codes }, index) => (
            <DistributorCard
              key={`${item.name.toLocaleLowerCase()}-${index}`}
              item={item}
              codes={codes}
              query={needle}
              statusOf={statusOf}
              registryOf={registryOf}
              onOpenCode={openCode}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={needle ? Search : Inbox}
          title={needle ? t('flowPage.noMatch') : t('flowPage.empty')}
          text={needle ? t('flowPage.noMatchText') : t('flowPage.emptyText')}
        />
      )}

      <CodeRecordModal hit={selected} statusOf={statusOf} onClose={() => setSelected(null)} />
    </div>
  )
}
