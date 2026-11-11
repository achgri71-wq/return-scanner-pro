import { describe, expect, it } from 'vitest'
import {
  analyzeRows,
  columnLabel,
  detectCodeColumn,
  parseDelimited,
  previewRows,
} from './import-file'

describe('parseDelimited', () => {
  it('detects semicolons, tabs and commas', () => {
    expect(parseDelimited('code;name\n001;A')).toEqual([
      ['code', 'name'],
      ['001', 'A'],
    ])
    expect(parseDelimited('code\tname\n001\tA')).toEqual([
      ['code', 'name'],
      ['001', 'A'],
    ])
    expect(parseDelimited('code,name\n001,A')).toEqual([
      ['code', 'name'],
      ['001', 'A'],
    ])
  })

  it('handles quoted cells, escaped quotes and embedded delimiters', () => {
    expect(parseDelimited('code,name\n"001","A, B"\n"002","say ""hi"""')).toEqual([
      ['code', 'name'],
      ['001', 'A, B'],
      ['002', 'say "hi"'],
    ])
  })

  it('strips a UTF-8 BOM and ignores blank lines', () => {
    expect(parseDelimited('\uFEFFcode;name\r\n\r\n001;A\r\n')).toEqual([
      ['code', 'name'],
      ['001', 'A'],
    ])
  })

  it('parses a final row without a trailing newline', () => {
    expect(parseDelimited('code\n001')).toEqual([['code'], ['001']])
  })
})

describe('detectCodeColumn', () => {
  it('selects the code column over metadata columns', () => {
    const rows = [
      ['Nom', 'Téléphone', 'Code colis', 'Date'],
      ['Ali', '0600000000', '001234', '2026-10-01'],
      ['Aya', '0611111111', '001235', '2026-10-02'],
    ]
    expect(detectCodeColumn(rows)).toBe(2)
  })

  it('ignores headers when no code column exists', () => {
    const rows = [
      ['Nom', 'Ville'],
      ['Ali', 'Rabat'],
    ]
    expect(detectCodeColumn(rows)).toBe(0)
  })

  it('works when the code is the first column', () => {
    const rows = [
      ['Code', 'Nom'],
      ['AB-001234', 'Ali'],
      ['AB-001235', 'Aya'],
    ]
    expect(detectCodeColumn(rows)).toBe(0)
  })
})

describe('analyzeRows', () => {
  it('skips the header, preserves leading zeros and deduplicates', () => {
    const rows = [
      ['Code'],
      ['001234'],
      ['001234'],
      ['001235'],
      [''],
      ['A'],
    ]
    const analysis = analyzeRows(rows, 0)
    expect(analysis.hasHeader).toBe(true)
    expect(analysis.codes).toEqual(['001234', '001235'])
    expect(analysis.duplicates).toBe(1)
    expect(analysis.duplicateSamples).toEqual(['001234'])
    expect(analysis.empty).toBe(1)
    expect(analysis.rejected).toBe(1)
    expect(analysis.totalRows).toBe(6)
  })

  it('treats duplicate codes as case-insensitive', () => {
    const analysis = analyzeRows([['ab-12'], ['AB-12']], 0)
    expect(analysis.codes).toEqual(['AB-12'])
    expect(analysis.duplicates).toBe(1)
  })

  it('does not skip the first row when there is no header', () => {
    const analysis = analyzeRows([['001234'], ['001235']], 0)
    expect(analysis.hasHeader).toBe(false)
    expect(analysis.codes).toEqual(['001234', '001235'])
  })

  it('counts an entirely empty file gracefully', () => {
    const analysis = analyzeRows([], 0)
    expect(analysis.codes).toEqual([])
    expect(analysis.totalRows).toBe(0)
  })

  it('rejects values containing forbidden multi-space runs', () => {
    const analysis = analyzeRows([['AB  12']], 0)
    expect(analysis.rejected).toBe(1)
  })
})

describe('column labels and previews', () => {
  it('uses the localised header as label when present', () => {
    expect(columnLabel([['Code colis'], ['001']], 0)).toBe('Code colis')
    expect(columnLabel([['Nom'], ['Ali']], 0)).toBe('#1')
  })

  it('previews data rows without the header', () => {
    const rows = [
      ['Code', 'Nom'],
      ['001', 'Ali'],
      ['002', 'Aya'],
    ]
    expect(previewRows(rows, 0)).toEqual([
      ['001', 'Ali'],
      ['002', 'Aya'],
    ])
  })
})
