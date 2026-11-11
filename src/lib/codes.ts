/**
 * Canonical parcel-code handling.
 *
 * Codes are always strings. We never convert them to numbers, so leading zeros
 * survive import, manual entry and scanning. Matching is case-insensitive by
 * normalising to upper case; the canonical form is what gets stored.
 */
export function normalizeCode(value: unknown): string {
  let text = String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()

  if (!text) return ''

  // Support scanner output that is a share link (e.g. a delivery URL).
  if (/^https?:\/\//i.test(text) || /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+\//i.test(text)) {
    try {
      const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
      const segment = url.pathname.split('/').filter(Boolean).pop()
      if (segment) text = decodeURIComponent(segment).trim()
    } catch {
      /* keep the raw value */
    }
  }

  return text.toUpperCase()
}

export function isValidCode(value: string): boolean {
  const code = normalizeCode(value)
  if (code.length < 2 || code.length > 120) return false
  if (/\s{2,}/.test(code)) return false
  return /[0-9A-Z\u0600-\u06FF]/.test(code)
}

export function parseCodeBlob(text: string): string[] {
  return String(text ?? '')
    .split(/[\n\r,;\t]+/)
    .map((line) => normalizeCode(line))
    .filter(Boolean)
}

const HEADER_PATTERN =
  /^(?:code(?:\s*[-_ ]?\s*barres?)?(?:\s*(?:colis|suivi|tracking))?|code[-_ ]?barres?|barcode|tracking(?:\s*(?:number|no|code))?|suivi|num[ée]ro|n[°o]|colis|parcels?|reference|r[ée]f[ée]rence|exp[ée]dition|shipment|waybill|awb|return|retour|(?:رمز|باركود)(?:\s+الطرد)?|(?:رقم|تتبع)(?:\s+التتبع)?|طرد|مرتجع)$/i

export function isHeaderValue(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false
  return HEADER_PATTERN.test(String(value).trim())
}

export function isLikelyCode(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false
  const text = String(value).trim()
  if (!text || text.length > 160) return false
  if (isHeaderValue(text)) return false
  return isValidCode(text)
}

export function highlightParts(value: string, query: string): { text: string; hit: boolean }[] {
  const needle = query.trim()
  if (!needle) return [{ text: value, hit: false }]
  const lowerValue = value.toLocaleLowerCase()
  const lowerNeedle = needle.toLocaleLowerCase()
  const index = lowerValue.indexOf(lowerNeedle)
  if (index < 0) return [{ text: value, hit: false }]
  return [
    { text: value.slice(0, index), hit: false },
    { text: value.slice(index, index + needle.length), hit: true },
    { text: value.slice(index + needle.length), hit: false },
  ].filter((part) => part.text.length > 0)
}
