import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, Search, X, type LucideIcon } from 'lucide-react'
import { cx } from '../lib/utils'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = 'md',
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div
        className={cx('modal', `modal-${size}`, className)}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <header className="modal-head">
          <div className="modal-title-wrap">
            {icon ? <span className="modal-icon">{icon}</span> : null}
            <div>
              <h2 className="modal-title">{title}</h2>
              {subtitle ? <p className="modal-subtitle">{subtitle}</p> : null}
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  message: ReactNode
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  icon?: LucideIcon
  busy?: boolean
  children?: ReactNode
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  icon,
  busy,
  children,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const Icon = icon ?? (danger ? AlertTriangle : Check)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={<Icon size={20} />}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={cx('btn', danger ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <Spinner inline /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="dialog-text">{message}</p>
      {children}
    </Modal>
  )
}

export interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'muted'

export function Badge({
  children,
  tone = 'neutral',
  dot,
  className,
}: {
  children: ReactNode
  tone?: Tone
  dot?: boolean
  className?: string
}) {
  return (
    <span className={cx('badge', `badge-${tone}`, className)}>
      {dot ? <span className="badge-dot" /> : null}
      {children}
    </span>
  )
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
}) {
  return (
    <div className={cx('stat-card', `stat-${tone}`)}>
      <span className="stat-icon">
        <Icon size={20} />
      </span>
      <div className="stat-text">
        <span className="stat-label">{label}</span>
        <strong className="stat-value">{value}</strong>
        {hint ? <span className="stat-hint">{hint}</span> : null}
      </div>
    </div>
  )
}

export function ProgressBar({
  value,
  label,
  tone = 'accent',
}: {
  value: number
  label?: ReactNode
  tone?: 'accent' | 'success' | 'warning'
}) {
  const width = Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div className="progress-wrap">
      {label ? <div className="progress-label">{label}</div> : null}
      <div className="progress-track" role="progressbar" aria-valuenow={width} aria-valuemin={0} aria-valuemax={100}>
        <span className={cx('progress-fill', `progress-${tone}`)} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon
  title: ReactNode
  text?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  )
}

export function Spinner({ inline, label }: { inline?: boolean; label?: string }) {
  if (inline) return <span className="spinner spinner-inline" aria-hidden="true" />
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" />
      {label ? <span>{label}</span> : null}
    </div>
  )
}

export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}) {
  return (
    <div className={cx('search-field', className)}>
      <Search size={17} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        <button type="button" className="search-clear" onClick={() => onChange('')} aria-label="Effacer">
          <X size={15} />
        </button>
      ) : null}
    </div>
  )
}

export interface SelectOption {
  value: string
  label: ReactNode
  disabled?: boolean
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  id,
  disabled,
  className,
}: {
  label?: ReactNode
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  hint?: ReactNode
  id?: string
  disabled?: boolean
  className?: string
}) {
  const autoId = useId()
  const fieldId = id ?? autoId
  return (
    <div className={cx('field', className)}>
      {label ? (
        <label className="field-label" htmlFor={fieldId}>
          {label}
        </label>
      ) : null}
      <select
        id={fieldId}
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <small className="field-hint">{hint}</small> : null}
    </div>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: Array<SegmentOption<T>>
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cx('segmented', className)} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={cx('segment', value === option.value && 'is-active')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {typeof option.count === 'number' ? <span className="segment-count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  icon: Icon,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  disabled?: boolean
}) {
  return (
    <label className={cx('toggle-row', disabled && 'is-disabled')}>
      {Icon ? (
        <span className="toggle-icon">
          <Icon size={18} />
        </span>
      ) : null}
      <span className="toggle-text">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <input
        type="checkbox"
        className="toggle-input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span className="toggle-switch" aria-hidden="true">
        <span />
      </span>
    </label>
  )
}

export function Section({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('card', className)}>
      {title ? (
        <header className="card-head">
          <h2>{title}</h2>
          {actions ? <div className="card-head-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}
