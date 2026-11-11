import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  FilePlus2,
  ListChecks,
  Plus,
  Search,
  Upload,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useI18n, errorKey } from '../i18n'
import { blacklistCodeSet, computeListStats } from '../lib/stats'
import { formatPercent, relativeTime } from '../lib/utils'
import { exportListXlsx } from '../lib/export'
import { parseCodeBlob } from '../lib/codes'
import { Badge, ConfirmDialog, EmptyState, Modal, PageHeader, ProgressBar, SearchField, Section, Segmented, Spinner } from '../components/ui'
import { ListSourceBadge, ListStatusBadge } from '../components/StatusBadge'
import { ImportWizard } from '../components/ImportWizard'
import { toast } from '../components/Toast'
import type { ListStatus, ReturnList } from '../types'

type Filter = 'all' | ListStatus

export function ListsPage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const blacklist = useStore((state) => state.blacklist)
  const sessions = useStore((state) => state.sessions)
  const settings = useStore((state) => state.settings)
  const createList = useStore((state) => state.createList)
  const switchList = useStore((state) => state.switchList)
  const addCodesToList = useStore((state) => state.addCodesToList)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [pendingList, setPendingList] = useState<ReturnList | null>(null)
  const [addCodesTarget, setAddCodesTarget] = useState<ReturnList | null>(null)
  const [quickCodes, setQuickCodes] = useState('')

  const blacklisted = useMemo(() => blacklistCodeSet(blacklist), [blacklist])
  const openSession = sessions.find((session) => session.status === 'open')

  const counts = useMemo(() => {
    const base: Record<Filter, number> = {
      all: lists.length,
      new: 0,
      active: 0,
      completed: 0,
      archived: 0,
    }
    for (const list of lists) base[list.status] += 1
    return base
  }, [lists])

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return lists
      .filter((list) => filter === 'all' || list.status === filter)
      .filter(
        (list) =>
          !needle ||
          list.name.toLocaleLowerCase().includes(needle) ||
          list.id.toLocaleLowerCase().includes(needle) ||
          list.notes.toLocaleLowerCase().includes(needle),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [lists, filter, query])

  const activate = (list: ReturnList) => {
    if (list.status === 'completed' || list.status === 'archived') return
    const needsConfirm =
      settings.confirmSwitch && openSession && openSession.listId !== list.id
    if (needsConfirm) {
      setPendingList(list)
      return
    }
    const result = switchList(list.id)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.listActivated'))
  }

  const confirmSwitch = () => {
    if (!pendingList) return
    const result = switchList(pendingList.id)
    setPendingList(null)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.listActivated'))
  }

  const submitNew = () => {
    setCreating(true)
    setCreateError('')
    const result = createList({ name, notes })
    setCreating(false)
    if (!result.ok || !result.list) {
      setCreateError(t(errorKey(result.error)))
      return
    }
    toast(t('toast.listCreated'))
    setShowNew(false)
    setName('')
    setNotes('')
    navigate(`/lists/${result.list.id}`)
  }

  const exportList = async (list: ReturnList) => {
    try {
      await exportListXlsx(list, parcels, blacklisted, lang)
      toast(t('toast.exportStarted'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.unknownError'), 'error')
    }
  }

  const addQuickCodes = () => {
    if (!addCodesTarget) return
    const codes = parseCodeBlob(quickCodes)
    if (!codes.length) return
    const result = addCodesToList(addCodesTarget.id, codes)
    if (!result.ok || !result.summary) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.codesAdded', { count: result.summary.imported }))
    setQuickCodes('')
    setAddCodesTarget(null)
  }

  const filters: Array<{ value: Filter; label: string; count: number }> = [
    { value: 'all', label: t('common.all'), count: counts.all },
    { value: 'new', label: t('status.new'), count: counts.new },
    { value: 'active', label: t('status.active'), count: counts.active },
    { value: 'completed', label: t('status.completed'), count: counts.completed },
    { value: 'archived', label: t('status.archived'), count: counts.archived },
  ]

  return (
    <div className="page">
      <PageHeader
        title={t('lists.title')}
        subtitle={t('lists.subtitle')}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setShowImport(true)}>
              <Upload size={16} />
              {t('lists.import')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
              <Plus size={16} />
              {t('lists.new')}
            </button>
          </>
        }
      />

      <div className="toolbar">
        <SearchField value={query} onChange={setQuery} placeholder={t('lists.search')} />
        <Segmented value={filter} options={filters} onChange={setFilter} />
      </div>

      {visible.length ? (
        <div className="list-grid">
          {visible.map((list) => {
            const stats = computeListStats(list.id, parcels, blacklisted)
            const isActive = settings.activeListId === list.id
            const hasSession = sessions.some(
              (session) => session.status === 'open' && session.listId === list.id,
            )
            return (
              <article key={list.id} className={`list-card${isActive ? ' is-active' : ''}`}>
                <div className="list-card-head">
                  <Link to={`/lists/${list.id}`} className="list-card-title">
                    {list.name}
                  </Link>
                  <div className="list-card-badges">
                    {isActive ? (
                      <Badge tone="accent" dot>
                        {t('status.active')}
                      </Badge>
                    ) : null}
                    <ListStatusBadge status={list.status} />
                  </div>
                </div>

                <div className="list-card-meta">
                  <ListSourceBadge source={list.source} />
                  <span>{list.id}</span>
                  <span>
                    {t('lists.lastScan')} :{' '}
                    {list.lastScanAt ? relativeTime(list.lastScanAt, lang) : t('lists.never')}
                  </span>
                </div>

                {list.notes ? <p className="list-card-notes">{list.notes}</p> : null}

                <div className="list-card-stats">
                  <span>
                    <CheckCircle2 size={15} /> {stats.returned}/{stats.total} {t('dashboard.returned')}
                  </span>
                  <span>
                    <ClipboardList size={15} /> {stats.remaining} {t('dashboard.remaining')}
                  </span>
                  <strong>{formatPercent(stats.completion, lang)}</strong>
                </div>
                <ProgressBar value={stats.completion} tone={stats.completion >= 1 ? 'success' : 'accent'} />

                <div className="list-card-actions">
                  <Link to={`/lists/${list.id}`} className="btn btn-secondary btn-sm">
                    <ArrowRight size={15} />
                    {t('lists.open')}
                  </Link>
                  {hasSession ? (
                    <Link to="/scan" className="btn btn-primary btn-sm">
                      <Search size={15} />
                      {t('lists.sessionOpen')}
                    </Link>
                  ) : list.status === 'new' || list.status === 'active' ? (
                    <button
                      type="button"
                      className={`btn btn-sm ${isActive ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => activate(list)}
                      disabled={isActive}
                    >
                      <CheckCircle2 size={15} />
                      {isActive ? t('status.active') : t('lists.setActive')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="icon-btn"
                    title={t('lists.addCodes')}
                    onClick={() => setAddCodesTarget(list)}
                    disabled={list.status === 'archived'}
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title={t('lists.export')}
                    onClick={() => void exportList(list)}
                  >
                    <Download size={16} />
                  </button>
                  {list.status === 'completed' ? (
                    <span className="icon-btn" title={t('lists.archive')}>
                      <Archive size={16} />
                    </span>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={ListChecks}
          title={lists.length ? t('lists.noMatch') : t('lists.empty')}
          text={lists.length ? t('lists.noMatchText') : t('lists.emptyText')}
          action={
            <button type="button" className="btn btn-primary" onClick={() => setShowNew(true)}>
              <FilePlus2 size={16} />
              {t('lists.createFirst')}
            </button>
          }
        />
      )}

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title={t('lists.new')}
        subtitle={t('lists.subtitle')}
        icon={<FilePlus2 size={20} />}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={submitNew} disabled={creating || !name.trim()}>
              {creating ? <Spinner inline /> : <Plus size={16} />}
              {t('lists.create')}
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label" htmlFor="new-list-name">
            {t('lists.listName')} *
          </label>
          <input
            id="new-list-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('lists.namePlaceholder')}
            autoFocus
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="new-list-notes">
            {t('lists.notes')}
          </label>
          <textarea
            id="new-list-notes"
            className="input textarea"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t('lists.notesPlaceholder')}
          />
        </div>
        {createError ? <div className="inline-alert danger">{createError}</div> : null}
      </Modal>

      <ImportWizard
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={(summary) => navigate(`/lists/${summary.listId}`)}
      />

      <ConfirmDialog
        open={Boolean(pendingList)}
        title={t('lists.switchTitle')}
        message={t('lists.switchText', {
          name: openSession?.listName ?? '',
        })}
        confirmLabel={t('lists.setActive')}
        cancelLabel={t('common.cancel')}
        onClose={() => setPendingList(null)}
        onConfirm={confirmSwitch}
      />

      <Modal
        open={Boolean(addCodesTarget)}
        onClose={() => setAddCodesTarget(null)}
        title={t('lists.addCodes')}
        subtitle={addCodesTarget?.name}
        icon={<Plus size={20} />}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setAddCodesTarget(null)}>
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
          <label className="field-label" htmlFor="quick-codes">
            {t('blacklist.codesPlaceholder')}
          </label>
          <textarea
            id="quick-codes"
            className="input textarea mono"
            rows={5}
            value={quickCodes}
            onChange={(event) => setQuickCodes(event.target.value)}
            placeholder={t('blacklist.codesPlaceholder')}
            autoFocus
          />
        </div>
      </Modal>

      <Section title={t('lists.title')} className="sr-only">
        {null}
      </Section>
    </div>
  )
}
