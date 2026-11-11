import { useMemo, useState } from 'react'
import {
  CalendarClock,
  Download,
  Filter,
  History,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import type { AuditAction } from '../types'
import { useStore } from '../store/useStore'
import { useI18n, type TKey } from '../i18n'
import { exportAuditCsv } from '../lib/export'
import { formatDateTime } from '../lib/utils'
import {
  Badge,
  EmptyState,
  PageHeader,
  SearchField,
  Section,
  StatCard,
  type Tone,
} from '../components/ui'
import { toast } from '../components/Toast'

const ACTION_KEYS: Record<AuditAction, TKey> = {
  'list-create': 'audit.action.list-create',
  'list-rename': 'audit.action.list-rename',
  'list-import': 'audit.action.list-import',
  'list-merge': 'audit.action.list-merge',
  'list-replace': 'audit.action.list-replace',
  'list-update': 'audit.action.list-update',
  'list-close': 'audit.action.list-close',
  'list-reopen': 'audit.action.list-reopen',
  'list-archive': 'audit.action.list-archive',
  'return-correction': 'audit.action.return-correction',
  'blacklist-add': 'audit.action.blacklist-add',
  'blacklist-update': 'audit.action.blacklist-update',
  'blacklist-remove': 'audit.action.blacklist-remove',
  'blacklist-import': 'audit.action.blacklist-import',
  'employee-create': 'audit.action.employee-create',
  'employee-update': 'audit.action.employee-update',
  'backup-export': 'audit.action.backup-export',
  'backup-import': 'audit.action.backup-import',
  'settings-update': 'audit.action.settings-update',
}

const ACTION_TONE: Record<AuditAction, Tone> = {
  'list-create': 'info',
  'list-rename': 'neutral',
  'list-import': 'info',
  'list-merge': 'accent',
  'list-replace': 'warning',
  'list-update': 'neutral',
  'list-close': 'warning',
  'list-reopen': 'success',
  'list-archive': 'muted',
  'return-correction': 'danger',
  'blacklist-add': 'danger',
  'blacklist-update': 'warning',
  'blacklist-remove': 'neutral',
  'blacklist-import': 'danger',
  'employee-create': 'info',
  'employee-update': 'neutral',
  'backup-export': 'success',
  'backup-import': 'accent',
  'settings-update': 'neutral',
}

const ALL_ACTIONS = Object.keys(ACTION_KEYS) as AuditAction[]

export function AuditPage() {
  const { t, lang } = useI18n()
  const audit = useStore((state) => state.audit)

  const [query, setQuery] = useState('')
  const [action, setAction] = useState<'all' | AuditAction>('all')
  const [actor, setActor] = useState('all')

  const actors = useMemo(
    () => [...new Set(audit.map((entry) => entry.actor))].sort((a, b) => a.localeCompare(b)),
    [audit],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return audit
      .filter((entry) => action === 'all' || entry.action === action)
      .filter((entry) => actor === 'all' || entry.actor === actor)
      .filter(
        (entry) =>
          !needle ||
          entry.detail.toLocaleLowerCase().includes(needle) ||
          entry.actor.toLocaleLowerCase().includes(needle) ||
          (entry.target ?? '').toLocaleLowerCase().includes(needle) ||
          entry.action.toLocaleLowerCase().includes(needle),
      )
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [audit, query, action, actor])

  const lastEntry = useMemo(
    () => [...audit].sort((a, b) => b.at.localeCompare(a.at))[0],
    [audit],
  )

  const exportJournal = () => {
    if (!visible.length) {
      toast(t('toast.nothingToExport'), 'warning')
      return
    }
    exportAuditCsv(visible, lang)
    toast(t('toast.exportStarted'))
  }

  return (
    <div className="page">
      <PageHeader
        title={t('audit.title')}
        actions={
          <button type="button" className="btn btn-secondary" onClick={exportJournal} disabled={!visible.length}>
            <Download size={16} />
            {t('audit.export')}
          </button>
        }
      />

      <div className="stats-grid">
        <StatCard
          icon={History}
          label={t('audit.title')}
          value={audit.length}
          hint={t('audit.detail')}
          tone="info"
        />
        <StatCard
          icon={UserRound}
          label={t('audit.actor')}
          value={actors.length}
          hint={actors.slice(0, 3).join(' · ') || t('common.none')}
          tone="accent"
        />
        <StatCard
          icon={CalendarClock}
          label={t('common.updated')}
          value={lastEntry ? formatDateTime(lastEntry.at, lang) : '—'}
          hint={lastEntry ? t(ACTION_KEYS[lastEntry.action]) : t('common.noData')}
          tone="neutral"
        />
      </div>

      <Section>
        <div className="toolbar audit-toolbar">
          <SearchField value={query} onChange={setQuery} placeholder={t('audit.search')} />
          <select
            className="input compact-select"
            value={action}
            onChange={(event) => setAction(event.target.value as 'all' | AuditAction)}
            aria-label={t('audit.filter')}
          >
            <option value="all">{t('audit.allActions')}</option>
            {ALL_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {t(ACTION_KEYS[value])}
              </option>
            ))}
          </select>
          <select
            className="input compact-select"
            value={actor}
            onChange={(event) => setActor(event.target.value)}
            aria-label={t('audit.actor')}
          >
            <option value="all">{t('common.all')}</option>
            {actors.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {query || action !== 'all' || actor !== 'all' ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQuery('')
                setAction('all')
                setActor('all')
              }}
            >
              <Filter size={15} />
              {t('common.reset')}
            </button>
          ) : null}
          <Badge tone="neutral" dot>
            {visible.length} / {audit.length}
          </Badge>
        </div>

        {visible.length ? (
          <div className="audit-list">
            {visible.map((entry) => (
              <div className="audit-row" key={entry.id}>
                <span className={`audit-dot tone-${ACTION_TONE[entry.action]}`} />
                <div className="audit-main">
                  <div className="audit-title">
                    <Badge tone={ACTION_TONE[entry.action]}>{t(ACTION_KEYS[entry.action])}</Badge>
                    <strong>{entry.detail}</strong>
                  </div>
                  <small>
                    <span>
                      <UserRound size={13} /> {entry.actor}
                    </span>
                    <span>
                      <CalendarClock size={13} /> {formatDateTime(entry.at, lang)}
                    </span>
                    {entry.target ? (
                      <span className="mono">
                        <ShieldCheck size={13} /> {entry.target}
                      </span>
                    ) : null}
                  </small>
                  {entry.before || entry.after ? (
                    <div className="audit-diff">
                      {entry.before ? (
                        <span>
                          <b>{t('audit.before')}</b> {entry.before}
                        </span>
                      ) : null}
                      {entry.after ? (
                        <span>
                          <b>{t('audit.after')}</b> {entry.after}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title={audit.length ? t('lists.noMatch') : t('audit.empty')}
            text={audit.length ? t('lists.noMatchText') : t('audit.emptyText')}
            action={
              audit.length ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setQuery('')
                    setAction('all')
                    setActor('all')
                  }}
                >
                  {t('common.reset')}
                </button>
              ) : undefined
            }
          />
        )}
      </Section>
    </div>
  )
}
