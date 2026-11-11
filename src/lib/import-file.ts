import { isHeaderValue, isLikelyCode, normalizeCode } from './codes'

export interface FileRows {
  rows: string[][]
  fileName: string
  format: 'xlsx' | 'csv' | 'txt'
}

export interface ImportAnalysis {
  rows: string[][]
  column: number
  hasHeader: boolean
  codes: string[]
  duplicates: number
  duplicateSamples: string[]
  rejected: number
  rejectedSamples: string[]
  empty: number
  totalRows: number
}

export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const counts = [
    { char: ';', count: (firstLine.match(/;/g) ?? []).length },
    { char: '\t', count: (firstLine.match(/\t/g) ?? []).length },
    { char: ',', count: (firstLine.match(/,/g) ?? []).length },
  ]
  const delimiter = counts.sort((a, b) => b.count - a.count)[0]?.char ?? ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]
    const next = clean[i + 1]
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''))
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''))
    if (row.some((value) => value.trim() !== '')) rows.push(row)
  }
  return rows
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    if (Number.isInteger(value) && Number.isSafeInteger(value)) return String(value)
    return String(value)
  }
  return String(value)
}

export async function readFileRows(file: File): Promise<FileRows> {
  const lower = file.name.toLocaleLowerCase()
  if (lower.endsWith('.csv') || file.type.includes('csv')) {
    return { rows: parseDelimited(await file.text()), fileName: file.name, format: 'csv' }
  }
  if (lower.endsWith('.txt') || file.type.startsWith('text/plain')) {
    const text = await file.text()
    const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
    if (/[;\t,]/.test(firstLine)) {
      return { rows: parseDelimited(text), fileName: file.name, format: 'txt' }
    }
    const rows = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => [line])
    return { rows, fileName: file.name, format: 'txt' }
  }
  if (lower.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser')
    const raw = await readSheet(file)
    return {
      rows: raw.map((row) => row.map(cellToString)),
      fileName: file.name,
      format: 'xlsx',
    }
  }
  throw new Error('unsupported-format')
}

function looksLikeMetadataHeader(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return /^(?:phone|t[ée]l[ée]phone|tel|mobile|contact|supplier|fournisseur|fourn\.?|status|statut|[ée]tat|state|date|heure|time|name|nom|client|customer|destinataire|recipient|adresse|address|ville|city|note|notes|remarque|commentaire|comment|quantit[ée]|quantity|qty|poids|weight|prix|price|montant|total|email|e-?mail|courriel|هاتف|مورد|حالة|تاريخ|اسم|عميل|عنوان|ملاحظة|كمية|وزن|سعر|بريد)$/i.test(
    value.trim(),
  )
}

function valueWeight(value: string): number {
  let weight = 1
  if (/\d/.test(value)) weight += 2
  if (value.length >= 6) weight += 1
  if (!/\s/.test(value)) weight += 1
  if (/^[A-Z0-9._/-]+$/i.test(value)) weight += 1
  return weight
}

export function detectCodeColumn(rows: string[][]): number {
  const maxColumns = Math.min(12, rows.reduce((max, row) => Math.max(max, row.length), 0))
  let bestColumn = 0
  let bestScore = 0

  for (let column = 0; column < maxColumns; column += 1) {
    const values = rows
      .map((row) => row[column])
      .filter((value) => isLikelyCode(value))
      .map((value) => normalizeCode(value))
    if (!values.length) continue

    const distinct = new Set(values)
    let score = 0
    for (const value of distinct) score += valueWeight(value)
    score += Math.min(4, distinct.size * 0.35)

    const first = rows[0]?.[column]
    if (isHeaderValue(first)) score += 20
    else if (looksLikeMetadataHeader(first)) score -= 100

    if (score > bestScore) {
      bestScore = score
      bestColumn = column
    }
  }
  return bestColumn
}

export function analyzeRows(rows: string[][], column: number): ImportAnalysis {
  const hasHeader = isHeaderValue(rows[0]?.[column])
  const codes: string[] = []
  const seen = new Set<string>()
  const duplicateSamples: string[] = []
  const rejectedSamples: string[] = []
  let duplicates = 0
  let rejected = 0
  let empty = 0

  rows.forEach((row, index) => {
    if (index === 0 && hasHeader) return
    const raw = row[column] ?? ''
    const code = normalizeCode(raw)
    if (!code) {
      empty += 1
      return
    }
    if (!isLikelyCode(code)) {
      rejected += 1
      if (rejectedSamples.length < 8) rejectedSamples.push(String(raw).slice(0, 80))
      return
    }
    if (seen.has(code)) {
      duplicates += 1
      if (duplicateSamples.length < 8) duplicateSamples.push(code)
      return
    }
    seen.add(code)
    codes.push(code)
  })

  return {
    rows,
    column,
    hasHeader,
    codes,
    duplicates,
    duplicateSamples,
    rejected,
    rejectedSamples,
    empty,
    totalRows: rows.length,
  }
}

export function columnLabel(rows: string[][], column: number): string {
  const first = rows[0]?.[column]
  if (first && isHeaderValue(first)) return String(first).trim()
  return `#${column + 1}`
}

export function previewRows(rows: string[][], column: number, count = 6): string[][] {
  const start = isHeaderValue(rows[0]?.[column]) ? 1 : 0
  return rows
    .slice(start, start + count)
    .map((row) => row.map((value) => String(value ?? '')))
}
