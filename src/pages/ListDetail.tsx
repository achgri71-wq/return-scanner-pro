import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Archive,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ListChecks,
  PackageCheck,
  PackageX,
  Pencil,
  PlayCircle,
  Plus,
  RotateCcw,
  ScanLine,
  Search,
  ShieldAlert,
  Upload,
  XCircle,
} from 'lucide-react'
import type { ScanSession } from '../types'
import { useStore } from '../store/useStore'
import { useI18n, errorKey } from '../i18n'
import {
  blacklistCodeSet,
  buildListComparison,
  computeListStats,
  sessionActivity,
} from '../lib/stats'
import {
  formatDateTime,
  formatPercent,
  relativeTime,
} from '../lib/utils'
import { parseCodeBlob } from '../lib/codes'
import { exportListXlsx, exportReportXlsx } from '../lib/export'
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Modal,
  PageHeader,
  ProgressBar,
  SearchField,
  Section,
  Segmented,
  Spinner,
  StatCard,
} from '../components/ui'
import {
  AttemptsBadge,
  ListSourceBadge,
  ListStatusBadge,
  ParcelStatusBadge,
  RegistryStatusBadge,
  SessionStatusBadge,
} from '../components/StatusBadge'
import { ImportWizard } from '../components/ImportWizard'
import { StartSessionDialog } from '../components/StartSessionDialog'
import { CorrectionDialog } from '../components/CorrectionDialog'
import { toast } from '../components/Toast'

type Tab = 'codes' | 'unrequested' | 'sessions'
type CodeFilter = 'all' | 'pending' | 'returned'

export function ListDetailPage() {
  const { listId } = useParams<{ listId: string }>()
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
  const switchList = useStore((state) => state.switchList)
  const renameList = useStore((state) => state.renameList)
  const updateListNotes = useStore((state) => state.updateListNotes)
  const archiveList = useStore((state) => state.archiveList)
  const reopenList = useStore((state) => state.reopenList)
  const closeSession = useStore((state) => state.closeSession)
  const reopenSession = useStore((state) => state.reopenSession)

  const [tab, setTab] = useState<Tab>('codes')
  const [query, setQuery] = useState('')
  const [codeFilter, setCodeFilter] = useState<CodeFilter>('all')
  const [showImport, setShowImport] = useState(false)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [showSession, setShowSession] = useState(false)
  const [showAddCodes, setShowAddCodes] = useState(false)
  const [quickCodes, setQuickCodes] = useState('')
  const [showNotes, setShowNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [showRename, setShowRename] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [correctionParcel, setCorrectionParcel] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState<ScanSession | null>(null)
  const [confirmSwitch, setConfirmSwitch] = useState(false)
  const [busy, setBusy] = useState(false)

  const list = lists.find((item) => item.id === listId)
  const blacklisted = useMemo(() => blacklistCodeSet(blacklist), [blacklist])
  const data = useMemo(
    () => ({ lists, parcels, registry, events, blacklist, sessions, employees, audit }),
    [lists, parcels, registry, events, blacklist, sessions, employees, audit],
  )
  const stats = useMemo(
    () => (list ? computeListStats(list.id, parcels, blacklisted) : null),
    [list, parcels, blacklisted],
  )
  const comparison = useMemo(
    () => (list ? buildListComparison(list.id, data) : null),
    [list, data],
  )
  const listSessions = useMemo(
    () =>
      sessions
        .filter((session) => session.listId === listId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [sessions, listId],
  )
  const openSession = listSessions.find((session) => session.status === 'open')
  const otherOpen = sessions.find(
    (session) => session.status === 'open' && session.listId !== listId,
  )
  const scopedParcels = useMemo(
    () =>
      parcels
        .filter((parcel) => parcel.listId === listId)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [parcels, listId],
  )
  const visibleParcels = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return scopedParcels
      .filter((parcel) => codeFilter === 'all' || parcel.status === codeFilter)
      .filter((parcel) => !needle || parcel.code.toLocaleLowerCase().includes(needle))
  }, [scopedParcels, codeFilter, query])

  if (!list || !stats) {
    return (
      <div className="page">
        <EmptyState
          icon={XCircle}
          title={t('error.list-not-found')}
          action={
            <Link to="/lists" className="btn btn-primary">
              <ArrowLeft size={16} />
              {t('nav.lists')}
            </Link>
          }
        />
      </div>
    )
  }

  const isActive = settings.activeListId === list.id
  const locked = list.status === 'completed' || list.status === 'archived'
  const activeCorrection = scopedParcels.find((parcel) => parcel.id === correctionParcel) ?? null

  const activate = () => {
    if (settings.confirmSwitch && otherOpen) {
      setConfirmSwitch(true)
      return
    }
    const result = switchList(list.id)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.listActivated'))
  }

  const doSwitch = () => {
    const result = switchList(list.id)
    setConfirmSwitch(false)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.listActivated'))
  }

  const doRename = () => {
    const result = renameList(list.id, nameDraft)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.listRenamed'))
    setShowRename(false)
  }

  const doSaveNotes = () => {
    const result = updateListNotes(list.id, notesDraft)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.notesSaved'))
    setShowNotes(false)
  }

  const doReopen = () => {
    const result = reopenList(list.id)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.listReopened'))
  }

  const doArchive = () => {
    const result = archiveList(list.id)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.listArchived'))
  }

  const doCloseSession = () => {
    if (!confirmClose) return
    setBusy(true)
    const result = closeSession(confirmClose.id)
    setBusy(false)
    setConfirmClose(null)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.sessionClosed'))
  }

  const doReopenSession = (sessionId: string) => {
    const result = reopenSession(sessionId)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.sessionReopened'))
  }

  const exportList = async () => {
    try {
      await exportListXlsx(list, parcels, blacklisted, lang)
      toast(t('toast.exportStarted'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.unknownError'), 'error')
    }
  }

  const exportSession = async (session: ScanSession) => {
    if (!session.report) {
      toast(t('reports.noReport'), 'warning')
      return
    }
    try {
      await exportReportXlsx(
        session.report,
        parcels,
        events.filter((event) => event.sessionId === session.id),
        lang,
      )
      toast(t('toast.exportStarted'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.unknownError'), 'error')
    }
  }

  const addQuickCodes = () => {
    const codes = parseCodeBlob(quickCodes)
    if (!codes.length) return
    const result = useStore.getState().addCodesToList(list.id, codes)
    if (!result.ok || !result.summary) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.codesAdded', { count: result.summary.imported }))
    setQuickCodes('')
    setShowAddCodes(false)
  }

  const tabs: Array<{ value: Tab; label: string; count: number }> = [
    { value: 'codes', label: t('list.codesTab'), count: stats.total },
    { value: 'unrequested', label: t('list.unrequested'), count: comparison?.unrequested.length ?? 0 },
    { value: 'sessions', label: t('list.sessionsTab'), count: listSessions.length },
  ]

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/lists">
          <ArrowLeft size={15} /> {t('nav.lists')}
        </Link>
      </div>

      <PageHeader
        title={list.name}
        subtitle={
          <span className="inline-badges">
            <ListStatusBadge status={list.status} />
            <ListSourceBadge source={list.source} />
            {isActive ? (
              <Badge tone="accent" dot>
                {t('status.active')}
              </Badge>
            ) : null}
            {openSession ? (
              <Badge tone="success" dot>
                {t('lists.sessionOpen')}
              </Badge>
            ) : null}
            <span className="detail-subtitle">
              {list.id} · {t('lists.createdAt')} {formatDateTime(list.createdAt, lang)}
              {list.lastScanAt ? ` · ${t('lists.lastScan')} ${relativeTime(list.lastScanAt, lang)}` : ''}
            </span>
          </span>
        }
        actions={
          <>
            {!locked && !isActive ? (
              <button type="button" className="btn btn-secondary" onClick={activate}>
                <CheckCircle2 size={16} />
                {t('lists.setActive')}
              </button>
            ) : null}
            {!locked ? (
              <Link to="/scan" className="btn btn-primary">
                <ScanLine size={16} />
                {t('nav.scan')}
              </Link>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={() => void exportList()}>
              <Download size={16} />
              {t('common.export')}
            </button>
          </>
        }
      />

      <div className="stats-grid">
        <StatCard icon={ListChecks} label={t('reports.totalRequired')} value={stats.total} tone="info" />
        <StatCard icon={PackageCheck} label={t('dashboard.returned')} value={stats.returned} tone="success" />
        <StatCard icon={Search} label={t('dashboard.remaining')} value={stats.remaining} tone="warning" />
        <StatCard icon={BarChart3} label={t('dashboard.completion')} value={formatPercent(stats.completion, lang)} tone="accent" />
      </div>

      <Section title={t('list.overview')} className="overview-card">
        <div className="overview-grid">
          <div className="overview-progress">
            <ProgressBar
              value={stats.completion}
              tone={stats.completion >= 1 ? 'success' : 'accent'}
              label={
                <span>
                  {t('common.progress')} — {stats.returned}/{stats.total}
                </span>
              }
            />
            <div className="overview-flags">
              <span className="flag warn">
                <PackageX size={15} /> {t('list.unrequested')} : {comparison?.unrequested.length ?? 0}
              </span>
              <span className="flag warn">
                <RotateCcw size={15} /> {t('list.duplicates')} : {comparison?.repeatedAttempts ?? 0}
              </span>
              <span className="flag danger">
                <ShieldAlert size={15} /> {t('list.blacklistAttempts')} : {comparison?.blacklistedScans ?? 0}
              </span>
              <span className="flag info">
                <ListChecks size={15} /> {t('list.otherListAttempts')} : {comparison?.otherListAttempts ?? 0}
              </span>
            </div>
          </div>

          <div className="overview-side">
            <div className="notes-box">
              <div className="notes-head">
                <strong>{t('common.notes')}</strong>
                <button type="button" className="icon-btn" onClick={() => { setNotesDraft(list.notes); setShowNotes(true) }}>
                  <Pencil size={15} />
                </button>
              </div>
              <p>{list.notes || t('common.noData')}</p>
              {list.sourceFileName ? (
                <small>
                  <FileSpreadsheet size={13} /> {list.sourceFileName}
                </small>
              ) : null}
            </div>

            <div className="detail-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setNameDraft(list.name); setShowRename(true) }}>
                <Pencil size={15} /> {t('common.rename')}
              </button>
              {!locked ? (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setImportMode('merge'); setShowImport(true) }}
                  >
                    <Upload size={15} /> {t('list.importCodes')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setImportMode('replace'); setShowImport(true) }}
                  >
                    <RotateCcw size={15} /> {t('import.replace')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowAddCodes(true)}
                  >
                    <Plus size={15} /> {t('lists.addCodes')}
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-secondary btn-sm" onClick={doReopen}>
                  <RotateCcw size={15} /> {t('lists.reopen')}
                </button>
              )}
              {list.status === 'completed' ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={doArchive}>
                  <Archive size={15} /> {t('lists.archive')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </Section>

      <div className="section-head">
        <Segmented value={tab} options={tabs} onChange={setTab} />
        {openSession ? (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => setConfirmClose(openSession)}
          >
            {t('list.closeSession')}
          </button>
        ) : !locked ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowSession(true)}>
            <PlayCircle size={15} />
            {t('scan.startSession')}
          </button>
        ) : null}
      </div>

      {tab === 'codes' ? (
        <Section>
          <div className="toolbar">
            <SearchField value={query} onChange={setQuery} placeholder={t('list.searchCodes')} />
            <Segmented
              value={codeFilter}
              options={[
                { value: 'all', label: t('common.all') },
                { value: 'pending', label: t('status.pending') },
                { value: 'returned', label: t('status.returned') },
              ]}
              onChange={setCodeFilter}
            />
          </div>
          {visibleParcels.length ? (
            <>
              <p className="list-note">
                {t('list.codesShown', { count: visibleParcels.length })}
              </p>
              <div className="code-list">
                {visibleParcels.slice(0, 500).map((parcel) => (
                  <div className="code-row" key={parcel.id}>
                    <div className="code-main">
                      <strong className="mono">{parcel.code}</strong>
                      <small>
                        {t('list.addedAt')} {formatDateTime(parcel.addedAt, lang)}
                        {parcel.returnedAt
                          ? ` · ${t('list.returnedAt')} ${formatDateTime(parcel.returnedAt, lang)}`
                          : ''}
                        {parcel.returnedBy ? ` · ${parcel.returnedBy}` : ''}
                      </small>
                    </div>
                    <ParcelStatusBadge status={parcel.status} />
                    {parcel.status === 'returned' ? (
                      <button
                        type="button"
                        className="icon-btn danger"
                        title={t('list.correction')}
                        onClick={() => setCorrectionParcel(parcel.id)}
                      >
                        <ShieldAlert size={16} />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={ListChecks} title={t('list.noCodes')} />
          )}
        </Section>
      ) : null}

      {tab === 'unrequested' ? (
        <Section>
          {comparison?.unrequested.length ? (
            <div className="code-list">
              {comparison.unrequested.map((entry) => (
                <div className="code-row" key={entry.id}>
                  <div className="code-main">
                    <strong className="mono">{entry.code}</strong>
                    <small>
                      {t('registry.firstScan')} {formatDateTime(entry.firstScanAt, lang)} ·{' '}
                      {t('registry.lastAttempt')} {relativeTime(entry.lastAttemptAt, lang)}
                    </small>
                  </div>
                  <RegistryStatusBadge status={entry.status} />
                  <AttemptsBadge count={entry.attempts} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={PackageX} title={t('list.noUnrequested')} />
          )}
        </Section>
      ) : null}

      {tab === 'sessions' ? (
        <Section>
          {listSessions.length ? (
            <div className="session-list">
              {listSessions.map((session) => {
                const activity = sessionActivity(session.id, events)
                return (
                  <div className="session-row" key={session.id}>
                    <div className="session-main">
                      <div className="session-title">
                        <strong className="mono">{session.id}</strong>
                        <SessionStatusBadge status={session.status} />
                      </div>
                      <small>
                        {formatDateTime(session.startedAt, lang)}
                        {session.endedAt ? ` → ${formatDateTime(session.endedAt, lang)}` : ''} ·{' '}
                        {session.employeeName || t('session.noEmployee')}
                      </small>
                      <div className="session-chips">
                        <span>{activity.scans} {t('reports.scans')}</span>
                        <span>{activity.accepted} {t('reports.accepted')}</span>
                        <span>{activity.duplicate} {t('reports.duplicates')}</span>
                        <span>{activity.blacklisted} {t('reports.blacklistAttempts')}</span>
                      </div>
                    </div>
                    <div className="session-actions">
                      {session.status === 'open' ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setConfirmClose(session)}
                        >
                          {t('list.endSession')}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => doReopenSession(session.id)}
                          >
                            <RotateCcw size={14} /> {t('lists.reopen')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => void exportSession(session)}
                            disabled={!session.report}
                          >
                            <Download size={14} /> {t('common.export')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState icon={BarChart3} title={t('list.noSessions')} />
          )}
        </Section>
      ) : null}

      <ImportWizard
        open={showImport}
        onClose={() => setShowImport(false)}
        initialMode={importMode}
        targetListId={list.id}
      />

      <StartSessionDialog
        open={showSession}
        listId={list.id}
        onClose={() => setShowSession(false)}
      />

      <CorrectionDialog
        open={Boolean(correctionParcel)}
        parcel={activeCorrection}
        onClose={() => setCorrectionParcel(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmClose)}
        danger
        title={t('scan.endConfirm')}
        message={t('scan.endText')}
        confirmLabel={t('scan.endSession')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        onClose={() => setConfirmClose(null)}
        onConfirm={doCloseSession}
      />

      <ConfirmDialog
        open={confirmSwitch}
        title={t('lists.switchTitle')}
        message={t('lists.switchText', { name: otherOpen?.listName ?? '' })}
        confirmLabel={t('lists.setActive')}
        cancelLabel={t('common.cancel')}
        onClose={() => setConfirmSwitch(false)}
        onConfirm={doSwitch}
      />

      <Modal
        open={showRename}
        onClose={() => setShowRename(false)}
        title={t('common.rename')}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setShowRename(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={doRename}>
              {t('common.save')}
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label" htmlFor="rename-list">
            {t('lists.listName')}
          </label>
          <input
            id="rename-list"
            className="input"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            autoFocus
          />
        </div>
      </Modal>

      <Modal
        open={showNotes}
        onClose={() => setShowNotes(false)}
        title={t('common.notes')}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setShowNotes(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={doSaveNotes}>
              {t('common.save')}
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label" htmlFor="list-notes">
            {t('common.notes')}
          </label>
          <textarea
            id="list-notes"
            className="input textarea"
            rows={4}
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            autoFocus
          />
        </div>
      </Modal>

      <Modal
        open={showAddCodes}
        onClose={() => setShowAddCodes(false)}
        title={t('lists.addCodes')}
        subtitle={list.name}
        icon={<Plus size={20} />}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setShowAddCodes(false)}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={addQuickCodes}
              disabled={!quickCodes.trim()}
            >
              {t('common.add')}
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label" htmlFor="detail-quick-codes">
            {t('blacklist.codesPlaceholder')}
          </label>
          <textarea
            id="detail-quick-codes"
            className="input textarea mono"
            rows={5}
            value={quickCodes}
            onChange={(event) => setQuickCodes(event.target.value)}
            autoFocus
          />
        </div>
      </Modal>

      {busy ? <Spinner label={t('common.loading')} /> : null}
    </div>
  )
}
