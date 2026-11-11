import { useMemo, useState } from 'react'
import {
  BadgeAlert,
  Download,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useI18n, errorKey } from '../i18n'
import { parseCodeBlob } from '../lib/codes'
import { exportBlacklistXlsx } from '../lib/export'
import { formatDateTime } from '../lib/utils'
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Modal,
  PageHeader,
  SearchField,
  Section,
  StatCard,
} from '../components/ui'
import { toast } from '../components/Toast'
import type { BlacklistEntry } from '../types'

export function BlacklistPage() {
  const { t, lang } = useI18n()
  const blacklist = useStore((state) => state.blacklist)
  const addBlacklist = useStore((state) => state.addBlacklist)
  const updateBlacklist = useStore((state) => state.updateBlacklist)
  const removeBlacklist = useStore((state) => state.removeBlacklist)

  const [query, setQuery] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [bulk, setBulk] = useState('')
  const [reason, setReason] = useState('')
  const [editing, setEditing] = useState<BlacklistEntry | null>(null)
  const [editCode, setEditCode] = useState('')
  const [editReason, setEditReason] = useState('')
  const [removing, setRemoving] = useState<BlacklistEntry | null>(null)

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return blacklist
      .filter(
        (entry) =>
          !needle ||
          entry.code.toLocaleLowerCase().includes(needle) ||
          entry.reason.toLocaleLowerCase().includes(needle),
      )
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
  }, [blacklist, query])

  const submitAdd = () => {
    const codes = parseCodeBlob(bulk)
    if (!codes.length) return
    const result = addBlacklist(codes.map((code) => ({ code, reason })))
    if (result.added) {
      toast(t('toast.blacklistAdded', { count: result.added }))
    } else {
      toast(t('error.duplicate-code'), 'warning')
    }
    setBulk('')
    setReason('')
    setShowAdd(false)
  }

  const openEdit = (entry: BlacklistEntry) => {
    setEditing(entry)
    setEditCode(entry.code)
    setEditReason(entry.reason)
  }

  const submitEdit = () => {
    if (!editing) return
    const result = updateBlacklist(editing.id, { code: editCode, reason: editReason })
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(t('toast.blacklistUpdated'))
    setEditing(null)
  }

  const confirmRemove = () => {
    if (!removing) return
    const result = removeBlacklist(removing.id)
    if (!result.ok) {
      toast(t('error.not-found'), 'error')
      return
    }
    toast(t('toast.blacklistRemoved'))
    setRemoving(null)
  }

  const exportList = async () => {
    try {
      await exportBlacklistXlsx(blacklist, lang)
      toast(t('toast.exportStarted'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('common.unknownError'), 'error')
    }
  }

  return (
    <div className="page">
      <PageHeader
        title={t('blacklist.title')}
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => void exportList()} disabled={!blacklist.length}>
              <Download size={16} />
              {t('common.export')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setShowAdd(true)}>
              <Plus size={16} />
              {t('blacklist.add')}
            </button>
          </>
        }
      />

      <div className="stats-grid">
        <StatCard
          icon={BadgeAlert}
          label={t('blacklist.count', { count: blacklist.length })}
          value={blacklist.length}
          hint={t('blacklist.danger')}
          tone="danger"
        />
      </div>

      <Section>
        <div className="toolbar">
          <SearchField value={query} onChange={setQuery} placeholder={t('blacklist.code')} />
          <Badge tone="danger" dot>
            {t('blacklist.count', { count: visible.length })}
          </Badge>
        </div>

        {visible.length ? (
          <div className="record-list">
            {visible.map((entry) => (
              <div className="record-row" key={entry.id}>
                <div className="record-main">
                  <strong className="mono">{entry.code}</strong>
                  <small>
                    {entry.reason || t('common.noData')} · {entry.addedBy} ·{' '}
                    {formatDateTime(entry.addedAt, lang)}
                    {entry.updatedAt ? ` · ${formatDateTime(entry.updatedAt, lang)}` : ''}
                  </small>
                </div>
                <Badge tone="danger" dot>
                  {t('status.prohibited')}
                </Badge>
                <button type="button" className="icon-btn" title={t('common.edit')} onClick={() => openEdit(entry)}>
                  <Pencil size={16} />
                </button>
                <button type="button" className="icon-btn danger" title={t('common.remove')} onClick={() => setRemoving(entry)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title={t('blacklist.empty')}
            text={t('blacklist.emptyText')}
            action={
              <button type="button" className="btn btn-primary" onClick={() => setShowAdd(true)}>
                <Plus size={16} />
                {t('blacklist.add')}
              </button>
            }
          />
        )}
      </Section>

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title={t('blacklist.addTitle')}
        icon={<ShieldAlert size={20} />}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setShowAdd(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-danger" onClick={submitAdd} disabled={!bulk.trim()}>
              {t('blacklist.add')}
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label" htmlFor="blacklist-codes">
            {t('blacklist.code')} *
          </label>
          <textarea
            id="blacklist-codes"
            className="input textarea mono"
            rows={5}
            value={bulk}
            onChange={(event) => setBulk(event.target.value)}
            placeholder={t('blacklist.codesPlaceholder')}
            autoFocus
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="blacklist-reason">
            {t('blacklist.reason')}
          </label>
          <input
            id="blacklist-reason"
            className="input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('blacklist.reasonPlaceholder')}
          />
        </div>
        <div className="inline-alert danger">{t('blacklist.danger')}</div>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={t('blacklist.editTitle')}
        icon={<Pencil size={20} />}
        size="sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={submitEdit}>
              {t('blacklist.update')}
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label" htmlFor="blacklist-edit-code">
            {t('blacklist.code')}
          </label>
          <input
            id="blacklist-edit-code"
            className="input mono"
            value={editCode}
            onChange={(event) => setEditCode(event.target.value)}
            autoFocus
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="blacklist-edit-reason">
            {t('blacklist.reason')}
          </label>
          <input
            id="blacklist-edit-reason"
            className="input"
            value={editReason}
            onChange={(event) => setEditReason(event.target.value)}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        danger
        title={t('blacklist.removeTitle')}
        message={t('blacklist.removeText', { code: removing?.code ?? '' })}
        confirmLabel={t('common.remove')}
        cancelLabel={t('common.cancel')}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
      />
    </div>
  )
}
