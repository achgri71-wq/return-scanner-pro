import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  BadgeAlert,
  ClipboardList,
  CloudDownload,
  ListChecks,
  PackageCheck,
  PlayCircle,
  ScanLine,
  Sparkles,
} from 'lucide-react'
import { useActiveList, useStore } from '../store/useStore'
import { useI18n } from '../i18n'
import { computeDashboardStats, computeListStats, blacklistCodeSet } from '../lib/stats'
import { downloadJson, formatDateTime, formatNumber, formatPercent, relativeTime, sanitizeFilename } from '../lib/utils'
import { Badge, EmptyState, PageHeader, ProgressBar, Section, StatCard } from '../components/ui'
import { ScanResultBadge } from '../components/StatusBadge'
import { StartSessionDialog } from '../components/StartSessionDialog'
import { toast } from '../components/Toast'

export function DashboardPage() {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const events = useStore((state) => state.events)
  const blacklist = useStore((state) => state.blacklist)
  const sessions = useStore((state) => state.sessions)
  const employees = useStore((state) => state.employees)
  const audit = useStore((state) => state.audit)
  const settings = useStore((state) => state.settings)
  const createBackup = useStore((state) => state.createBackup)
  const markBackupExported = useStore((state) => state.markBackupExported)
  const activeList = useActiveList()
  const openSession = useStore((state) =>
    state.sessions.find((session) => session.status === 'open'),
  )
  const [sessionList, setSessionList] = useState<string | null>(null)

  const data = useMemo(
    () => ({ lists, parcels, registry, events, blacklist, sessions, employees, audit }),
    [lists, parcels, registry, events, blacklist, sessions, employees, audit],
  )
  const stats = useMemo(() => computeDashboardStats(data), [data])
  const activeStats = useMemo(
    () =>
      activeList
        ? computeListStats(activeList.id, parcels, blacklistCodeSet(blacklist))
        : null,
    [activeList, parcels, blacklist],
  )

  const backupDue = useMemo(() => {
    if (!lists.length) return false
    if (!settings.lastBackupAt) return true
    const days = (Date.now() - new Date(settings.lastBackupAt).getTime()) / 86_400_000
    return days >= settings.backupReminderDays
  }, [lists.length, settings.lastBackupAt, settings.backupReminderDays])

  const exportBackup = () => {
    const payload = createBackup()
    downloadJson(payload, `returnscanner-backup-${sanitizeFilename(new Date().toISOString().slice(0, 10))}.json`)
    markBackupExported()
    toast(t('toast.exportStarted'))
  }

  const progress = activeStats ? activeStats.completion : 0

  return (
    <div className="page dashboard">
      <PageHeader
        eyebrow={t('nav.home')}
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
      />

      {backupDue ? (
        <div className="callout warning">
          <span className="callout-icon">
            <AlertCircle size={20} />
          </span>
          <div className="callout-text">
            <strong>{t('dashboard.backupTitle')}</strong>
            <p>
              {t('dashboard.backupText', {
                date: settings.lastBackupAt
                  ? formatDateTime(settings.lastBackupAt, lang)
                  : t('backups.never'),
              })}
            </p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportBackup}>
            <CloudDownload size={16} />
            {t('dashboard.backupNow')}
          </button>
        </div>
      ) : null}

      <div className="stats-grid">
        <StatCard
          icon={ListChecks}
          label={t('dashboard.required')}
          value={formatNumber(stats.totalRequired, lang)}
          hint={t('lists.title')}
          tone="info"
        />
        <StatCard
          icon={PackageCheck}
          label={t('dashboard.returned')}
          value={formatNumber(stats.totalReturned, lang)}
          hint={formatPercent(
            stats.totalRequired ? stats.totalReturned / stats.totalRequired : 0,
            lang,
          )}
          tone="success"
        />
        <StatCard
          icon={ClipboardList}
          label={t('dashboard.remaining')}
          value={formatNumber(stats.totalRemaining, lang)}
          hint={t('remaining.title')}
          tone="warning"
        />
        <StatCard
          icon={BadgeAlert}
          label={t('dashboard.blacklist')}
          value={formatNumber(stats.blacklisted, lang)}
          hint={t('blacklist.title')}
          tone="danger"
        />
      </div>

      <Section
        title={t('dashboard.activeList')}
        actions={
          activeList ? (
            <Link to={`/lists/${activeList.id}`} className="link-btn">
              {t('common.details')} <ArrowRight size={14} />
            </Link>
          ) : null
        }
        className="active-list-card"
      >
        {activeList && activeStats ? (
          <>
            <div className="active-list-head">
              <div>
                <div className="active-list-name">{activeList.name}</div>
                <div className="active-list-meta">
                  <Badge tone="success" dot>
                    {t('status.active')}
                  </Badge>
                  {openSession ? (
                    <Badge tone="info" dot>
                      {openSession.employeeName || t('dashboard.openSession')}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="active-list-progress">
                <strong>{formatPercent(progress, lang)}</strong>
                <span>
                  {t('dashboard.progressOf', {
                    done: activeStats.returned,
                    total: activeStats.total,
                  })}
                </span>
              </div>
            </div>
            <ProgressBar value={progress} tone={progress >= 1 ? 'success' : 'accent'} />
            <div className="hero-cta-row">
              {openSession ? (
                <Link to="/scan" className="btn btn-primary hero-cta">
                  <ScanLine size={19} />
                  {t('dashboard.resumeSession')}
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary hero-cta"
                  onClick={() => setSessionList(activeList.id)}
                >
                  <PlayCircle size={19} />
                  {t('dashboard.startSession')}
                </button>
              )}
            </div>
          </>
        ) : (
          <EmptyState
            icon={Sparkles}
            title={t('dashboard.noActive')}
            text={t('dashboard.noActiveText')}
            action={
              <Link to="/lists" className="btn btn-primary hero-cta">
                <ListChecks size={19} />
                {t('dashboard.chooseList')}
              </Link>
            }
          />
        )}
      </Section>

      {!lists.length ? (
        <Section title={t('dashboard.startHere')}>
          <div className="steps">
            {[t('dashboard.startStep1'), t('dashboard.startStep2'), t('dashboard.startStep3')].map(
              (step, index) => (
                <div className="step" key={step}>
                  <span className="step-number">{index + 1}</span>
                  <span>{step}</span>
                </div>
              ),
            )}
          </div>
          <Link to="/lists" className="btn btn-primary">
            <ListChecks size={16} />
            {t('dashboard.chooseList')}
          </Link>
        </Section>
      ) : null}

      <Section
        title={t('dashboard.recent')}
        actions={
          events.length ? (
            <Link to="/registry" className="link-btn">
              {t('common.viewAll')} <ArrowRight size={14} />
            </Link>
          ) : null
        }
      >
        {stats.recentEvents.length ? (
          <div className="activity-list">
            {stats.recentEvents.map((event) => (
              <div className="activity-row" key={event.id}>
                <span className={`activity-dot result-${event.result}`} />
                <div className="activity-main">
                  <strong className="mono">{event.code}</strong>
                  <small>
                    {event.listName} · {relativeTime(event.at, lang)}
                    {event.employeeName ? ` · ${event.employeeName}` : ''}
                  </small>
                </div>
                <ScanResultBadge result={event.result} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={ScanLine} title={t('dashboard.noActivity')} />
        )}
      </Section>

      <StartSessionDialog
        open={Boolean(sessionList)}
        listId={sessionList ?? undefined}
        onClose={() => setSessionList(null)}
      />
    </div>
  )
}
