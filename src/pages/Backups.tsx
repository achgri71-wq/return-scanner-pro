import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CloudOff,
  DatabaseBackup,
  Download,
  FileJson,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useI18n, errorKey, type Translate, type TKey } from '../i18n'
import { validateBackup, type BackupPreview } from '../lib/backup'
import { storageUsage } from '../lib/db'
import {
  downloadJson,
  formatDateTime,
  sanitizeFilename,
  storageLabel,
} from '../lib/utils'
import {
  Badge,
  ConfirmDialog,
  PageHeader,
  ProgressBar,
  Section,
  Segmented,
  Spinner,
  StatCard,
} from '../components/ui'
import { toast } from '../components/Toast'

const ERROR_KEYS: Record<string, TKey> = {
  'not-object': 'backup.code.not-object',
  'app-mismatch': 'backup.code.app-mismatch',
  'version-mismatch': 'backup.code.version-mismatch',
  'multiple-open-sessions': 'backup.code.multiple-open-sessions',
  'orphan-events': 'backup.code.orphan-events',
}

function describeBackupCode(code: string, t: Translate): string {
  if (code.startsWith('missing-')) return t('backup.code.missing')
  if (code.endsWith('-skipped')) return t('backup.code.skipped')
  const key = ERROR_KEYS[code]
  return key ? t(key) : code
}

export function BackupsPage() {
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
  const restoreBackup = useStore((state) => state.restoreBackup)

  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [payload, setPayload] = useState<unknown>(null)
  const [fileName, setFileName] = useState('')
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [confirmMode, setConfirmMode] = useState<'merge' | 'replace' | null>(null)
  const [busy, setBusy] = useState(false)
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    void storageUsage().then((value) => {
      if (alive) setStorage(value)
    })
    return () => {
      alive = false
    }
  }, [lists.length, parcels.length, events.length])

  const lastBackup = settings.lastBackupAt
  const backupDue = useMemo(() => {
    if (!lastBackup) return true
    const days = (Date.now() - new Date(lastBackup).getTime()) / 86_400_000
    return days >= settings.backupReminderDays
  }, [lastBackup, settings.backupReminderDays])

  const totalRecords =
    lists.length +
    parcels.length +
    registry.length +
    events.length +
    blacklist.length +
    sessions.length +
    employees.length +
    audit.length

  const usageRatio =
    storage && storage.quota > 0 ? storage.used / storage.quota : 0

  const exportBackup = () => {
    const data = createBackup()
    downloadJson(
      data,
      `returnscanner-backup-${sanitizeFilename(new Date().toISOString().slice(0, 10))}.json`,
    )
    markBackupExported()
    toast(t('toast.exportStarted'))
  }

  const pickFile = () => fileRef.current?.click()

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setPreview(null)
    setPayload(null)
    setFileName(file.name)
    try {
      const text = await file.text()
      let parsed: unknown = null
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = null
      }
      const result = validateBackup(parsed)
      setPreview(result)
      setPayload(parsed)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('backups.invalid'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const runImport = () => {
    if (!payload || !preview?.valid || !confirmMode) return
    setBusy(true)
    const result = restoreBackup(payload, confirmMode)
    setBusy(false)
    setConfirmMode(null)
    if (!result.ok) {
      toast(t(errorKey(result.error)), 'error')
      return
    }
    toast(confirmMode === 'replace' ? t('toast.backupRestored') : t('toast.backupImported'))
    setPreview(null)
    setPayload(null)
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const countRows: Array<[string, number]> = preview?.counts
    ? [
        [t('nav.lists'), preview.counts.lists],
        [t('backups.parcels'), preview.counts.parcels],
        [t('registry.title'), preview.counts.registry],
        [t('backups.events'), preview.counts.events],
        [t('nav.blacklist'), preview.counts.blacklist],
        [t('reports.sessions'), preview.counts.sessions],
        [t('nav.employees'), preview.counts.employees],
        [t('nav.audit'), preview.counts.audit],
      ]
    : []

  return (
    <div className="page">
      <PageHeader
        title={t('backups.title')}
        actions={
          <button type="button" className="btn btn-primary" onClick={exportBackup}>
            <Download size={16} />
            {t('backups.export')}
          </button>
        }
      />

      <div className="stats-grid">
        <StatCard
          icon={DatabaseBackup}
          label={t('backups.last')}
          value={lastBackup ? formatDateTime(lastBackup, lang) : t('backups.never')}
          hint={backupDue ? t('backups.due') : t('backups.ok')}
          tone={backupDue ? 'warning' : 'success'}
        />
        <StatCard
          icon={FileJson}
          label={t('backups.counts')}
          value={totalRecords}
          hint={t('backups.records')}
          tone="info"
        />
        <StatCard
          icon={HardDrive}
          label={t('backups.storage')}
          value={storage ? storageLabel(storage.used) : '—'}
          hint={storage ? `${t('backups.quota')} ${storageLabel(storage.quota)}` : t('backups.localOnly')}
          tone="accent"
        />
      </div>

      {backupDue ? (
        <div className="callout warning">
          <span className="callout-icon">
            <AlertTriangle size={20} />
          </span>
          <div className="callout-text">
            <strong>{t('backups.due')}</strong>
            <p>{t('backups.autoWarn', { days: settings.backupReminderDays })}</p>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={exportBackup}>
            <Download size={15} />
            {t('backups.exportNow')}
          </button>
        </div>
      ) : null}

      <div className="two-col">
        <Section title={t('backups.export')}>
          <p className="hint">{t('backups.exportText')}</p>
          <div className="backup-actions">
            <button type="button" className="btn btn-primary" onClick={exportBackup}>
              <Download size={16} />
              {t('backups.exportNow')}
            </button>
            <Badge tone="success" dot>
              {t('backups.settingsIncluded')}
            </Badge>
          </div>
          <div className="backup-meta">
            <span>
              <CheckCircle2 size={15} /> {lists.length} {t('nav.lists')}
            </span>
            <span>
              <CheckCircle2 size={15} /> {parcels.length} {t('backups.parcels')}
            </span>
            <span>
              <CheckCircle2 size={15} /> {events.length} {t('backups.events')}
            </span>
          </div>
        </Section>

        <Section title={t('backups.import')}>
          <p className="hint">{t('backups.importText')}</p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden-input"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <div className="backup-actions">
            <button type="button" className="btn btn-secondary" onClick={pickFile} disabled={busy}>
              <Upload size={16} />
              {t('backups.chooseFile')}
            </button>
            {fileName ? (
              <Badge tone={preview?.valid ? 'success' : 'danger'} dot>
                {fileName}
              </Badge>
            ) : null}
          </div>
          <div className="inline-alert warning">{t('backups.localOnly')} — {t('backups.localOnlyText')}</div>
        </Section>
      </div>

      <Section title={t('backups.storage')}>
        <div className="storage-line">
          <div>
            <strong>{t('backups.used')} : {storage ? storageLabel(storage.used) : '—'}</strong>
            <small>
              {storage ? `${t('backups.quota')} : ${storageLabel(storage.quota)}` : t('backups.localOnly')}
            </small>
          </div>
          <Badge tone={usageRatio > 0.85 ? 'danger' : 'neutral'}>
            {storage ? `${Math.round(usageRatio * 100)}%` : '—'}
          </Badge>
        </div>
        <ProgressBar value={usageRatio} tone={usageRatio > 0.85 ? 'warning' : 'accent'} />
        <p className="hint">{t('settings.dataStored')}</p>
      </Section>

      {busy && !preview ? <Spinner label={t('backups.parsing')} /> : null}

      {preview ? (
        <Section
          title={t('backups.preview')}
          actions={
            <Badge tone={preview.valid ? 'success' : 'danger'} dot>
              {preview.valid ? t('common.done') : t('backups.invalid')}
            </Badge>
          }
        >
          <div className="backup-file-line">
            <FileJson size={18} />
            <strong>{fileName}</strong>
            {preview.exportedAt ? (
              <small>
                {t('common.created')} {formatDateTime(preview.exportedAt, lang)}
              </small>
            ) : null}
            <Badge tone="neutral">{preview.totalRecords} {t('backups.records')}</Badge>
          </div>

          {preview.valid ? (
            <>
              <div className="backup-counts">
                {countRows.map(([label, count]) => (
                  <div className="backup-count" key={label}>
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
              </div>

              {preview.warnings.length ? (
                <div className="inline-alert warning">
                  <strong>{t('backups.warnings')}</strong>
                  <ul className="plain-list">
                    {preview.warnings.map((code) => (
                      <li key={code}>{describeBackupCode(code, t)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="import-mode">
                <span className="field-label">{t('import.mode')}</span>
                <Segmented
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'merge', label: t('backups.merge') },
                    { value: 'replace', label: t('backups.replace') },
                  ]}
                />
                <div className={mode === 'merge' ? 'inline-alert info' : 'inline-alert danger'}>
                  {mode === 'merge' ? t('backups.mergeText') : t('backups.replaceText')}
                </div>
              </div>

              <div className="backup-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setPreview(null)
                    setPayload(null)
                    setFileName('')
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className={`btn ${mode === 'replace' ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => setConfirmMode(mode)}
                  disabled={busy}
                >
                  {mode === 'replace' ? <RefreshCw size={16} /> : <ShieldCheck size={16} />}
                  {t('backups.importNow')}
                </button>
              </div>
            </>
          ) : (
            <div className="inline-alert danger">
              <strong>{t('backups.errors')}</strong>
              <ul className="plain-list">
                {preview.errors.map((code) => (
                  <li key={code}>{describeBackupCode(code, t)}</li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      ) : null}

      <div className="callout info">
        <span className="callout-icon">
          <CloudOff size={20} />
        </span>
        <div className="callout-text">
          <strong>{t('backups.localOnly')}</strong>
          <p>{t('backups.localOnlyText')}</p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmMode !== null}
        danger={confirmMode === 'replace'}
        title={confirmMode === 'replace' ? t('backups.confirmReplace') : t('backups.confirmMerge')}
        message={confirmMode === 'replace' ? t('backups.replaceText') : t('backups.mergeText')}
        confirmLabel={t('backups.importNow')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        onClose={() => setConfirmMode(null)}
        onConfirm={runImport}
      />
    </div>
  )
}
