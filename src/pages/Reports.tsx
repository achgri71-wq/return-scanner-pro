import { useMemo, useState } from 'react'
import {
  BarChart3,
  FileText,
  ListChecks,
  PlayCircle,
  Users,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useI18n } from '../i18n'
import {
  buildListComparison,
  computeEmployeeStats,
} from '../lib/stats'
import { formatPercent } from '../lib/utils'
import {
  Badge,
  EmptyState,
  PageHeader,
  ProgressBar,
  Section,
  StatCard,
} from '../components/ui'

export function ReportsPage() {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const events = useStore((state) => state.events)
  const blacklist = useStore((state) => state.blacklist)
  const employees = useStore((state) => state.employees)
  const audit = useStore((state) => state.audit)

  const [compareListId, setCompareListId] = useState('')

  const data = useMemo(
    () => ({ lists, parcels, registry, events, blacklist, employees, audit }),
    [lists, parcels, registry, events, blacklist, employees, audit],
  )

  const comparison = useMemo(
    () => (compareListId ? buildListComparison(compareListId, data) : null),
    [compareListId, data],
  )
  const employeeStats = useMemo(() => computeEmployeeStats(data), [data])

  return (
    <div className="page">
      <PageHeader title={t('reports.title')} />

      <Section title={t('reports.compare')} className="compare-card">
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
              <Badge tone="neutral">{t('reports.scans')} : {comparison.totalScans}</Badge>
            </div>
          </>
        ) : null}
      </Section>

      <Section title={t('reports.employeeStats')}>
        {employeeStats.length ? (
          <div className="employee-stats">
            <div className="employee-stats-head">
              <span>{t('reports.employee')}</span>
              <span>{t('employees.scans')}</span>
              <span>{t('employees.accepted')}</span>
            </div>
            {employeeStats.map((row) => (
              <div className="employee-stats-row" key={row.employeeId}>
                <strong>
                  <Users size={15} /> {row.name}
                </strong>
                <span>{row.scans}</span>
                <span>{row.accepted}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Users} title={t('employees.empty')} text={t('employees.emptyText')} />
        )}
      </Section>
    </div>
  )
}
