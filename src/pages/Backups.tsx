import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DatabaseBackup,
  Download,
  FileJson,
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
  ProgressBar,
  Section,
  Segmented,
  Spinner,
} from '../components/ui'
import { toast } from '../components/Toast'

const ERROR_KEYS: Record<string, TKey> = {
  'not-object': 'backup.code.not-object',
  'app-mismatch': 'backup.code.app-mismatch',
  'version-mismatch': 'backup.code.version-mismatch',
  'orphan-events': 'backup.code.orphan-events',
}

function describeBackupCode(code: string, t: Translate): string {
  if (code.startsWith('missing-')) return t('backup.code.missing')
  if (code.endsWith('-skipped')) return t('backup.code.skipped')
  const key = ERROR_KEYS[code]
  return key ? t(key) : code
}

/** Backup export / import / storage — rendered inside the Settings page. */
export function BackupSection() {
  const { t, lang } = useI18n()
  const lists = useStore((state) => state.lists)
  const parcels = useStore((state) => state.parcels)
  const registry = useStore((state) => state.registry)
  const events = useStore((state) => state.events)
  const blacklist = useStore((state) => state.blacklist)
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
        [t('nav.employees'), preview.counts.employees],
        [t('nav.audit'), preview.counts.audit],
      ]
    : []

  return (
    <>
      <Section title={t('backups.title')}>
        <div className="storage-line">
          <div>
            <strong>
              <DatabaseBackup size={16} className="inline-icon" />{' '}
              {lastBackup ? formatDateTime(lastBackup, lang) : t('backups.never')}
              {backupDue ? ` · ${t('backups.due')}` : ''}
            </strong>
            <small>
              {t('backups.used')} : {storage ? storageLabel(storage.used) : '—'}
              {storage ? ` · ${t('backups.quota')} : ${storageLabel(storage.quota)}` : ''}
            </small>
          </div>
          <Badge tone={usageRatio > 0.85 ? 'danger' : 'neutral'}>
            {storage ? `${Math.round(usageRatio * 100)}%` : '—'}
          </Badge>
        </div>
        <ProgressBar value={usageRatio} tone={usageRatio > 0.85 ? 'warning' : 'accent'} />
        <div className="backup-actions">
          <button type="button" className="btn btn-primary" onClick={exportBackup}>
            <Download size={16} />
            {t('backups.exportNow')}
          </button>
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
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden-input"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <small className="backup-note">
          {totalRecords} {t('backups.records')} · {t('backups.localOnly')}
        </small>
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
    </>
  )
}
