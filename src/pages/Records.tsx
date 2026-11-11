import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Download,
  PackageCheck,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import type { ReturnParcel, ScannedCode } from '../types'
import { useStore } from '../store/useStore'
import { useI18n, errorKey } from '../i18n'
import { formatDateTime, relativeTime } from '../lib/utils'
import { exportRowsXlsx } from '../lib/export'
import {
  Badge,
  EmptyState,
  PageHeader,
  SearchField,
  Section,
  Segmented,
} from '../components/ui'
import { AttemptsBadge, ParcelStatusBadge, RegistryStatusBadge } from '../components/StatusBadge'
import { CorrectionDialog } from '../components/CorrectionDialog'
import { toast } from '../components/Toast'

type Tab = 'returned' | 'remaining' | 'registry'

const TABS: Array<{ value: Tab; labelKey: 'returned.title' | 'remaining.title' | 'registry.title' }> = [
  { value: 'returned', labelKey: 'returned.title' },
  { value: 'remaining', labelKey: 'remaining.title' },
  { value: 'registry', labelKey: 'registry.title' },
]

export function RecordsPage({ initialTab = 'returned' }: { initialTab?: Tab }) {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const blacklist = useStore((state) => state.blacklist)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [query, setQuery] = useState('')
  const [listId, setListId] = useState<'all' | string>('all')
  const [correction, setCorrection] = useState<ReturnParcel | null>(null)

  const deleteParcelRow = (parcelId: string, rowListId: string) => {
    const result = useStore.getState().deleteParcel(rowListId, parcelId)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.codeDeleted'))
  }

  const deleteRegistryRow = (id: string) => {
    const result = useStore.getState().deleteRegistryEntry(id)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.codeDeleted'))
  }

  const listById = useMemo(() => new Map(lists.map((list) => [list.id, list])), [lists])
  const blacklisted = useMemo(() => new Set(blacklist.map((entry) => entry.code)), [blacklist])
  const needle = query.trim().toLocaleLowerCase()

  const returnedRows = useMemo(
    () =>
      parcels.filter(
        (parcel) =>
          parcel.listId &&
          parcel.status === 'returned' &&
          !blacklisted.has(parcel.code) &&
          (listId === 'all' || parcel.listId === listId) &&
          (!needle || parcel.code.toLocaleLowerCase().includes(needle)),
      ),
    [parcels, blacklisted, listId, needle],
  )

  const remainingRows = useMemo(
    () =>
      parcels.filter(
        (parcel) =>
          !(parcel.status === 'returned' && !blacklisted.has(parcel.code)) &&
          (listId === 'all' || parcel.listId === listId) &&
          (!needle || parcel.code.toLocaleLowerCase().includes(needle)),
      ),
    [parcels, blacklisted, listId, needle],
  )

  const registryRows = useMemo(
    () =>
      registry.filter(
        (entry) =>
          (listId === 'all' || entry.listId === listId) &&
          (!needle || entry.code.toLocaleLowerCase().includes(needle)),
      ),
    [registry, listId, needle],
  )

  const counts = {
    returned: returnedRows.length,
    remaining: remainingRows.length,
    registry: registryRows.length,
  }

  const rows: Array<ReturnParcel | ScannedCode> =
    tab === 'returned' ? returnedRows : tab === 'remaining' ? remainingRows : registryRows
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if ('code' in a && 'code' in b) return b.code.localeCompare(a.code)
        return 0
      }),
    [rows],
  )

  const exportRows = async () => {
    try {
      if (tab === 'registry') {
        await exportRowsXlsx(
          t('registry.title'),
          [t('records.code'), t('common.list'), t('common.status'), t('records.attempts'), t('records.lastAttempt')],
          (rows as ScannedCode[]).map((entry) => [
            entry.code,
            listById.get(entry.listId)?.name ?? entry.listId,
            entry.status === 'not-required'
              ? t('status.notRequired')
              : entry.status === 'return-prohibited'
                ? t('status.prohibited')
                : t('status.requiredReturned'),
            String(entry.attempts),
            formatDateTime(entry.lastAttemptAt, lang),
          ]),
          `registre-${Date.now()}.xlsx`,
          lang,
        )
      } else {
        await exportRowsXlsx(
          t(tab === 'returned' ? 'returned.title' : 'remaining.title'),
          [
            t('records.code'),
            t('common.list'),
            t('common.status'),
            t('records.returnedAt'),
            t('records.returnedBy'),
            t('records.addedAt'),
          ],
          (rows as ReturnParcel[]).map((parcel) => [
            parcel.code,
            listById.get(parcel.listId)?.name ?? parcel.listId,
            parcel.status === 'returned' ? t('status.returned') : t('status.pending'),
            parcel.returnedAt ? formatDateTime(parcel.returnedAt, lang) : '',
            parcel.returnedBy ?? '',
            formatDateTime(parcel.addedAt, lang),
          ]),
          `${tab}-${Date.now()}.xlsx`,
          lang,
        )
      }
      toast(t('toast.exportStarted'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.unknownError'), 'error')
    }
  }

  const tabs = TABS.map(({ value, labelKey }) => ({ value, label: t(labelKey), count: counts[value] }))

  return (
    <div className="page">
      <PageHeader
        title={t('nav.records')}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => void exportRows()} disabled={!rows.length}>
            <Download size={16} />
            {t('records.export')}
          </button>
        }
      />

      <Section>
        <div className="toolbar">
          <SearchField value={query} onChange={setQuery} placeholder={t('records.search')} />
          <select className="input compact-select" value={listId} onChange={(event) => setListId(event.target.value)}>
            <option value="all">{t('records.allLists')}</option>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <div className="section-head">
        <Segmented value={tab} options={tabs} onChange={setTab} />
      </div>

      <Section>
        {sorted.length ? (
          <div className="record-list">
            {sorted.slice(0, 400).map((row) => {
              const parcel = row as ReturnParcel
              const entry = row as ScannedCode
              const list = listById.get(parcel.listId || entry.listId)
              if (tab === 'registry') {
                return (
                  <div className="record-row" key={entry.id}>
                    <div className="record-main">
                      <strong className="mono">{entry.code}</strong>
                      <small>
                        {list?.name ?? entry.listId} · {t('records.lastAttempt')}{' '}
                        {relativeTime(entry.lastAttemptAt, lang)}
                        {entry.otherListName ? ` · ${entry.otherListName}` : ''}
                      </small>
                    </div>
                    <RegistryStatusBadge status={blacklisted.has(entry.code) ? 'return-prohibited' : entry.status} />
                    <AttemptsBadge count={entry.attempts} />
                    <button
                      type="button"
                      className="icon-btn danger"
                      title={t('common.delete')}
                      onClick={() => deleteRegistryRow(entry.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                    {list ? (
                      <Link to={`/lists/${list.id}`} className="icon-btn" title={t('search.openList')}>
                        <ArrowRight size={16} />
                      </Link>
                    ) : null}
                  </div>
                )
              }
              return (
                <div className="record-row" key={parcel.id}>
                  <div className="record-main">
                    <strong className="mono">{parcel.code}</strong>
                    <small>
                      {list?.name ?? parcel.listId}
                      {parcel.returnedAt
                        ? ` · ${formatDateTime(parcel.returnedAt, lang)}`
                        : ` · ${t('records.addedAt')} ${formatDateTime(parcel.addedAt, lang)}`}
                      {parcel.returnedBy ? ` · ${parcel.returnedBy}` : ''}
                    </small>
                  </div>
                  {tab === 'remaining' && blacklisted.has(parcel.code) ? (
                    <Badge tone="danger" dot>
                      {t('status.prohibited')}
                    </Badge>
                  ) : (
                    <ParcelStatusBadge status={parcel.status} />
                  )}
                  {tab === 'returned' && parcel.status === 'returned' ? (
                    <button
                      type="button"
                      className="icon-btn danger"
                      title={t('records.correction')}
                      onClick={() => setCorrection(parcel)}
                    >
                      <ShieldAlert size={16} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="icon-btn danger"
                    title={t('common.delete')}
                    onClick={() => deleteParcelRow(parcel.id, parcel.listId)}
                  >
                    <Trash2 size={16} />
                  </button>
                  {list ? (
                    <Link to={`/lists/${list.id}`} className="icon-btn" title={t('search.openList')}>
                      <ArrowRight size={16} />
                    </Link>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={tab === 'returned' ? PackageCheck : tab === 'remaining' ? ClipboardList : BookOpen}
            title={t(tab === 'returned' ? 'returned.empty' : tab === 'remaining' ? 'remaining.empty' : 'registry.title')}
            text={
              tab === 'returned'
                ? t('returned.emptyText')
                : tab === 'remaining'
                  ? t('remaining.emptyText')
                  : t('common.noData')
            }
          />
        )}
      </Section>

      <CorrectionDialog
        open={Boolean(correction)}
        parcel={correction}
        onClose={() => setCorrection(null)}
      />
    </div>
  )
}
