import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, Download, ScanLine } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useI18n } from '../i18n'
import { exportRegistryXlsx } from '../lib/export'
import { formatDateTime, relativeTime } from '../lib/utils'
import {
  Badge,
  EmptyState,
  PageHeader,
  SearchField,
  Section,
  Segmented,
} from '../components/ui'
import { AttemptsBadge, RegistryStatusBadge, ScanResultBadge } from '../components/StatusBadge'
import { toast } from '../components/Toast'
import type { RegistryStatus } from '../types'

type Filter = 'all' | RegistryStatus

export function RegistryPage() {
  const { t, lang } = useI18n()
  const registry = useStore((state) => state.registry)
  const lists = useStore((state) => state.lists)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [listId, setListId] = useState<'all' | string>('all')

  const listById = useMemo(() => new Map(lists.map((list) => [list.id, list])), [lists])
  const needle = query.trim().toLocaleLowerCase()

  const visible = useMemo(
    () =>
      registry
        .filter((entry) => filter === 'all' || entry.status === filter)
        .filter((entry) => listId === 'all' || entry.listId === listId)
        .filter(
          (entry) =>
            !needle ||
            entry.code.toLocaleLowerCase().includes(needle) ||
            (listById.get(entry.listId)?.name.toLocaleLowerCase().includes(needle) ?? false),
        )
        .sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt)),
    [registry, filter, listId, needle, listById],
  )

  const counts = useMemo(
    () => ({
      all: registry.length,
      'required-returned': registry.filter((entry) => entry.status === 'required-returned').length,
      'not-required': registry.filter((entry) => entry.status === 'not-required').length,
      'return-prohibited': registry.filter((entry) => entry.status === 'return-prohibited').length,
    }),
    [registry],
  )

  const exportList = async () => {
    try {
      const names = new Map(lists.map((list) => [list.id, list.name]))
      await exportRegistryXlsx(visible, names, lang)
      toast(t('toast.exportStarted'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.unknownError'), 'error')
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={t('registry.title')}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => void exportList()} disabled={!visible.length}>
            <Download size={16} />
            {t('registry.export')}
          </button>
        }
      />

      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder={t('registry.search')} />
        <select className="input compact-select" value={listId} onChange={(event) => setListId(event.target.value)}>
          <option value="all">{t('search.allLists')}</option>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
      </div>

      <Segmented
        value={filter}
        options={[
          { value: 'all', label: t('common.all'), count: counts.all },
          { value: 'required-returned', label: t('status.requiredReturned'), count: counts['required-returned'] },
          { value: 'not-required', label: t('status.notRequired'), count: counts['not-required'] },
          { value: 'return-prohibited', label: t('status.prohibited'), count: counts['return-prohibited'] },
        ]}
        onChange={setFilter}
      />

      <Section>
        {visible.length ? (
          <div className="registry-table">
            <div className="registry-head" aria-hidden="true">
              <span>{t('common.code')}</span>
              <span>{t('common.list')}</span>
              <span>{t('common.status')}</span>
              <span>{t('registry.attempts')}</span>
              <span>{t('registry.lastAttempt')}</span>
              <span>{t('registry.lastResult')}</span>
              <span />
            </div>
            {visible.slice(0, 500).map((entry) => (
              <div className="registry-row" key={entry.id}>
                <strong className="mono">{entry.code}</strong>
                <span className="registry-list-name">{listById.get(entry.listId)?.name ?? entry.listId}</span>
                <RegistryStatusBadge status={entry.status} />
                <AttemptsBadge count={entry.attempts} />
                <span className="registry-time" title={formatDateTime(entry.lastAttemptAt, lang)}>
                  {relativeTime(entry.lastAttemptAt, lang)}
                </span>
                <ScanResultBadge result={entry.lastResult} />
                <Link to={`/lists/${entry.listId}`} className="icon-btn" title={t('search.openList')}>
                  <ArrowRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title={t('registry.empty')}
            text={t('registry.emptyText')}
            action={
              <Link to="/scan" className="btn btn-primary">
                <ScanLine size={16} />
                {t('nav.scan')}
              </Link>
            }
          />
        )}
        {visible.length > 500 ? (
          <p className="list-note center">
            <Badge tone="info">{t('common.showing', { count: 500 })}</Badge>
          </p>
        ) : null}
      </Section>
    </div>
  )
}
