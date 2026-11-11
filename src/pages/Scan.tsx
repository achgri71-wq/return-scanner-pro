import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BadgeAlert,
  Camera,
  CheckCircle2,
  ClipboardList,
  CloudUpload,
  ListChecks,
  PackageCheck,
  PackageX,
  PlayCircle,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react'
import type { ScanOutcome, ScanOutcomeStatus, ScanSession } from '../types'
import { useActiveList, useStore } from '../store/useStore'
import { useI18n, errorKey, type Translate, type TKey } from '../i18n'
import { useHidScanner } from '../hooks/useHidScanner'
import { blacklistCodeSet, computeListStats, sessionActivity } from '../lib/stats'
import { exportReportCsv, exportReportTxt, exportReportXlsx } from '../lib/export'
import { formatPercent, relativeTime } from '../lib/utils'
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Modal,
  PageHeader,
  ProgressBar,
  Section,
  Spinner,
  StatCard,
} from '../components/ui'
import { OutcomeBadge, ScanResultBadge } from '../components/StatusBadge'
import { CameraScanner } from '../components/CameraScanner'
import { StartSessionDialog } from '../components/StartSessionDialog'
import { toast } from '../components/Toast'

const RESULT_ICONS: Record<ScanOutcomeStatus, typeof CheckCircle2> = {
  accepted: CheckCircle2,
  duplicate: RotateCcw,
  blacklisted: ShieldAlert,
  'not-required': PackageX,
  'other-list': ListChecks,
  invalid: XCircle,
  'no-list': ListChecks,
  'list-closed': XCircle,
  'no-session': PlayCircle,
  ignored: ScanLine,
}

const RESULT_TEXT_KEYS: Record<ScanOutcomeStatus, [TKey, TKey]> = {
  accepted: ['scan.resultAccepted', 'scan.resultAcceptedText'],
  duplicate: ['scan.resultDuplicate', 'scan.resultDuplicateText'],
  blacklisted: ['scan.resultBlacklisted', 'scan.resultBlacklistedText'],
  'not-required': ['scan.resultNotRequired', 'scan.resultNotRequiredText'],
  'other-list': ['scan.resultOther', 'scan.resultOtherText'],
  invalid: ['scan.resultInvalid', 'scan.resultInvalidText'],
  'no-list': ['scan.resultNoList', 'scan.resultNoListText'],
  'list-closed': ['scan.resultClosed', 'scan.resultClosedText'],
  'no-session': ['scan.resultNoSession', 'scan.resultNoSessionText'],
  ignored: ['scan.waiting', 'scan.waiting'],
}

export function ScanPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const blacklist = useStore((state) => state.blacklist)
  const events = useStore((state) => state.events)
  const sessions = useStore((state) => state.sessions)
  const settings = useStore((state) => state.settings)
  const scan = useStore((state) => state.scan)
  const switchList = useStore((state) => state.switchList)
  const closeSession = useStore((state) => state.closeSession)
  const reopenList = useStore((state) => state.reopenList)
  const lastOutcome = useStore((state) => state.lastOutcome)
  const lastOutcomeSeq = useStore((state) => state.lastOutcomeSeq)
  const activeList = useActiveList()

  const [value, setValue] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [showSession, setShowSession] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [closedReport, setClosedReport] = useState<ScanSession['report'] | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const openSession = sessions.find(
    (session) => session.status === 'open' && session.listId === activeList?.id,
  )
  const anyOpen = sessions.find((session) => session.status === 'open')
  const blacklisted = useMemo(() => blacklistCodeSet(blacklist), [blacklist])
  const stats = useMemo(
    () => (activeList ? computeListStats(activeList.id, parcels, blacklisted) : null),
    [activeList, parcels, blacklisted],
  )
  const activity = useMemo(
    () => (openSession ? sessionActivity(openSession.id, events) : null),
    [openSession, events],
  )
  const sessionEvents = useMemo(
    () =>
      openSession
        ? events.filter((event) => event.sessionId === openSession.id).slice(0, 12)
        : [],
    [events, openSession],
  )

  const focusInput = useCallback(() => {
    if (!settings.autoFocus) return
    window.setTimeout(() => {
      if (!document.querySelector('.modal-backdrop')) inputRef.current?.focus()
    }, 20)
  }, [settings.autoFocus])

  useEffect(() => {
    focusInput()
  }, [focusInput, openSession?.id])

  const handleScan = useCallback(
    (raw: string, source: 'camera' | 'manual' | 'hid') => {
      if (!raw.trim()) return
      const outcome = scan(raw, source)
      setValue('')
      if (outcome.status === 'no-session') toast(t('toast.sessionNeeded'), 'warning')
      focusInput()
    },
    [scan, focusInput, t],
  )

  useHidScanner(
    (code) => {
      if (openSession) handleScan(code, 'hid')
    },
    Boolean(openSession) && !cameraOpen,
  )

  const startSession = () => {
    if (!activeList) return
    if (activeList.status === 'completed' || activeList.status === 'archived') {
      const result = reopenList(activeList.id)
      if (!result.ok) {
        toast(t(errorKey(result.error)), 'error')
        return
      }
      toast(t('toast.listReopened'))
    }
    setShowSession(true)
  }

  const doClose = () => {
    setBusy(true)
    const result = closeSession()
    setBusy(false)
    setConfirmClose(false)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    setClosedReport(result.report ?? null)
    toast(t('toast.sessionClosed'))
  }

  const chooseList = (id: string) => {
    const result = switchList(id)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.listActivated'))
  }

  const scanValue = (source: 'manual' | 'hid') => {
    if (!value.trim()) return
    handleScan(value, source)
  }

  const resultInfo = lastOutcome ? describeOutcome(lastOutcome, t) : null
  const ResultIcon = lastOutcome ? RESULT_ICONS[lastOutcome.status] : ScanLine

  return (
    <div className="page scan-page">
      <PageHeader
        title={t('scan.title')}
        actions={
          <>
            <span className={`sound-pill ${settings.sounds ? 'is-on' : 'is-off'}`}>
              {settings.sounds ? <Volume2 size={15} /> : <VolumeX size={15} />}
              {settings.sounds ? t('scan.soundOn') : t('scan.soundOff')}
            </span>
            {openSession ? (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmClose(true)}>
                {t('scan.endSession')}
              </button>
            ) : null}
          </>
        }
      />

      {activeList && stats ? (
        <div className={`scan-active-banner${openSession ? ' has-session' : ''}`}>
          <div className="scan-active-main">
            <span className="scan-active-label">{t('scan.activeList')}</span>
            <strong>{activeList.name}</strong>
            <small>
              {activeList.id} · {t('dashboard.progressOf', { done: stats.returned, total: stats.total })}
            </small>
          </div>
          <div className="scan-active-progress">
            <span>{formatPercent(stats.completion, lang)}</span>
            <ProgressBar value={stats.completion} />
          </div>
          <div className="scan-active-actions">
            {openSession ? (
              <Badge tone="success" dot>
                {openSession.employeeName || t('dashboard.openSession')}
              </Badge>
            ) : null}
            <Link to="/lists" className="btn btn-secondary btn-sm">
              {t('scan.changeList')}
            </Link>
          </div>
        </div>
      ) : null}

      {!activeList ? (
        <Section>
          <EmptyState
            icon={ListChecks}
            title={t('scan.noListTitle')}
            text={t('scan.noListText')}
            action={
              <div className="list-picker">
                {lists.filter((list) => list.status === 'new' || list.status === 'active').length ? (
                  lists
                    .filter((list) => list.status === 'new' || list.status === 'active')
                    .map((list) => (
                      <button
                        key={list.id}
                        type="button"
                        className="list-pick-btn"
                        onClick={() => chooseList(list.id)}
                      >
                        <span>{list.name}</span>
                        <Badge tone="neutral">{list.id}</Badge>
                      </button>
                    ))
                ) : (
                  <Link to="/lists" className="btn btn-primary">
                    {t('dashboard.chooseList')} <ArrowRight size={16} />
                  </Link>
                )}
              </div>
            }
          />
        </Section>
      ) : activeList.status === 'completed' || activeList.status === 'archived' ? (
        <Section>
          <EmptyState
            icon={XCircle}
            title={t('scan.listClosed')}
            text={t('scan.resultClosedText')}
            action={
              <>
                <button type="button" className="btn btn-primary" onClick={startSession}>
                  <RotateCcw size={16} />
                  {t('lists.reopen')}
                </button>
                <Link to="/lists" className="btn btn-secondary">
                  {t('scan.changeList')}
                </Link>
              </>
            }
          />
        </Section>
      ) : !openSession ? (
        <Section>
          <EmptyState
            icon={PlayCircle}
            title={t('scan.noSessionTitle')}
            text={t('scan.noSessionText')}
            action={
              <button type="button" className="btn btn-primary" onClick={startSession}>
                <PlayCircle size={16} />
                {t('scan.startSession')}
              </button>
            }
          />
        </Section>
      ) : (
        <>
          <div className="scan-layout">
            <section className="scan-main-card">
              <form
                className="scan-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  scanValue('manual')
                }}
              >
                <label className="field-label" htmlFor="scan-input">
                  {t('scan.placeholder')}
                </label>
                <div className="scan-input-row">
                  <ScanLine size={20} className="scan-input-icon" aria-hidden="true" />
                  <input
                    ref={inputRef}
                    id="scan-input"
                    className="scan-input input-mono"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={t('scan.placeholder')}
                    autoFocus={settings.autoFocus}
                    autoComplete="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    inputMode="text"
                  />
                  <button type="submit" className="btn btn-primary scan-submit" disabled={!value.trim()}>
                    {t('scan.submit')}
                  </button>
                </div>
              </form>

              <div className="scan-quick-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setCameraOpen(true)}>
                  <Camera size={17} />
                  {t('scan.camera')}
                </button>
                <span className="hint">
                  <Volume2 size={14} /> {t('scan.hidHint')}
                </span>
              </div>

              <div
                key={lastOutcomeSeq}
                className={`scan-result ${lastOutcome ? `is-${lastOutcome.status}` : 'is-idle'}`}
              >
                <span className="scan-result-icon">
                  <ResultIcon size={28} />
                </span>
                <div className="scan-result-text">
                  {lastOutcome && resultInfo ? (
                    <>
                      <div className="scan-result-head">
                        <strong>{resultInfo.title}</strong>
                        <OutcomeBadge status={lastOutcome.status} />
                      </div>
                      <p>{resultInfo.text}</p>
                      <code className="scan-result-code">{lastOutcome.code || '—'}</code>
                    </>
                  ) : (
                    <>
                      <strong>{t('scan.waiting')}</strong>
                      <p>{t('scan.hint')}</p>
                    </>
                  )}
                </div>
                {lastOutcome?.status === 'accepted' ? (
                  <span className="scan-accepted-flash" aria-hidden="true" />
                ) : null}
              </div>

              <div className="scan-session-stats">
                <div>
                  <span>{t('scan.scans')}</span>
                  <strong>{activity?.scans ?? 0}</strong>
                </div>
                <div className="good">
                  <span>{t('scan.accepted')}</span>
                  <strong>{activity?.accepted ?? 0}</strong>
                </div>
                <div className="warn">
                  <span>{t('scan.duplicates')}</span>
                  <strong>{activity?.duplicate ?? 0}</strong>
                </div>
                <div className="danger">
                  <span>{t('scan.blacklisted')}</span>
                  <strong>{activity?.blacklisted ?? 0}</strong>
                </div>
                <div>
                  <span>{t('scan.otherList')}</span>
                  <strong>{activity?.otherList ?? 0}</strong>
                </div>
                <div className="warn">
                  <span>{t('scan.notRequired')}</span>
                  <strong>{activity?.rejected ?? 0}</strong>
                </div>
              </div>
            </section>

            <aside className="scan-side">
              <div className="stats-grid scan-stats-grid">
                <StatCard icon={PackageCheck} label={t('dashboard.returned')} value={stats?.returned ?? 0} tone="success" />
                <StatCard icon={ClipboardList} label={t('dashboard.remaining')} value={stats?.remaining ?? 0} tone="warning" />
              </div>

              <Section title={t('scan.recent')} className="recent-card">
                {sessionEvents.length ? (
                  <div className="activity-list compact">
                    {sessionEvents.map((event) => (
                      <div className="activity-row" key={event.id}>
                        <span className={`activity-dot result-${event.result}`} />
                        <div className="activity-main">
                          <strong className="mono">{event.code}</strong>
                          <small>{relativeTime(event.at, lang)}</small>
                        </div>
                        <ScanResultBadge result={event.result} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={ScanLine} title={t('scan.noRecent')} />
                )}
              </Section>

              {stats && stats.completion >= 1 ? (
                <div className="callout success">
                  <span className="callout-icon">
                    <CheckCircle2 size={20} />
                  </span>
                  <div className="callout-text">
                    <strong>{t('remaining.empty')}</strong>
                    <p>{t('scan.reportSaved')}</p>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirmClose(true)}>
                    {t('scan.endSession')}
                  </button>
                </div>
              ) : null}

              <div className="callout info">
                <span className="callout-icon">
                  <CloudUpload size={20} />
                </span>
                <div className="callout-text">
                  <strong>{t('settings.autoFocus')}</strong>
                  <p>{t('scan.hint')}</p>
                </div>
              </div>
            </aside>
          </div>

          <div className="scan-mobile-nav">
            <Link to="/lists" className="btn btn-secondary">
              {t('scan.changeList')}
            </Link>
            <button type="button" className="btn btn-danger" onClick={() => setConfirmClose(true)}>
              {t('scan.endSession')}
            </button>
          </div>
        </>
      )}

      <CameraScanner
        open={cameraOpen}
        onClose={() => {
          setCameraOpen(false)
          focusInput()
        }}
        onDetect={(code) => handleScan(code, 'camera')}
      />

      <StartSessionDialog
        open={showSession}
        listId={activeList?.id}
        onClose={() => setShowSession(false)}
        onStarted={focusInput}
      />

      <ConfirmDialog
        open={confirmClose}
        danger
        title={t('scan.endConfirm')}
        message={t('scan.endText')}
        confirmLabel={t('scan.endSession')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        onClose={() => setConfirmClose(false)}
        onConfirm={doClose}
      />

      <Modal
        open={Boolean(closedReport)}
        onClose={() => setClosedReport(null)}
        title={t('scan.reportTitle')}
        subtitle={closedReport?.listName}
        icon={<ClipboardList size={20} />}
        size="md"
        footer={
          <>
            {closedReport ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => closedReport && exportReportCsv(closedReport, [], lang)}
                >
                  CSV
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => closedReport && exportReportTxt(closedReport, lang)}
                >
                  TXT
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    closedReport &&
                    void exportReportXlsx(
                      closedReport,
                      parcels,
                      events.filter((event) => event.sessionId === closedReport.sessionId),
                      lang,
                    )
                  }
                >
                  XLSX
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setClosedReport(null)
                navigate('/reports')
              }}
            >
              {t('nav.reports')} <ArrowRight size={15} />
            </button>
          </>
        }
      >
        {closedReport ? (
          <div className="report-summary">
            <div>
              <span>{t('reports.totalRequired')}</span>
              <strong>{closedReport.listTotal}</strong>
            </div>
            <div className="good">
              <span>{t('reports.returnedCount')}</span>
              <strong>{closedReport.listReturned}</strong>
            </div>
            <div className="warn">
              <span>{t('reports.remainingCount')}</span>
              <strong>{closedReport.listRemaining}</strong>
            </div>
            <div>
              <span>{t('reports.completion')}</span>
              <strong>{formatPercent(closedReport.completion, lang)}</strong>
            </div>
            <div>
              <span>{t('reports.sessionScans')}</span>
              <strong>{closedReport.sessionScans}</strong>
            </div>
            <div className="good">
              <span>{t('reports.accepted')}</span>
              <strong>{closedReport.sessionAccepted}</strong>
            </div>
            <div className="warn">
              <span>{t('reports.unrequested')}</span>
              <strong>{closedReport.unrequested}</strong>
            </div>
            <div className="dangerStats">
              <span>{t('reports.blacklistAttempts')}</span>
              <strong>{closedReport.blacklistedAttempts}</strong>
            </div>
            <div className="warn">
              <span>{t('reports.duplicates')}</span>
              <strong>{closedReport.duplicateAttempts}</strong>
            </div>
            <div>
              <span>{t('reports.otherList')}</span>
              <strong>{closedReport.otherListAttempts}</strong>
            </div>
          </div>
        ) : null}
      </Modal>

      {busy ? <Spinner label={t('common.loading')} /> : null}

      {anyOpen && !openSession ? (
        <div className="inline-alert warning">
          <AlertTriangle size={16} />
          {anyOpen.listName} — {t('scan.resultNoSessionText')}
        </div>
      ) : null}

      {lastOutcome?.status === 'blacklisted' ? (
        <div className="scan-footnote">
          <BadgeAlert size={14} /> {t('blacklist.danger')}
        </div>
      ) : null}
    </div>
  )
}

function describeOutcome(
  outcome: ScanOutcome,
  t: Translate,
): { title: string; text: string } {
  const keys = RESULT_TEXT_KEYS[outcome.status]
  const title = t(keys[0])
  const reason = outcome.reason ? ` — ${outcome.reason}` : ''
  let text = t(keys[1], {
    code: outcome.code || '—',
    reason,
    list: outcome.otherListName ?? '',
  })
  if (outcome.status === 'other-list' && !outcome.otherListName) text = t('scan.resultOtherText', { code: outcome.code, list: '—' })
  return { title, text }
}
