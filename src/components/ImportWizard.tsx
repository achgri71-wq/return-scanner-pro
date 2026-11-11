import { useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, FileText, Upload, AlertTriangle, CheckCircle2, Table2 } from 'lucide-react'
import type { ImportSummary } from '../types'
import { analyzeRows, columnLabel, detectCodeColumn, previewRows, readFileRows, type ImportAnalysis } from '../lib/import-file'
import { useStore } from '../store/useStore'
import { useI18n, errorKey } from '../i18n'
import { cx } from '../lib/utils'
import { ConfirmDialog, Modal, Segmented, Spinner } from './ui'
import { toast } from './Toast'

type Mode = 'new' | 'merge' | 'replace'

interface ImportWizardProps {
  open: boolean
  onClose: () => void
  initialMode?: Mode
  targetListId?: string
  onImported?: (summary: ImportSummary) => void
}

export function ImportWizard({
  open,
  onClose,
  initialMode = 'new',
  targetListId,
  onImported,
}: ImportWizardProps) {
  const { t } = useI18n()
  const lists = useStore((state) => state.lists)
  const importCodes = useStore((state) => state.importCodes)

  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [target, setTarget] = useState(targetListId ?? '')
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [fileName, setFileName] = useState('')
  const [format, setFormat] = useState<'xlsx' | 'csv' | 'txt' | ''>('')
  const [rows, setRows] = useState<string[][]>([])
  const [column, setColumn] = useState(0)
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')
  const [confirmReplace, setConfirmReplace] = useState(false)

  const usableLists = useMemo(
    () => lists.filter((list) => list.status !== 'completed' && list.status !== 'archived'),
    [lists],
  )

  const reset = () => {
    setMode(initialMode)
    setTarget(targetListId ?? '')
    setName('')
    setNotes('')
    setFileName('')
    setFormat('')
    setRows([])
    setColumn(0)
    setAnalysis(null)
    setError('')
    setBusy(false)
    setParsing(false)
    setConfirmReplace(false)
  }

  const close = () => {
    if (busy) return
    reset()
    onClose()
  }

  const pickFile = () => fileRef.current?.click()

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setParsing(true)
    setError('')
    try {
      const parsed = await readFileRows(file)
      if (!parsed.rows.length) {
        setError(t('import.noFile'))
        return
      }
      const detected = detectCodeColumn(parsed.rows)
      setRows(parsed.rows)
      setFileName(parsed.fileName)
      setFormat(parsed.format)
      setColumn(detected)
      setAnalysis(analyzeRows(parsed.rows, detected))
      if (!name) {
        const base = parsed.fileName.replace(/\.[^.]+$/, '').trim()
        if (base) setName(base.slice(0, 80))
      }
    } catch {
      setError(t('import.unsupported'))
    } finally {
      setParsing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const selectColumn = (next: number) => {
    setColumn(next)
    if (rows.length) setAnalysis(analyzeRows(rows, next))
  }

  const maxColumns = useMemo(
    () => Math.min(12, rows.reduce((max, row) => Math.max(max, row.length), 0)),
    [rows],
  )

  const doImport = () => {
    if (!analysis) return
    setBusy(true)
    setError('')
    const summary = importCodes({
      name: mode === 'new' ? name : (lists.find((list) => list.id === target)?.name ?? ''),
      codes: analysis.codes,
      mode,
      targetListId: mode === 'new' ? undefined : target,
      notes,
      sourceFileName: fileName || undefined,
      fileDuplicates: analysis.duplicates,
      fileRejected: analysis.rejected,
    })
    setBusy(false)
    setConfirmReplace(false)
    if (!summary.ok || !summary.summary) {
      setError(t(errorKey(summary.error)))
      return
    }
    toast(t('toast.importDone', { added: summary.summary.imported }))
    onImported?.(summary.summary)
    reset()
    onClose()
  }

  const requestImport = () => {
    if (!analysis || !analysis.codes.length) return
    if (mode === 'replace') {
      setConfirmReplace(true)
      return
    }
    doImport()
  }

  const modes = [
    { value: 'new' as const, label: t('import.newList') },
    { value: 'merge' as const, label: t('import.merge') },
    { value: 'replace' as const, label: t('import.replace') },
  ]

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        title={t('import.title')}
        subtitle={t('import.formats')}
        icon={<Upload size={20} />}
        size="lg"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={requestImport}
              disabled={!analysis || !analysis.codes.length || busy || (mode !== 'new' && !target)}
            >
              {busy ? <Spinner inline /> : <Upload size={16} />}
              {t('import.doImport')}
            </button>
          </>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(event) => void onFile(event.target.files?.[0])}
        />

        {!analysis ? (
          <div className="import-drop">
            <button type="button" className="import-drop-btn" onClick={pickFile} disabled={parsing}>
              <span className="import-drop-icon">
                {parsing ? <Spinner inline /> : <FileSpreadsheet size={30} />}
              </span>
              <strong>{parsing ? t('import.parsing') : t('import.chooseFile')}</strong>
              <small>{t('import.formats')}</small>
            </button>
            <p className="hint">
              <Table2 size={14} /> {t('import.xlsxNote')}
            </p>
            {error ? (
              <div className="inline-alert danger">
                <AlertTriangle size={16} /> {error}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="import-body">
            <div className="import-file-row">
              <span className="file-chip">
                <FileText size={16} />
                <span>
                  <strong>{fileName || t('import.file')}</strong>
                  <small>{format.toUpperCase()}</small>
                </span>
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={pickFile} disabled={parsing}>
                {t('import.chooseFile')}
              </button>
            </div>

            <div className="import-grid">
              <div className="field">
                <label className="field-label" htmlFor="import-column">
                  {t('import.column')}
                </label>
                <select
                  id="import-column"
                  className="input"
                  value={column}
                  onChange={(event) => selectColumn(Number(event.target.value))}
                >
                  {Array.from({ length: maxColumns }).map((_, index) => (
                    <option key={index} value={index}>
                      {t('import.column')} {index + 1} — {columnLabel(rows, index)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">{t('import.mode')}</label>
                <Segmented value={mode} options={modes} onChange={setMode} className="segmented-wrap" />
              </div>
            </div>

            <div className="import-counts">
              <div className="import-count good">
                <span>{t('import.found')}</span>
                <strong>{analysis.codes.length}</strong>
              </div>
              <div className="import-count warn">
                <span>{t('import.duplicates')}</span>
                <strong>{analysis.duplicates}</strong>
              </div>
              <div className="import-count danger">
                <span>{t('import.rejected')}</span>
                <strong>{analysis.rejected}</strong>
              </div>
              <div className="import-count muted">
                <span>{t('import.emptyRows')}</span>
                <strong>{analysis.empty}</strong>
              </div>
              <div className="import-count">
                <span>{t('import.rows')}</span>
                <strong>{analysis.totalRows}</strong>
              </div>
            </div>

            <div className="preview-table-wrap">
              <table className="mini-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('import.column')}</th>
                    <th>{t('import.detected')}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows(rows, column, 6).map((row, index) => (
                    <tr key={index}>
                      <td className="muted">{index + 1}</td>
                      <td className="mono">{row[column] || '—'}</td>
                      <td>
                        {analysis.codes[index] ? (
                          <span className="text-good">
                            <CheckCircle2 size={14} /> {analysis.codes[index]}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {mode === 'new' ? (
              <div className="field">
                <label className="field-label" htmlFor="import-name">
                  {t('import.name')} *
                </label>
                <input
                  id="import-name"
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('lists.namePlaceholder')}
                />
              </div>
            ) : (
              <div className="field">
                <label className="field-label" htmlFor="import-target">
                  {t('import.target')} *
                </label>
                <select
                  id="import-target"
                  className="input"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  <option value="">{t('common.select')}</option>
                  {usableLists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="field">
              <label className="field-label" htmlFor="import-notes">
                {t('import.notes')} <span className="muted">({t('common.optional')})</span>
              </label>
              <textarea
                id="import-notes"
                className="input textarea"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t('lists.notesPlaceholder')}
              />
            </div>

            <div className={cx('inline-alert', mode === 'replace' ? 'danger' : 'info')}>
              <AlertTriangle size={16} />
              <span>
                {mode === 'replace'
                  ? t('import.replaceWarn')
                  : mode === 'merge'
                    ? t('import.mergeWarn')
                    : t('import.modes.newText')}
              </span>
            </div>

            {error ? (
              <div className="inline-alert danger">
                <AlertTriangle size={16} /> {error}
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmReplace}
        danger
        title={t('import.replace')}
        message={t('import.replaceWarn')}
        confirmLabel={t('import.doImport')}
        cancelLabel={t('common.cancel')}
        busy={busy}
        onClose={() => setConfirmReplace(false)}
        onConfirm={doImport}
      />
    </>
  )
}
