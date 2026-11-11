import { useMemo, useState } from 'react'
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  ListChecks,
  PlayCircle,
  Users,
} from 'lucide-react'
import type { SessionReportSnapshot } from '../types'
import { useStore } from '../store/useStore'
import { useI18n, errorKey } from '../i18n'
import {
  buildListComparison,
  buildSessionReport,
  computeEmployeeStats,
  sessionActivity,
} from '../lib/stats'
import { exportReportCsv, exportReportTxt, exportReportXlsx } from '../lib/export'
import { formatDateTime, formatPercent } from '../lib/utils'
import {
  Badge,
  EmptyState,
  Modal,
  PageHeader,
  ProgressBar,
  Section,
  Segmented,
  StatCard,
} from '../components/ui'
import { SessionStatusBadge } from '../components/StatusBadge'
import { toast } from '../components/Toast'

export function ReportsPage() {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const events = useStore((state) => state.events)
  const blacklist = useStore((state) => state.blacklist)
  const sessions = useStore((state) => state.sessions)
  const employees = useStore((state) => state.employees)
  const audit = useStore((state) => state.audit)
  const closeSession = useStore((state) => state.closeSession)

  const [listFilter, setListFilter] = useState<'all' | string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [compareListId, setCompareListId] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const data = useMemo(
    () => ({ lists, parcels, registry, events, blacklist, sessions, employees, audit }),
    [lists, parcels, registry, events, blacklist, sessions, employees, audit],
  )

  const filteredSessions = useMemo(
    () =>
      sessions
        .filter((session) => listFilter === 'all' || session.listId === listFilter)
        .filter((session) => statusFilter === 'all' || session.status === statusFilter)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [sessions, listFilter, statusFilter],
  )

  const comparison = useMemo(
    () => (compareListId ? buildListComparison(compareListId, data) : null),
    [compareListId, data],
  )
  const employeeStats = useMemo(() => computeEmployeeStats(data), [data])

  const selected = sessions.find((session) => session.id === selectedId) ?? null
  const selectedReport: SessionReportSnapshot | null = selected
    ? selected.report ??
      buildSessionReport(
        selected,
        lists.find((list) => list.id === selected.listId),
        data,
        new Date().toISOString(),
      )
    : null
  const selectedEvents = selected
    ? events.filter((event) => event.sessionId === selected.id)
    : []

  const endSelected = () => {
    if (!selected) return
    const result = closeSession(selected.id)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.sessionClosed'))
  }

  const exportCsv = () => {
    if (!selectedReport) return
    exportReportCsv(selectedReport, selectedEvents, lang)
    toast(t('toast.exportStarted'))
  }

  const exportTxt = () => {
    if (!selectedReport) return
    exportReportTxt(selectedReport, lang)
    toast(t('toast.exportStarted'))
  }

  const exportXlsx = async () => {
    if (!selectedReport) return
    try {
      await exportReportXlsx(selectedReport, parcels, selectedEvents, lang)
      toast(t('toast.exportStarted'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.unknownError'), 'error')
    }
  }

  return (
    <div className="page">
      <PageHeader title={t('reports.title')} />

      <Section title={t('reports.compare')} className="compare-card">
        <p className="hint">{t('reports.compareHint')}</p>
        <select
          className="input compact-select"
          value={compareListId}
          onChange={(event) => setCompareListId(event.target.value)}
        >
          <option value="">{t('reports.selectList')}</option>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>

        {comparison ? (
          <>
            <div className="stats-grid report-stats">
              <StatCard icon={ListChecks} label={t('reports.totalRequired')} value={comparison.stats.total} tone="info" />
              <StatCard icon={BarChart3} label={t('reports.returnedCount')} value={comparison.stats.returned} tone="success" />
              <StatCard icon={PlayCircle} label={t('reports.remainingCount')} value={comparison.stats.remaining} tone="warning" />
              <StatCard icon={FileText} label={t('reports.unrequested')} value={comparison.unrequested.length} tone="danger" />
            </div>
            <ProgressBar
              value={comparison.stats.completion}
              label={
                <span>
                  {comparison.list.name} — {formatPercent(comparison.stats.completion, lang)}
                </span>
              }
              tone={comparison.stats.completion >= 1 ? 'success' : 'accent'}
            />
            <div className="report-flags">
              <Badge tone="warning">{t('reports.duplicates')} : {comparison.repeatedAttempts}</Badge>
              <Badge tone="danger">{t('reports.blacklistAttempts')} : {comparison.blacklistedScans}</Badge>
              <Badge tone="info">{t('reports.otherList')} : {comparison.otherListAttempts}</Badge>
              <Badge tone="neutral">{t('reports.sessionScans')} : {comparison.sessionScans}</Badge>
            </div>
          </>
        ) : null}
      </Section>

      <div className="section-head">
        <h2>{t('reports.sessions')}</h2>
        <div className="toolbar compact">
          <select className="input compact-select" value={listFilter} onChange={(event) => setListFilter(event.target.value)}>
            <option value="all">{t('search.allLists')}</option>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
          <Segmented
            value={statusFilter}
            options={[
              { value: 'all', label: t('common.all') },
              { value: 'open', label: t('reports.open') },
              { value: 'closed', label: t('reports.closed') },
            ]}
            onChange={setStatusFilter}
          />
        </div>
      </div>

      <Section>
        {filteredSessions.length ? (
          <div className="session-list">
            {filteredSessions.map((session) => {
              const report = session.report
              const activity = sessionActivity(session.id, events)
              return (
                <div className="report-row" key={session.id}>
                  <div className="report-row-main">
                    <div className="session-title">
                      <strong>{session.listName}</strong>
                      <SessionStatusBadge status={session.status} />
                    </div>
                    <small>
                      {session.id} · {session.employeeName || t('session.noEmployee')} ·{' '}
                      {formatDateTime(session.startedAt, lang)}
                      {session.endedAt ? ` → ${formatDateTime(session.endedAt, lang)}` : ''}
                    </small>
                    <div className="session-chips">
                      <span>{activity.scans} {t('reports.scans')}</span>
                      <span>{activity.accepted} {t('reports.accepted')}</span>
                      {report ? (
                        <span>{formatPercent(report.completion, lang)} {t('reports.completion')}</span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setSelectedId(session.id)}
                  >
                    <FileSpreadsheet size={15} />
                    {t('reports.report')}
                  </button>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState icon={BarChart3} title={t('reports.noSessions')} text={t('reports.noSessionsText')} />
        )}
      </Section>

      <Section title={t('reports.employeeStats')}>
        {employeeStats.length ? (
          <div className="employee-stats">
            <div className="employee-stats-head">
              <span>{t('reports.employee')}</span>
              <span>{t('employees.sessions')}</span>
              <span>{t('employees.scans')}</span>
              <span>{t('employees.accepted')}</span>
            </div>
            {employeeStats.map((row) => (
              <div className="employee-stats-row" key={row.employeeId}>
                <strong>
                  <Users size={15} /> {row.name}
                </strong>
                <span>{row.sessions}</span>
                <span>{row.scans}</span>
                <span>{row.accepted}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Users} title={t('employees.empty')} text={t('employees.emptyText')} />
        )}
      </Section>

      <Modal
        open={Boolean(selected && selectedReport)}
        onClose={() => setSelectedId(null)}
        title={t('reports.report')}
        subtitle={selected ? `${selected.listName} · ${selected.id}` : undefined}
        icon={<BarChart3 size={20} />}
        size="md"
        footer={
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportCsv}>
              <Download size={15} /> CSV
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={exportTxt}>
              <FileText size={15} /> TXT
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void exportXlsx()}>
              <FileSpreadsheet size={15} /> XLSX
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setSelectedId(null)}>
              {t('common.close')}
            </button>
          </>
        }
      >
        {selected && selectedReport ? (
          <>
            <div className="report-summary">
              <div>
                <span>{t('reports.totalRequired')}</span>
                <strong>{selectedReport.listTotal}</strong>
              </div>
              <div className="good">
                <span>{t('reports.returnedCount')}</span>
                <strong>{selectedReport.listReturned}</strong>
              </div>
              <div className="warn">
                <span>{t('reports.remainingCount')}</span>
                <strong>{selectedReport.listRemaining}</strong>
              </div>
              <div>
                <span>{t('reports.completion')}</span>
                <strong>{formatPercent(selectedReport.completion, lang)}</strong>
              </div>
              <div>
                <span>{t('reports.sessionScans')}</span>
                <strong>{selectedReport.sessionScans}</strong>
              </div>
              <div className="good">
                <span>{t('reports.accepted')}</span>
                <strong>{selectedReport.sessionAccepted}</strong>
              </div>
              <div className="warn">
                <span>{t('reports.unrequested')}</span>
                <strong>{selectedReport.unrequested}</strong>
              </div>
              <div className="dangerStats">
                <span>{t('reports.blacklistAttempts')}</span>
                <strong>{selectedReport.blacklistedAttempts}</strong>
              </div>
              <div className="warn">
                <span>{t('reports.duplicates')}</span>
                <strong>{selectedReport.duplicateAttempts}</strong>
              </div>
              <div>
                <span>{t('reports.otherList')}</span>
                <strong>{selectedReport.otherListAttempts}</strong>
              </div>
            </div>
            <div className="report-meta">
              <span>{t('reports.started')} : {formatDateTime(selectedReport.startedAt, lang)}</span>
              <span>{t('reports.ended')} : {formatDateTime(selectedReport.endedAt, lang)}</span>
            </div>
            {selected.status === 'open' ? (
              <div className="inline-alert warning">
                {t('reports.currentSession')} — {t('session.endText')}
                <button type="button" className="btn btn-danger btn-sm" onClick={endSelected}>
                  {t('reports.endSession')}
                </button>
              </div>
            ) : null}
            {selectedEvents.length ? (
              <div className="report-events">
                {selectedEvents.slice(0, 20).map((event) => (
                  <div key={event.id} className="report-event-row">
                    <span className="mono">{event.code}</span>
                    <span>{event.result}</span>
                    <span>{formatDateTime(event.at, lang)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>
    </div>
  )
}
