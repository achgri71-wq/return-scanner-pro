import { useEffect, useMemo, useState } from 'react'
import { Boxes, ChevronDown, ChevronRight, Inbox, RefreshCw, ScrollText } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { ScannedCode } from '../types'
import { useI18n, type TKey } from '../i18n'
import {
  buildReturnIndex,
  loadFlowDistributors,
  syncFlow,
  type FlowDistributor,
  type ReturnStatus,
} from '../lib/flowLink'
import { FIXED_LISTS, isFixedListName } from '../lib/fixedLists'
import { cx, formatDate, formatDateTime } from '../lib/utils'
import { Badge, EmptyState, Modal, PageHeader, SearchField, type Tone } from '../components/ui'
import { ParcelStatusBadge, RegistryStatusBadge } from '../components/StatusBadge'

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

interface CodeHit {
  code: string
  /** ColisFlow list holding the code (absent when only the Entrepôt knows it). */
  listName?: string
  date?: string
  archived: boolean
  /** Already present in this app's own scan registry (Entrepôt). */
  inEntrepot: boolean
}

/** Full record of one code: ColisFlow side + this app's own data (Entrepôt…). */
function CodeRecordModal({
  hit,
  statusOf,
  onClose,
}: {
  hit: CodeHit | null
  statusOf: Map<string, ReturnStatus>
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const blacklist = useStore((state) => state.blacklist)

  const info = useMemo(() => {
    if (!hit) return null
    const key = hit.code.toUpperCase()
    const parcel = parcels.find((entry) => entry.code.toUpperCase() === key) ?? null
    const entry = registry.find((item) => item.code.toUpperCase() === key) ?? null
    const banned = blacklist.find((item) => item.code.toUpperCase() === key) ?? null
    const list = parcel ? lists.find((item) => item.id === parcel.listId) ?? null : null
    return { parcel, entry, banned, list }
  }, [hit, parcels, registry, blacklist, lists])

  const status = hit ? statusOf.get(hit.code.toUpperCase()) : undefined

  return (
    <Modal
      open={Boolean(hit)}
      onClose={onClose}
      title={t('fixed.codeRecord')}
      subtitle={hit?.code}
      icon={<ScrollText size={20} />}
      size="sm"
    >
      {hit && info ? (
        <div className="code-record">
          <div className="code-record-row">
            <span className="code-record-label">{t('fixed.labelStatus')}</span>
            <div className="code-record-value">
              {status ? (
                <Badge tone={STATUS_TONES[status]}>{t(STATUS_KEYS[status])}</Badge>
              ) : (
                <Badge tone="muted">{t('fixed.noStatus')}</Badge>
              )}
            </div>
          </div>

          <div className="code-record-row">
            <span className="code-record-label">{t('fixed.labelColisflow')}</span>
            <div className="code-record-value">
              {hit.listName ? (
                <>
                  <strong>{hit.listName}</strong>
                  {hit.date ? <small>{formatDateTime(hit.date, lang)}</small> : null}
                </>
              ) : (
                <Badge tone="muted">{t('fixed.notInColisflow')}</Badge>
              )}
            </div>
          </div>

          <div className="code-record-row">
            <span className="code-record-label">{t('fixed.labelEntrepot')}</span>
            <div className="code-record-value">
              {info.entry ? (
                <>
                  <RegistryStatusBadge
                    status={info.banned ? 'return-prohibited' : info.entry.status}
                  />
                  <small>
                    {t('registry.firstScan')} : {formatDate(info.entry.firstScanAt, lang)}
                  </small>
                  <small>
                    {t('records.attempts')} : {info.entry.attempts}
                  </small>
                </>
              ) : (
                <Badge tone="muted">{t('fixed.notInEntrepot')}</Badge>
              )}
            </div>
          </div>

          {info.parcel && info.list ? (
            <div className="code-record-row">
              <span className="code-record-label">{t('fixed.labelList')}</span>
              <div className="code-record-value">
                <strong>{info.list.name}</strong>
                <ParcelStatusBadge status={info.parcel.status} />
                <small>
                  {t('records.addedAt')} : {formatDate(info.parcel.addedAt, lang)}
                </small>
                {info.parcel.returnedAt ? (
                  <small>
                    {t('records.returnedAt')} : {formatDate(info.parcel.returnedAt, lang)}
                  </small>
                ) : null}
              </div>
            </div>
          ) : null}

          {info.banned ? (
            <div className="code-record-row">
              <span className="code-record-label">{t('fixed.labelBlacklist')}</span>
              <div className="code-record-value">
                <Badge tone="danger">{t('search.prohibitedStatus')}</Badge>
                {info.banned.reason ? <small>{info.banned.reason}</small> : null}
                {info.banned.addedAt ? (
                  <small>{formatDate(info.banned.addedAt, lang)}</small>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}

function FixedListCard({
  name,
  codes,
  statusOf,
  query,
  archived,
  onOpenCode,
}: {
  name: string
  codes: string[]
  statusOf: Map<string, ReturnStatus>
  query: string
  archived?: boolean
  onOpenCode?: (code: string) => void
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
                  <li key={code}>
                    <button
                      type="button"
                      className="fixed-code-row"
                      onClick={() => onOpenCode?.(code)}
                      aria-label={code}
                    >
                      <span className="mono">{code}</span>
                      {status ? (
                        <Badge tone={STATUS_TONES[status]}>{t(STATUS_KEYS[status])}</Badge>
                      ) : (
                        <Badge tone="muted">{t('fixed.noStatus')}</Badge>
                      )}
                    </button>
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
  const [selected, setSelected] = useState<CodeHit | null>(null)

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

  const flowByName = useMemo(
    () => new Map(flow.map((item) => [item.name.trim().toLowerCase(), item])),
    [flow],
  )

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

  // Codes already present in this app's own scan registry (Entrepôt).
  const registryOf = useMemo(() => {
    const map = new Map<string, ScannedCode>()
    for (const entry of registry) {
      const key = entry.code.trim().toUpperCase()
      if (key && !map.has(key)) map.set(key, entry)
    }
    return map
  }, [registry])

  // Flat search results: every matching code with its list, entry date and
  // status, plus the codes only the Entrepôt knows about.
  const results = useMemo<CodeHit[]>(() => {
    if (!needle) return []
    const hits: CodeHit[] = []
    const seen = new Set<string>()
    for (const item of flow) {
      for (const code of item.codes) {
        if (!code.toLowerCase().includes(needle)) continue
        const key = code.toUpperCase()
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
    // Codes scanned into the Entrepôt that ColisFlow does not publish.
    for (const [key, entry] of registryOf) {
      if (seen.has(key) || !key.toLowerCase().includes(needle)) continue
      hits.push({
        code: entry.code,
        date: entry.firstScanAt,
        archived: false,
        inEntrepot: true,
      })
    }
    hits.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    return hits
  }, [flow, needle, dateOf, registryOf])

  // Opens the record of a code clicked inside a grouped list card.
  const openFromCard = (code: string, listName: string) => {
    const item = flowByName.get(listName.toLowerCase())
    setSelected({
      code,
      listName,
      date: dateOf.get(code.toUpperCase()) || item?.date,
      archived: item?.archived ?? false,
      inEntrepot: registryOf.has(code.toUpperCase()),
    })
  }

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
                      <li key={`${hit.listName ?? ''}-${hit.code}`}>
                        <button
                          type="button"
                          className={cx('fixed-result', hit.archived && 'is-archived')}
                          onClick={() => setSelected(hit)}
                          aria-label={hit.code}
                        >
                          <span className="fixed-result-top">
                            <span className="mono">{hit.code}</span>
                            <span className="fixed-result-badges">
                              {status ? (
                                <Badge tone={STATUS_TONES[status]}>{t(STATUS_KEYS[status])}</Badge>
                              ) : (
                                <Badge tone="muted">{t('fixed.noStatus')}</Badge>
                              )}
                              <ChevronRight size={15} className="fixed-result-chevron" />
                            </span>
                          </span>
                          <span className="fixed-result-sub">
                            {hit.listName ? (
                              <span className="fixed-result-list">{hit.listName}</span>
                            ) : null}
                            {hit.inEntrepot ? (
                              <Badge tone="info">{t('fixed.inEntrepot')}</Badge>
                            ) : null}
                            {hit.archived ? <Badge tone="muted">{t('status.archived')}</Badge> : null}
                            <span>{hit.date ? formatDateTime(hit.date, lang) : '—'}</span>
                          </span>
                        </button>
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
                      onOpenCode={(code) => openFromCard(code, card.name)}
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
                        onOpenCode={(code) => openFromCard(code, card.name)}
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

      <CodeRecordModal
        hit={selected}
        statusOf={statusOf}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
