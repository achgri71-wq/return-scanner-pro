import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CalendarDays,
  Camera,
  FilterX,
  ListChecks,
  Search as SearchIcon,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useI18n } from '../i18n'
import { searchRecords, type SearchStatus } from '../lib/search'
import { highlightParts } from '../lib/codes'
import { formatDateTime, cx } from '../lib/utils'
import { Badge, EmptyState, PageHeader, SearchField, Section, Segmented } from '../components/ui'
import { CameraScanner } from '../components/CameraScanner'

const STATUS_TONES: Record<SearchStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  returned: 'success',
  pending: 'warning',
  'not-required': 'warning',
  prohibited: 'danger',
}

const STATUS_KEYS: Record<SearchStatus, string> = {
  returned: 'search.returnedStatus',
  pending: 'search.pendingStatus',
  'not-required': 'search.notRequiredStatus',
  prohibited: 'search.prohibitedStatus',
}

export function SearchPage() {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const blacklist = useStore((state) => state.blacklist)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | SearchStatus>('all')
  const [listId, setListId] = useState<'all' | string>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)

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

  const hasFilters = status !== 'all' || listId !== 'all' || Boolean(from) || Boolean(to)
  const results = ready ? response.hits : []

  const reset = () => {
    setQuery('')
    setStatus('all')
    setListId('all')
    setFrom('')
    setTo('')
  }

  const statusChips: Array<{ value: 'all' | SearchStatus; label: string }> = [
    { value: 'all', label: t('search.allStatus') },
    { value: 'returned', label: t('search.returnedStatus') },
    { value: 'pending', label: t('search.pendingStatus') },
    { value: 'not-required', label: t('search.notRequiredStatus') },
    { value: 'prohibited', label: t('search.prohibitedStatus') },
  ]

  return (
    <div className="page">
      <PageHeader
        title={t('search.title')}
        subtitle={t('search.subtitle')}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => setCameraOpen(true)}>
            <Camera size={16} />
            {t('search.camera')}
          </button>
        }
      />

      <Section className="search-panel">
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
            <button type="button" className="btn btn-ghost btn-sm clear-filters" onClick={reset}>
              <FilterX size={15} /> {t('search.clearFilters')}
            </button>
          ) : null}
        </div>

        <div className="search-status-row">
          <SlidersHorizontal size={15} />
          <Segmented value={status} options={statusChips} onChange={setStatus} />
        </div>
      </Section>

      {!ready ? (
        <EmptyState
          icon={SearchIcon}
          title={t('search.startHint')}
          text={t('search.subtitle')}
        />
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
              {results.map((hit) => (
                <div className="result-row" key={hit.key}>
                  <div className="result-code">
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
                  </div>
                  <div className="result-meta">
                    <Badge tone={STATUS_TONES[hit.status]} dot>
                      {t(STATUS_KEYS[hit.status] as 'search.returnedStatus')}
                    </Badge>
                    {hit.attempts > 1 ? <Badge tone="warning">{hit.attempts}×</Badge> : null}
                    {hit.otherListName ? <Badge tone="info">{hit.otherListName}</Badge> : null}
                    <span className="result-date">
                      {hit.lastAttemptAt ? formatDateTime(hit.lastAttemptAt, lang) : '—'}
                    </span>
                  </div>
                  <Link to={`/lists/${hit.listId}`} className="icon-btn" title={t('search.openList')}>
                    <ArrowRight size={17} />
                  </Link>
                </div>
              ))}
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
      )}

      <CameraScanner
        open={cameraOpen}
        continuous={false}
        onClose={() => setCameraOpen(false)}
        onDetect={(code) => setQuery(code)}
      />
    </div>
  )
}
