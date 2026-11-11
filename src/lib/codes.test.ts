import { describe, expect, it } from 'vitest'
import {
  highlightParts,
  isHeaderValue,
  isLikelyCode,
  isValidCode,
  normalizeCode,
  parseCodeBlob,
} from './codes'

describe('normalizeCode', () => {
  it('keeps leading zeros and upper-cases the code', () => {
    expect(normalizeCode('001234')).toBe('001234')
    expect(normalizeCode('ab-0012')).toBe('AB-0012')
    expect(normalizeCode(1234)).toBe('1234')
  })

  it('trims whitespace, BOM, zero-width characters and control characters', () => {
    expect(normalizeCode('  \uFEFFMA-001\u200B  ')).toBe('MA-001')
    expect(normalizeCode('AB\u0000C\u001F')).toBe('ABC')
    expect(normalizeCode('A\u00A0B')).toBe('A B')
  })

  it('extracts the last path segment from scanner share links', () => {
    expect(normalizeCode('https://example.com/track/001234')).toBe('001234')
    expect(normalizeCode('https://example.com/suivi/AB%2D42?ref=1')).toBe('AB-42')
    expect(normalizeCode('www.example.com/parcel/0099')).toBe('0099')
  })

  it('returns an empty string for empty values', () => {
    expect(normalizeCode('')).toBe('')
    expect(normalizeCode('   ')).toBe('')
    expect(normalizeCode(null)).toBe('')
    expect(normalizeCode(undefined)).toBe('')
  })
})

describe('isValidCode', () => {
  it('accepts real parcel codes, including Arabic text', () => {
    expect(isValidCode('001234')).toBe(true)
    expect(isValidCode('MA-001/2024')).toBe(true)
    expect(isValidCode('طرد-001')).toBe(true)
  })

  it('rejects empty, too short, too long and whitespace-heavy values', () => {
    expect(isValidCode('')).toBe(false)
    expect(isValidCode('A')).toBe(false)
    expect(isValidCode('A'.repeat(121))).toBe(false)
    expect(isValidCode('AB   CD')).toBe(false)
    expect(isValidCode('---')).toBe(false)
  })
})

describe('header helpers', () => {
  it('recognises localised header labels', () => {
    for (const label of ['code', 'Code-barres', 'tracking number', 'Suivi', 'N°', 'colis', 'رمز', 'رقم التتبع']) {
      expect(isHeaderValue(label)).toBe(true)
    }
    expect(isHeaderValue('001234')).toBe(false)
    expect(isHeaderValue('AB-99')).toBe(false)
  })

  it('rejects headers when looking for likely codes', () => {
    expect(isLikelyCode('code')).toBe(false)
    expect(isLikelyCode('001234')).toBe(true)
    expect(isLikelyCode('')).toBe(false)
  })
})

describe('parseCodeBlob', () => {
  it('splits on commas, semicolons, tabs and new lines while normalising', () => {
    expect(parseCodeBlob('001,ab-2\n003;004\t005\r\n')).toEqual([
      '001',
      'AB-2',
      '003',
      '004',
      '005',
    ])
  })

  it('drops empty segments', () => {
    expect(parseCodeBlob(',,\n ; \t')).toEqual([])
  })
})

describe('highlightParts', () => {
  it('returns the matching slice', () => {
    expect(highlightParts('AB-00123', '001')).toEqual([
      { text: 'AB-', hit: false },
      { text: '001', hit: true },
      { text: '23', hit: false },
    ])
  })

  it('is case-insensitive and returns a single part when there is no match', () => {
    expect(highlightParts('AB-00123', 'ab-0')).toEqual([
      { text: 'AB-0', hit: true },
      { text: '0123', hit: false },
    ])
    expect(highlightParts('AB-00123', 'zzz')).toEqual([{ text: 'AB-00123', hit: false }])
  })

  it('handles an empty query', () => {
    expect(highlightParts('AB-1', '')).toEqual([{ text: 'AB-1', hit: false }])
  })
})
