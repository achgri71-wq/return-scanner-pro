import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  Camera,
  ChevronRight,
  FilterX,
  ListChecks,
  Search as SearchIcon,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useI18n } from '../i18n'
import { multiSearchRecords, searchRecords, type SearchStatus } from '../lib/search'
import { highlightParts, parseCodeBlob } from '../lib/codes'
import { buildReturnIndex, loadFlowDistributors, type ReturnStatus } from '../lib/flowLink'
import { formatDateTime, cx } from '../lib/utils'
import { Badge, EmptyState, PageHeader, SearchField, Section, Segmented } from '../components/ui'
import { CameraScanner } from '../components/CameraScanner'
import { CodeRecordModal, STATUS_KEYS, STATUS_TONES, type CodeHit } from '../components/CodeRecord'

type SearchMode = 'single' | 'multi'

export function SearchPage() {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const blacklist = useStore((state) => state.blacklist)

  const [mode, setMode] = useState<SearchMode>('single')
  const [query, setQuery] = useState('')
  const [blob, setBlob] = useState('')
  const [multiCodes, setMultiCodes] = useState<string[]>([])
  const [status, setStatus] = useState<'all' | SearchStatus>('all')
  const [listId, setListId] = useState<'all' | string>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [selected, setSelected] = useState<CodeHit | null>(null)

  // ColisFlow link: which distributor currently holds each code.
  const [flowTick, setFlowTick] = useState(0)
  useEffect(() => {
    const handler = () => setFlowTick((tick) => tick + 1)
    window.addEventListener('rsp.flow', handler)
    return () => window.removeEventListener('rsp.flow', handler)
  }, [])
  const flow = useMemo(() => loadFlowDistributors(), [flowTick])

  // Distributor holding each code, with its entry date in that list.
  const flowOwners = useMemo(() => {
    const map = new Map<string, { name: string; archived: boolean; date?: string }>()
    for (const item of flow) {
      const dates = item.dates ?? []
      item.codes.forEach((code, index) => {
        const key = code.toUpperCase()
        if (!map.has(key)) {
          map.set(key, { name: item.name, archived: item.archived, date: dates[index] || item.date })
        }
      })
    }
    return map
  }, [flow])

  // Status of every code, as published to ColisFlow (used by the record panel).
  const statusOf = useMemo(() => {
    const listNames = new Map(lists.map((list) => [list.id, list.name]))
    const index = buildReturnIndex({ parcels, registry, blacklist, listNames })
    const map = new Map<string, ReturnStatus>()
    for (const entry of index) map.set(entry.code.toUpperCase(), entry.status)
    return map
  }, [lists, parcels, registry, blacklist])

  // Codes present in this app's own scan registry (Entrepôt).
  const registryOf = useMemo(() => {
    const set = new Set<string>()
    for (const entry of registry) {
      const key = entry.code.trim().toUpperCase()
      if (key) set.add(key)
    }
    return set
  }, [registry])

  // Opens the full record of a code tapped in the results.
  const openRecord = (code: string) => {
    const key = code.toUpperCase()
    const owner = flowOwners.get(key)
    setSelected({
      code,
      listName: owner?.name,
      date: owner?.date,
      archived: owner?.archived ?? false,
      inEntrepot: registryOf.has(key),
    })
  }

  const trimmed = query.trim()
  const ready = trimmed.length >= 2

  const response = useMemo(
    () =>
      searchRecords({
        query: ready ? trimmed : '',
        lists,
        parcels,
        registry,
        blacklist,
        filters: { status, listId, from, to },
        limit: 200,
      }),
    [ready, trimmed, lists, parcels, registry, blacklist, status, listId, from, to],
  )

  const blobCodes = useMemo(() => parseCodeBlob(blob), [blob])

  const multiResponse = useMemo(
    () =>
      multiCodes.length
        ? multiSearchRecords({
            codes: multiCodes,
            lists,
            parcels,
            registry,
            blacklist,
            filters: { status, listId, from, to },
          })
        : null,
    [multiCodes, lists, parcels, registry, blacklist, status, listId, from, to],
  )

  const hasFilters = status !== 'all' || listId !== 'all' || Boolean(from) || Boolean(to)
  const results = ready ? response.hits : []

  const resetFilters = () => {
    setStatus('all')
    setListId('all')
    setFrom('')
    setTo('')
  }

  const reset = () => {
    setQuery('')
    resetFilters()
  }

  const runMulti = () => setMultiCodes(parseCodeBlob(blob))
  const clearMulti = () => {
    setBlob('')
    setMultiCodes([])
  }

  const statusChips: Array<{ value: 'all' | SearchStatus; label: string }> = [
    { value: 'all', label: t('search.allStatus') },
    { value: 'returned', label: t('search.returnedStatus') },
    { value: 'pending', label: t('search.pendingStatus') },
    { value: 'not-required', label: t('search.notRequiredStatus') },
    { value: 'prohibited', label: t('search.prohibitedStatus') },
  ]

  const modeChips: Array<{ value: SearchMode; label: string }> = [
    { value: 'single', label: t('search.modeSingle') },
    { value: 'multi', label: t('search.modeMulti') },
  ]

  return (
    <div className="page">
      <PageHeader
        title={t('search.title')}
        actions={
          mode === 'single' ? (
            <button type="button" className="btn btn-secondary" onClick={() => setCameraOpen(true)}>
              <Camera size={16} />
              {t('search.camera')}
            </button>
          ) : undefined
        }
      />

      <Section className="search-panel">
        <div className="search-mode-row">
          <Segmented value={mode} options={modeChips} onChange={setMode} />
        </div>

        {mode === 'single' ? (
          <div className="search-main-row">
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder={t('search.placeholder')}
              autoFocus
              className="search-large"
            />
            <button type="button" className="btn btn-secondary" onClick={() => setCameraOpen(true)} aria-label={t('search.camera')}>
              <Camera size={18} />
            </button>
          </div>
        ) : (
          <div className="multi-search">
            <p className="multi-hint">{t('search.multiHint')}</p>
            <textarea
              className="input textarea multi-input"
              value={blob}
              onChange={(event) => setBlob(event.target.value)}
              placeholder={t('search.multiPlaceholder')}
              spellCheck={false}
              autoComplete="off"
            />
            <div className="multi-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={runMulti}
                disabled={!blobCodes.length}
              >
                <SearchIcon size={16} />
                {t('search.multiRun')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setCameraOpen(true)}>
                <Camera size={16} />
                {t('search.multiScan')}
              </button>
              {blob ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearMulti}>
                  <FilterX size={15} />
                  {t('search.multiReset')}
                </button>
              ) : null}
              <span className="multi-count">{t('search.multiCount', { count: blobCodes.length })}</span>
            </div>
          </div>
        )}

        <div className="search-filters">
          <label className="filter-field">
            <span>
              <ListChecks size={14} /> {t('records.listFilter')}
            </span>
            <select className="input" value={listId} onChange={(event) => setListId(event.target.value)}>
              <option value="all">{t('search.allLists')}</option>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>
              <CalendarDays size={14} /> {t('common.from')}
            </span>
            <input type="date" className="input" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="filter-field">
            <span>
              <CalendarDays size={14} /> {t('common.to')}
            </span>
            <input type="date" className="input" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          {hasFilters ? (
            <button type="button" className="btn btn-ghost btn-sm clear-filters" onClick={resetFilters}>
              <FilterX size={15} /> {t('search.clearFilters')}
            </button>
          ) : null}
        </div>

        <div className="search-status-row">
          <SlidersHorizontal size={15} />
          <Segmented value={status} options={statusChips} onChange={setStatus} />
        </div>
      </Section>

      {mode === 'single' ? (
        !ready ? (
          <EmptyState icon={SearchIcon} title={t('search.startHint')} text={t('search.subtitle')} />
        ) : (
          <>
            {response.matchedLists.length ? (
              <div className="matched-lists">
                <span className="matched-label">{t('search.matchedLists')}</span>
                {response.matchedLists.map((list) => (
                  <Link key={list.id} to={`/lists/${list.id}`} className="matched-pill">
                    {list.name} <ArrowRight size={13} />
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="results-head">
              <div>
                <h2>{t('search.results')}</h2>
                <p>
                  {t('search.showing', { shown: results.length, total: response.total })}
                  {response.truncated ? ` · ${t('search.results')}…` : ''}
                </p>
              </div>
              {hasFilters ? (
                <Badge tone="info" dot>
                  {t('common.filter')}
                </Badge>
              ) : null}
            </div>

            {results.length ? (
              <div className="result-list">
                {results.map((hit) => {
                  const owner = flowOwners.get(hit.code.toUpperCase())
                  const inEntrepot = registryOf.has(hit.code.toUpperCase())
                  return (
                    <div className="result-row" key={hit.key}>
                      <button
                        type="button"
                        className="result-code result-open"
                        onClick={() => openRecord(hit.code)}
                        aria-label={hit.code}
                      >
                        <span className="result-code-text">
                          <strong className="mono">
                            {highlightParts(hit.code, trimmed).map((part, index) =>
                              part.hit ? (
                                <mark key={index}>{part.text}</mark>
                              ) : (
                                <span key={index}>{part.text}</span>
                              ),
                            )}
                          </strong>
                          <small>{hit.listName}</small>
                        </span>
                        <ChevronRight size={16} className="result-open-chevron" />
                      </button>
                      <div className="result-meta">
                        <Badge tone={STATUS_TONES[hit.status]} dot>
                          {t(STATUS_KEYS[hit.status])}
                        </Badge>
                        {inEntrepot ? <Badge tone="info">{t('fixed.inEntrepot')}</Badge> : null}
                        {hit.attempts > 1 ? <Badge tone="warning">{hit.attempts}×</Badge> : null}
                        {hit.otherListName ? <Badge tone="info">{hit.otherListName}</Badge> : null}
                        {owner ? (
                          <Badge tone="accent" dot>
                            {t('search.atDistributor', { name: owner.name })}
                          </Badge>
                        ) : null}
                        <span className="result-date">
                          {hit.lastAttemptAt ? formatDateTime(hit.lastAttemptAt, lang) : '—'}
                        </span>
                      </div>
                      <Link to={`/lists/${hit.listId}`} className="icon-btn" title={t('search.openList')}>
                        <ArrowRight size={17} />
                      </Link>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon={XCircle}
                title={t('search.noResults')}
                text={t('search.noResultsText')}
                action={
                  <button type="button" className="btn btn-secondary" onClick={reset}>
                    {t('search.clearFilters')}
                  </button>
                }
              />
            )}

            {!ready && hasFilters ? (
              <p className={cx('list-note', 'center')}>{t('search.startHint')}</p>
            ) : null}
          </>
        )
      ) : !multiResponse ? (
        <EmptyState icon={SearchIcon} title={t('search.multiStart')} text={t('search.multiHint')} />
      ) : (
        <>
          <div className="results-head">
            <div>
              <h2>{t('search.multiResults')}</h2>
              <p>
                {t('search.multiFound', { count: multiResponse.found })} ·{' '}
                {t('search.multiMissing', { count: multiResponse.missing })}
              </p>
            </div>
            {hasFilters ? (
              <Badge tone="info" dot>
                {t('common.filter')}
              </Badge>
            ) : null}
          </div>

          <div className="result-list">
            {multiResponse.items.map((item) => {
              const owner = flowOwners.get(item.code)
              const inEntrepot = registryOf.has(item.code)
              return (
                <div className="result-row" key={item.code}>
                  <button
                    type="button"
                    className="result-code result-open"
                    onClick={() => openRecord(item.code)}
                    aria-label={item.code}
                  >
                    <span className="result-code-text">
                      <strong className="mono">{item.code}</strong>
                    </span>
                    <ChevronRight size={16} className="result-open-chevron" />
                  </button>
                  <div className="result-meta">
                    {inEntrepot ? <Badge tone="info">{t('fixed.inEntrepot')}</Badge> : null}
                    {item.matches.length === 0 ? (
                      <Badge tone="danger" dot>
                        {t('search.multiNotFound')}
                      </Badge>
                    ) : (
                      item.matches.map((match) => (
                        <Link
                          key={match.key}
                          to={`/lists/${match.listId}`}
                          className="multi-match"
                          title={match.listName}
                        >
                          <Badge tone={STATUS_TONES[match.status]} dot>
                            {t(STATUS_KEYS[match.status])}
                          </Badge>
                          <span className="multi-list">{match.listName}</span>
                        </Link>
                      ))
                    )}
                    {owner ? (
                      <Badge tone="accent" dot>
                        {t('search.atDistributor', { name: owner.name })}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <CodeRecordModal
        hit={selected}
        statusOf={statusOf}
        onClose={() => setSelected(null)}
      />

      <CameraScanner
        open={cameraOpen}
        continuous={mode === 'multi'}
        onClose={() => setCameraOpen(false)}
        onDetect={(code) => {
          if (mode === 'multi') {
            setBlob((previous) => (previous ? `${previous}\n${code}` : code))
          } else {
            setQuery(code)
          }
        }}
      />
    </div>
  )
}
