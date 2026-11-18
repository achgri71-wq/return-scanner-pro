import { useEffect, useMemo, useState } from 'react'
import {
  CheckSquare,
  ClipboardCopy,
  Copy,
  ListPlus,
  Search,
  Square,
  Trash2,
} from 'lucide-react'
import { useI18n } from '../i18n'
import { isValidCode, normalizeCode, parseCodeBlob } from '../lib/codes'
import {
  loadLivriCodes,
  makeLivriCode,
  saveLivriCodes,
  type LivriCode,
} from '../lib/livri'
import { formatDateTime } from '../lib/utils'
import { toast } from '../components/Toast'
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  SearchField,
  StatCard,
} from '../components/ui'

type DeleteTarget =
  | { type: 'one'; id: string }
  | { type: 'selected' }
  | { type: 'all' }
  | null

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    const input = document.createElement('textarea')
    input.value = value
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    const copied = document.execCommand('copy')
    input.remove()
    if (!copied) throw new Error('Clipboard unavailable')
  }
}

export function LivriPage() {
  const { t, lang } = useI18n()
  const [codes, setCodes] = useState<LivriCode[]>(() => loadLivriCodes())
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)

  useEffect(() => {
    const reload = () => setCodes(loadLivriCodes())
    window.addEventListener('rsp.livri', reload)
    window.addEventListener('storage', reload)
    return () => {
      window.removeEventListener('rsp.livri', reload)
      window.removeEventListener('storage', reload)
    }
  }, [])

  const needle = normalizeCode(query)
  const visible = useMemo(
    () => codes.filter((item) => !needle || item.code.includes(needle)),
    [codes, needle],
  )
  const selectedVisible = visible.filter((item) => selected.has(item.id))
  const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length

  const addCodes = () => {
    const parsed = parseCodeBlob(input)
    const existing = new Set(codes.map((item) => item.code))
    const batch = new Set<string>()
    const additions: string[] = []
    let duplicates = 0
    let invalid = 0

    for (const code of parsed) {
      if (!isValidCode(code)) {
        invalid += 1
        continue
      }
      if (existing.has(code) || batch.has(code)) {
        duplicates += 1
        continue
      }
      batch.add(code)
      additions.push(code)
    }

    if (!additions.length) {
      toast(t('livri.nothingAdded', { duplicates, invalid }), 'warning')
      return
    }

    const next = [...codes, ...additions.map((code) => makeLivriCode(code))]
    try {
      saveLivriCodes(next)
      setCodes(next)
      setInput('')
      toast(t('livri.added', { added: additions.length, duplicates, invalid }), 'success')
    } catch {
      toast(t('livri.saveFailed'), 'error')
    }
  }

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleVisible = () => {
    setSelected((current) => {
      const next = new Set(current)
      if (allVisibleSelected) visible.forEach((item) => next.delete(item.id))
      else visible.forEach((item) => next.add(item.id))
      return next
    })
  }

  const copyCodes = async (items: LivriCode[]) => {
    if (!items.length) return
    try {
      await copyText(items.map((item) => item.code).join('\n'))
      toast(t('livri.copied', { count: items.length }), 'success')
    } catch {
      toast(t('livri.copyFailed'), 'error')
    }
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    const next = codes.filter((item) => {
      if (deleteTarget.type === 'one') return item.id !== deleteTarget.id
      if (deleteTarget.type === 'selected') return !selected.has(item.id)
      return false
    })
    try {
      saveLivriCodes(next)
      setCodes(next)
      setSelected(new Set())
      setDeleteTarget(null)
      toast(t('livri.deleted', { count: codes.length - next.length }), 'success')
    } catch {
      toast(t('livri.saveFailed'), 'error')
    }
  }

  const deleteMessage = (() => {
    if (deleteTarget?.type === 'all') return t('livri.confirmAll')
    if (deleteTarget?.type === 'selected') return t('livri.confirmSelected', { count: selected.size })
    const code = codes.find((item) => item.id === deleteTarget?.id)?.code ?? ''
    return t('livri.confirmOne', { code })
  })()

  return (
    <div className="page demande-page">
      <PageHeader title={t('livri.title')} subtitle={t('livri.subtitle')} />

      <section className="card demande-add-card">
        <div className="demande-card-title">
          <span className="demande-icon"><ListPlus size={19} /></span>
          <div>
            <h2>{t('livri.addTitle')}</h2>
            <p>{t('livri.addHint')}</p>
          </div>
        </div>
        <textarea
          className="input demande-input mono"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('livri.placeholder')}
          rows={4}
          spellCheck={false}
        />
        <div className="demande-add-actions">
          <small>{t('livri.localNote')}</small>
          <button type="button" className="btn btn-primary" onClick={addCodes} disabled={!input.trim()}>
            <ListPlus size={16} />
            {t('livri.add')}
          </button>
        </div>
      </section>

      <div className="stats-grid demande-stats">
        <StatCard
          icon={ClipboardCopy}
          label={t('livri.total')}
          value={codes.length}
          tone="accent"
        />
        <StatCard
          icon={CheckSquare}
          label={t('livri.selected')}
          value={selected.size}
          tone="info"
        />
      </div>

      <div className="demande-toolbar">
        <SearchField value={query} onChange={setQuery} placeholder={t('livri.search')} />
        <div className="demande-toolbar-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={toggleVisible} disabled={!visible.length}>
            {allVisibleSelected ? <Square size={15} /> : <CheckSquare size={15} />}
            {allVisibleSelected ? t('livri.selectNone') : t('livri.selectVisible')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void copyCodes(selectedVisible)}
            disabled={!selectedVisible.length}
          >
            <Copy size={15} /> {t('livri.copySelected')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copyCodes(codes)} disabled={!codes.length}>
            <ClipboardCopy size={15} /> {t('livri.copyAll')}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => setDeleteTarget({ type: 'selected' })}
            disabled={!selected.size}
          >
            <Trash2 size={15} /> {t('livri.deleteSelected')}
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => setDeleteTarget({ type: 'all' })}
            disabled={!codes.length}
          >
            <Trash2 size={15} /> {t('livri.clearAll')}
          </button>
        </div>
      </div>

      {visible.length ? (
        <div className="demande-code-list">
          {visible.map((item) => (
            <article className="card demande-code-row" key={item.id}>
              <label className="demande-code-select">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleSelected(item.id)}
                  aria-label={t('livri.selectCode', { code: item.code })}
                />
                <span />
              </label>
              <div className="demande-code-text">
                <strong className="mono">{item.code}</strong>
                <small>{formatDateTime(item.addedAt, lang)}</small>
              </div>
              <Badge tone="muted">{t('livri.badge')}</Badge>
              <div className="demande-code-actions">
                <button type="button" className="icon-btn" onClick={() => void copyCodes([item])} title={t('livri.copyOne')}>
                  <Copy size={16} />
                </button>
                <button type="button" className="icon-btn is-danger" onClick={() => setDeleteTarget({ type: 'one', id: item.id })} title={t('common.delete')}>
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Search}
          title={needle ? t('livri.noMatch') : t('livri.empty')}
          text={needle ? t('livri.noMatchText') : t('livri.emptyText')}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('livri.deleteTitle')}
        message={deleteMessage}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
