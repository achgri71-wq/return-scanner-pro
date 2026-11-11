import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Download,
  PackageCheck,
  PackageX,
  ShieldAlert,
  ClipboardList,
} from 'lucide-react'
import type { ReturnParcel, ScannedCode } from '../types'
import { useStore } from '../store/useStore'
import { useI18n } from '../i18n'
import { formatDateTime, relativeTime } from '../lib/utils'
import { exportRowsXlsx } from '../lib/export'
import {
  Badge,
  EmptyState,
  PageHeader,
  SearchField,
  Section,
  StatCard,
} from '../components/ui'
import { AttemptsBadge, ParcelStatusBadge, RegistryStatusBadge } from '../components/StatusBadge'
import { CorrectionDialog } from '../components/CorrectionDialog'
import { toast } from '../components/Toast'

type Kind = 'returned' | 'remaining' | 'notRequired'

export function ReturnedPage() {
  return <RecordsPage kind="returned" />
}

export function RemainingPage() {
  return <RecordsPage kind="remaining" />
}

export function NotRequiredPage() {
  return <RecordsPage kind="notRequired" />
}

const TITLES: Record<Kind, string> = {
  returned: 'returned.title',
  remaining: 'remaining.title',
  notRequired: 'notRequired.title',
}

const EMPTY: Record<Kind, [string, string]> = {
  returned: ['returned.empty', 'returned.emptyText'],
  remaining: ['remaining.empty', 'remaining.emptyText'],
  notRequired: ['notRequired.empty', 'notRequired.emptyText'],
}

export function RecordsPage({ kind }: { kind: Kind }) {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const blacklist = useStore((state) => state.blacklist)
  const [query, setQuery] = useState('')
  const [listId, setListId] = useState<'all' | string>('all')
  const [correction, setCorrection] = useState<ReturnParcel | null>(null)

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

  const notRequiredRows = useMemo(
    () =>
      registry.filter(
        (entry) =>
          entry.status === 'not-required' &&
          (listId === 'all' || entry.listId === listId) &&
          (!needle || entry.code.toLocaleLowerCase().includes(needle)),
      ),
    [registry, listId, needle],
  )

  const rows: Array<ReturnParcel | ScannedCode> =
    kind === 'returned' ? returnedRows : kind === 'remaining' ? remainingRows : notRequiredRows
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if ('code' in a && 'code' in b) return b.code.localeCompare(a.code)
        return 0
      }),
    [rows],
  )

  const counts = {
    returned: returnedRows.length,
    remaining: remainingRows.length,
    notRequired: notRequiredRows.length,
  }

  const exportRows = async () => {
    try {
      if (kind === 'notRequired') {
        await exportRowsXlsx(
          t('notRequired.title'),
          [t('records.code'), t('common.list'), t('records.attempts'), t('records.lastAttempt'), t('common.status')],
          (rows as ScannedCode[]).map((entry) => [
            entry.code,
            listById.get(entry.listId)?.name ?? entry.listId,
            String(entry.attempts),
            formatDateTime(entry.lastAttemptAt, lang),
            entry.status === 'not-required'
              ? t('status.notRequired')
              : t('status.prohibited'),
          ]),
          `non-demandes-${Date.now()}.xlsx`,
          lang,
        )
      } else {
        await exportRowsXlsx(
          t(kind === 'returned' ? 'returned.title' : 'remaining.title'),
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
          `${kind}-${Date.now()}.xlsx`,
          lang,
        )
      }
      toast(t('toast.exportStarted'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.unknownError'), 'error')
    }
  }

  const icon = kind === 'returned' ? PackageCheck : kind === 'remaining' ? ClipboardList : PackageX
  const titleKey = TITLES[kind] as 'returned.title'
  const emptyKey = EMPTY[kind][0] as 'returned.empty'
  const emptyTextKey = EMPTY[kind][1] as 'returned.emptyText'

  return (
    <div className="page">
      <PageHeader
        title={t(titleKey)}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => void exportRows()} disabled={!rows.length}>
            <Download size={16} />
            {t('records.export')}
          </button>
        }
      />

      <div className="stats-grid">
        <StatCard icon={PackageCheck} label={t('dashboard.returned')} value={counts.returned} tone="success" />
        <StatCard icon={ClipboardList} label={t('dashboard.remaining')} value={counts.remaining} tone="warning" />
        <StatCard icon={PackageX} label={t('dashboard.notRequired')} value={counts.notRequired} tone="info" />
        <StatCard icon={ShieldAlert} label={t('dashboard.blacklist')} value={blacklist.length} tone="danger" />
      </div>

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

        {sorted.length ? (
          <div className="record-list">
            {sorted.slice(0, 400).map((row) => {
              const parcel = row as ReturnParcel
              const entry = row as ScannedCode
              const list = listById.get(parcel.listId || entry.listId)
              if (kind === 'notRequired') {
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
                  {kind === 'remaining' && blacklisted.has(parcel.code) ? (
                    <Badge tone="danger" dot>
                      {t('status.prohibited')}
                    </Badge>
                  ) : (
                    <ParcelStatusBadge status={parcel.status} />
                  )}
                  {kind === 'returned' && parcel.status === 'returned' ? (
                    <button
                      type="button"
                      className="icon-btn danger"
                      title={t('records.correction')}
                      onClick={() => setCorrection(parcel)}
                    >
                      <ShieldAlert size={16} />
                    </button>
                  ) : null}
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
          <EmptyState icon={icon} title={t(emptyKey)} text={t(emptyTextKey)} />
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
