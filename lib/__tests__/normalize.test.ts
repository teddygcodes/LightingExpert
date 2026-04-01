import { describe, it, expect } from 'vitest'
import {
  normalizeFormFactor,
  normalizeVoltage,
  normalizeVoltageList,
  normalizeDimmingTypes,
  normalizeMountingTypes,
  pickBestSpecSheet,
} from '../crawler/normalize'

// ─── normalizeFormFactor ─────────────────────────────────────────────────────

describe('normalizeFormFactor', () => {
  it('maps 2x4 variants to 2X4', () => {
    expect(normalizeFormFactor('2x4')).toBe('2X4')
    expect(normalizeFormFactor('2 x 4')).toBe('2X4')
    expect(normalizeFormFactor("2'x4'")).toBe('2X4')
    expect(normalizeFormFactor('24x48')).toBe('2X4')
    expect(normalizeFormFactor('2ft x 4ft')).toBe('2X4')
  })

  it('maps 2x2 variants to 2X2', () => {
    expect(normalizeFormFactor('2x2')).toBe('2X2')
    expect(normalizeFormFactor('2 x 2')).toBe('2X2')
  })

  it('maps 1x4 variants to 1X4', () => {
    expect(normalizeFormFactor('1x4')).toBe('1X4')
    expect(normalizeFormFactor('12x48')).toBe('1X4')
  })

  it('maps downlight sizes', () => {
    expect(normalizeFormFactor('4"')).toBe('4_INCH_ROUND')
    expect(normalizeFormFactor('4 inch')).toBe('4_INCH_ROUND')
    expect(normalizeFormFactor('6-inch')).toBe('6_INCH_ROUND')
    expect(normalizeFormFactor('8in')).toBe('8_INCH_ROUND')
  })

  it('maps square downlights', () => {
    expect(normalizeFormFactor('4"sq')).toBe('4_INCH_SQUARE')
    expect(normalizeFormFactor('6" square')).toBe('6_INCH_SQUARE')
  })

  it('uppercases unknown values', () => {
    expect(normalizeFormFactor('strip light')).toBe('STRIP LIGHT')
    expect(normalizeFormFactor('custom')).toBe('CUSTOM')
  })

  it('trims whitespace', () => {
    expect(normalizeFormFactor('  2x4  ')).toBe('2X4')
  })
})

// ─── normalizeVoltage ────────────────────────────────────────────────────────

describe('normalizeVoltage', () => {
  it('maps 120 to V120', () => {
    expect(normalizeVoltage('120')).toBe('V120')
    expect(normalizeVoltage('120v')).toBe('V120')
  })

  it('maps 277 to V277', () => {
    expect(normalizeVoltage('277')).toBe('V277')
  })

  it('maps 120/277 variants to V120_277', () => {
    expect(normalizeVoltage('120/277')).toBe('V120_277')
    expect(normalizeVoltage('120-277')).toBe('V120_277')
    expect(normalizeVoltage('120v/277v')).toBe('V120_277')
  })

  it('maps universal variants', () => {
    expect(normalizeVoltage('universal')).toBe('UNIVERSAL')
    expect(normalizeVoltage('multi-volt')).toBe('UNIVERSAL')
    expect(normalizeVoltage('multivolt')).toBe('UNIVERSAL')
  })

  it('maps 347/480 variants', () => {
    expect(normalizeVoltage('347/480')).toBe('V347_480')
    expect(normalizeVoltage('347-480')).toBe('V347_480')
  })

  it('returns undefined for unknown voltage', () => {
    expect(normalizeVoltage('999')).toBeUndefined()
    expect(normalizeVoltage('unknown')).toBeUndefined()
  })

  it('is case insensitive', () => {
    expect(normalizeVoltage('UNIVERSAL')).toBe('UNIVERSAL')
    expect(normalizeVoltage('Universal')).toBe('UNIVERSAL')
  })
})

// ─── normalizeVoltageList ────────────────────────────────────────────────────

describe('normalizeVoltageList', () => {
  it('single token delegates to normalizeVoltage', () => {
    expect(normalizeVoltageList('120')).toBe('V120')
    expect(normalizeVoltageList('120-277')).toBe('V120_277')
    expect(normalizeVoltageList('universal')).toBe('UNIVERSAL')
  })

  it('multi-token spanning 120-480 returns UNIVERSAL', () => {
    expect(normalizeVoltageList('120, 120-277, 208, 240, 277, 347, 347-480, 480')).toBe('UNIVERSAL')
  })

  it('multi-token with 277 and 347 returns UNIVERSAL', () => {
    expect(normalizeVoltageList('120, 120-277, 208, 240, 277, 277-480, 347, 347-480, 480')).toBe('UNIVERSAL')
  })

  it('multi-token with 120 and 277 but no high voltage returns V120_277', () => {
    expect(normalizeVoltageList('120, 120-277, 208, 240, 277')).toBe('V120_277')
  })

  it('infers V120_277 from separate 120 and 277 tokens', () => {
    expect(normalizeVoltageList('120, 277')).toBe('V120_277')
  })

  it('MVOLT/XVOLT/HVOLT keywords return UNIVERSAL', () => {
    expect(normalizeVoltageList('120, 208, 240, 277, 347, 480, HVOLT, MVOLT, XVOLT')).toBe('UNIVERSAL')
  })

  it('empty string returns undefined', () => {
    expect(normalizeVoltageList('')).toBeUndefined()
  })

  it('handles DC voltage tokens gracefully', () => {
    // Products like Phuzion Crane Light: "120, 120-277, 125VDC, 208, 240, 250VDC, 277, 277-480, 347, 347-480, 480"
    expect(normalizeVoltageList('120, 120-277, 125VDC, 208, 240, 250VDC, 277, 277-480, 347, 347-480, 480')).toBe('UNIVERSAL')
  })

  it('single unknown token returns undefined', () => {
    expect(normalizeVoltageList('Low Voltage')).toBeUndefined()
  })
})

// ─── normalizeDimmingTypes ───────────────────────────────────────────────────

describe('normalizeDimmingTypes', () => {
  it('parses single dimming type', () => {
    expect(normalizeDimmingTypes('0-10v')).toEqual(['V0_10'])
    expect(normalizeDimmingTypes('DALI')).toEqual(['DALI'])
    expect(normalizeDimmingTypes('triac')).toEqual(['TRIAC'])
  })

  it('parses comma-separated types', () => {
    const result = normalizeDimmingTypes('0-10v, DALI')
    expect(result).toContain('V0_10')
    expect(result).toContain('DALI')
  })

  it('parses slash-separated types', () => {
    const result = normalizeDimmingTypes('triac/elv')
    expect(result).toContain('TRIAC')
    expect(result).toContain('ELV')
  })

  it('deduplicates', () => {
    const result = normalizeDimmingTypes('0-10v, 0-10')
    expect(result).toEqual(['V0_10'])
  })

  it('maps Acuity-specific labels', () => {
    expect(normalizeDimmingTypes('digital')).toEqual(['V0_10'])
    expect(normalizeDimmingTypes('dim to off')).toEqual(['V0_10'])
  })

  it('ignores unknown types', () => {
    expect(normalizeDimmingTypes('unknown-type')).toEqual([])
  })

  it('handles empty string', () => {
    expect(normalizeDimmingTypes('')).toEqual([])
  })
})

// ─── normalizeMountingTypes ──────────────────────────────────────────────────

describe('normalizeMountingTypes', () => {
  it('parses single mounting type', () => {
    expect(normalizeMountingTypes('recessed')).toEqual(['RECESSED'])
    expect(normalizeMountingTypes('surface')).toEqual(['SURFACE'])
    expect(normalizeMountingTypes('pendant')).toEqual(['PENDANT'])
  })

  it('parses compound types', () => {
    expect(normalizeMountingTypes('surface mount')).toEqual(['SURFACE'])
    expect(normalizeMountingTypes('wall mount')).toEqual(['WALL'])
  })

  it('parses comma-separated types', () => {
    const result = normalizeMountingTypes('recessed, surface')
    expect(result).toContain('RECESSED')
    expect(result).toContain('SURFACE')
  })

  it('maps t-bar variants to GRID_TBAR', () => {
    expect(normalizeMountingTypes('t-bar')).toEqual(['GRID_TBAR'])
    expect(normalizeMountingTypes('tbar')).toEqual(['GRID_TBAR'])
    expect(normalizeMountingTypes('grid')).toEqual(['GRID_TBAR'])
  })

  it('deduplicates', () => {
    const result = normalizeMountingTypes('surface, surface mount')
    expect(result).toEqual(['SURFACE'])
  })
})

// ─── pickBestSpecSheet ───────────────────────────────────────────────────────

describe('pickBestSpecSheet', () => {
  it('returns null for empty list', () => {
    expect(pickBestSpecSheet([], '12345')).toBeNull()
  })

  it('prefers own-product links', () => {
    const links = [
      { label: 'Other Spec', url: '/api/products/getasset/brand/99999/1/other.pdf' },
      { label: 'Own Spec', url: '/api/products/getasset/brand/12345/2/own.pdf' },
    ]
    const result = pickBestSpecSheet(links, '12345')
    expect(result?.label).toBe('Own Spec')
  })

  it('excludes accessory documents', () => {
    const links = [
      { label: 'Wire Guard', url: '/api/products/getasset/brand/12345/1/ela-wg.pdf' },
      { label: 'Spec Sheet', url: '/api/products/getasset/brand/12345/2/spec.pdf' },
    ]
    const result = pickBestSpecSheet(links, '12345')
    expect(result?.label).toBe('Spec Sheet')
  })

  it('excludes accessory by label pattern', () => {
    const links = [
      { label: 'Wire Guard Accessory', url: '/api/products/getasset/brand/12345/1/doc.pdf' },
      { label: 'Product Spec', url: '/api/products/getasset/brand/12345/2/product.pdf' },
    ]
    const result = pickBestSpecSheet(links, '12345')
    expect(result?.label).toBe('Product Spec')
  })

  it('falls back to first link if all are accessories', () => {
    const links = [
      { label: 'Wire Guard', url: '/api/products/getasset/brand/12345/1/wire-guard.pdf' },
    ]
    const result = pickBestSpecSheet(links, '12345')
    expect(result?.label).toBe('Wire Guard')
  })

  it('falls back to all links when no own-product match', () => {
    const links = [
      { label: 'Spec Sheet', url: '/some/other/path/spec.pdf' },
    ]
    const result = pickBestSpecSheet(links, '12345')
    expect(result?.label).toBe('Spec Sheet')
  })
})
