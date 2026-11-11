import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BadgeAlert,
  Camera,
  CheckCircle2,
  ClipboardList,
  CloudDownload,
  ListChecks,
  PackageCheck,
  PackageX,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  Trash2,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react'
import type { ScanOutcome, ScanOutcomeStatus } from '../types'
import { useActiveList, useStore } from '../store/useStore'
import { useI18n, errorKey, type Translate, type TKey } from '../i18n'
import { useHidScanner } from '../hooks/useHidScanner'
import { blacklistCodeSet, computeListStats, eventActivity } from '../lib/stats'
import { formatDateTime, formatPercent, downloadJson, relativeTime, sanitizeFilename } from '../lib/utils'
import {
  Badge,
  EmptyState,
  PageHeader,
  ProgressBar,
  Section,
  StatCard,
} from '../components/ui'
import { OutcomeBadge, ScanResultBadge } from '../components/StatusBadge'
import { CameraScanner } from '../components/CameraScanner'
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
  ignored: ['scan.waiting', 'scan.waiting'],
}

export function ScanPage() {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const blacklist = useStore((state) => state.blacklist)
  const events = useStore((state) => state.events)
  const settings = useStore((state) => state.settings)
  const createBackup = useStore((state) => state.createBackup)
  const markBackupExported = useStore((state) => state.markBackupExported)
  const scan = useStore((state) => state.scan)
  const switchList = useStore((state) => state.switchList)
  const reopenList = useStore((state) => state.reopenList)
  const lastOutcome = useStore((state) => state.lastOutcome)
  const lastOutcomeSeq = useStore((state) => state.lastOutcomeSeq)
  const activeList = useActiveList()

  const [value, setValue] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const blacklisted = useMemo(() => blacklistCodeSet(blacklist), [blacklist])
  const stats = useMemo(
    () => (activeList ? computeListStats(activeList.id, parcels, blacklisted) : null),
    [activeList, parcels, blacklisted],
  )
  const listEvents = useMemo(
    () => (activeList ? events.filter((event) => event.listId === activeList.id) : []),
    [events, activeList],
  )
  const activity = useMemo(() => eventActivity(listEvents), [listEvents])
  const recentEvents = useMemo(() => listEvents.slice(0, 12), [listEvents])

  const focusInput = useCallback(() => {
    if (!settings.autoFocus) return
    window.setTimeout(() => {
      if (!document.querySelector('.modal-backdrop')) inputRef.current?.focus()
    }, 20)
  }, [settings.autoFocus])

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

  useEffect(() => {
    focusInput()
  }, [focusInput])

  const handleScan = useCallback(
    (raw: string, source: 'camera' | 'manual' | 'hid') => {
      if (!raw.trim()) return
      const outcome = scan(raw, source)
      setValue('')
      if (outcome.status === 'no-list') toast(t('toast.listNeeded'), 'warning')
      focusInput()
    },
    [scan, focusInput, t],
  )

  useHidScanner(
    (code) => {
      handleScan(code, 'hid')
    },
    !cameraOpen,
  )

  const reopenCurrentList = () => {
    if (!activeList) return
    const result = reopenList(activeList.id)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.listReopened'))
  }

  const chooseList = (id: string) => {
    const result = switchList(id)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.listActivated'))
  }

  const deleteRecentEvent = (id: string) => {
    const result = useStore.getState().deleteEvent(id)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.eventDeleted'))
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
          <span className={`sound-pill ${settings.sounds ? 'is-on' : 'is-off'}`}>
            {settings.sounds ? <Volume2 size={15} /> : <VolumeX size={15} />}
            {settings.sounds ? t('scan.soundOn') : t('scan.soundOff')}
          </span>
        }
      />

      {backupDue ? (
        <div className="callout warning">
          <span className="callout-icon">
            <AlertTriangle size={20} />
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

      {activeList && stats ? (
        <div className="scan-active-banner">
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
                <button type="button" className="btn btn-primary" onClick={reopenCurrentList}>
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
      ) : (
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
                  <strong>{t('scan.waiting')}</strong>
                )}
              </div>
              {lastOutcome?.status === 'accepted' ? (
                <span className="scan-accepted-flash" aria-hidden="true" />
              ) : null}
            </div>

            <div className="scan-session-stats">
              <div>
                <span>{t('scan.scans')}</span>
                <strong>{activity.scans}</strong>
              </div>
              <div className="good">
                <span>{t('scan.accepted')}</span>
                <strong>{activity.accepted}</strong>
              </div>
              <div className="warn">
                <span>{t('scan.duplicates')}</span>
                <strong>{activity.duplicate}</strong>
              </div>
              <div className="danger">
                <span>{t('scan.blacklisted')}</span>
                <strong>{activity.blacklisted}</strong>
              </div>
              <div>
                <span>{t('scan.otherList')}</span>
                <strong>{activity.otherList}</strong>
              </div>
              <div className="warn">
                <span>{t('scan.notRequired')}</span>
                <strong>{activity.rejected}</strong>
              </div>
            </div>
          </section>

          <aside className="scan-side">
            <div className="stats-grid scan-stats-grid">
              <StatCard icon={PackageCheck} label={t('dashboard.returned')} value={stats?.returned ?? 0} tone="success" />
              <StatCard icon={ClipboardList} label={t('dashboard.remaining')} value={stats?.remaining ?? 0} tone="warning" />
            </div>

            <Section title={t('scan.recent')} className="recent-card">
              {recentEvents.length ? (
                <div className="activity-list compact">
                  {recentEvents.map((event) => (
                    <div className="activity-row" key={event.id}>
                      <span className={`activity-dot result-${event.result}`} />
                      <div className="activity-main">
                        <strong className="mono">{event.code}</strong>
                        <small>{relativeTime(event.at, lang)}</small>
                      </div>
                      <ScanResultBadge result={event.result} />
                      <button
                        type="button"
                        className="icon-btn danger"
                        title={t('common.delete')}
                        onClick={() => deleteRecentEvent(event.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={ScanLine} title={t('scan.noRecent')} />
              )}
            </Section>
          </aside>
        </div>
      )}

      <CameraScanner
        open={cameraOpen}
        onClose={() => {
          setCameraOpen(false)
          focusInput()
        }}
        onDetect={(code) => handleScan(code, 'camera')}
      />

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
