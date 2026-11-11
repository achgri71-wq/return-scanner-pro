import type { Language } from '../types'

export function uid(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
  return prefix ? `${prefix}_${raw}` : raw
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function localeFor(lang: Language): string {
  return lang === 'ar' ? 'ar-MA' : 'fr-FR'
}

export function formatNumber(value: number, lang: Language): string {
  return new Intl.NumberFormat(localeFor(lang)).format(value)
}

export function formatPercent(value: number, lang: Language): string {
  return new Intl.NumberFormat(localeFor(lang), {
    style: 'percent',
    maximumFractionDigits: value > 0 && value < 0.01 ? 1 : 0,
  }).format(value)
}

export function formatDate(
  input: string | Date,
  lang: Language,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  return new Intl.DateTimeFormat(localeFor(lang), options).format(new Date(input))
}

export function formatTime(input: string | Date, lang: Language): string {
  return new Intl.DateTimeFormat(localeFor(lang), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(input))
}

export function formatDateTime(input: string | Date, lang: Language): string {
  return new Intl.DateTimeFormat(localeFor(lang), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(input))
}

export function relativeTime(input: string | Date, lang: Language): string {
  const then = new Date(input).getTime()
  const diff = then - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat(localeFor(lang), { numeric: 'auto' })
  if (abs < 45_000) return lang === 'ar' ? 'الآن' : "à l'instant"
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute')
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour')
  if (abs < 7 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), 'day')
  return formatDate(input, lang)
}

export function dayKey(input: string | Date): string {
  const date = new Date(input)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function startOfDay(input: string | Date = new Date()): Date {
  const date = new Date(input)
  date.setHours(0, 0, 0, 0)
  return date
}

export function addDays(input: string | Date, days: number): Date {
  const date = new Date(input)
  date.setDate(date.getDate() + days)
  return date
}

export function percent(part: number, total: number): number {
  if (total <= 0) return 0
  return part / total
}

export function isToday(input: string | Date): boolean {
  return dayKey(input) === dayKey(new Date())
}

export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  if (!parts.length) return '?'
  return parts.map((part) => Array.from(part)[0] ?? '').join('').toUpperCase()
}

export function sanitizeFilename(name: string): string {
  return (
    name
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 80) || 'export'
  )
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function downloadJson(data: unknown, filename: string): void {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' }),
    filename,
  )
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  )
}

export function storageLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function dateInputValue(input: string | Date): string {
  return dayKey(input)
}

export function downloadText(text: string, filename: string, mime = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type: mime }), filename)
}

export function downloadCsv(rows: string[][], filename: string): void {
  const escape = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const lines = rows.map((row) => row.map(escape).join(','))
  downloadText(`\uFEFF${lines.join('\r\n')}`, filename, 'text/csv;charset=utf-8')
}
