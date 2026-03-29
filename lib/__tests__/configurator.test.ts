import { describe, it, expect } from 'vitest'
import {
  buildCatalogString,
  parseExistingCatalog,
  validateMatrixFieldPresence,
  type OrderingMatrixData,
} from '../configurator'

// ─── Test Fixture ────────────────────────────────────────────────────────────

function makeMatrix(overrides: Partial<OrderingMatrixData> = {}): OrderingMatrixData {
  return {
    id: 'matrix-1',
    matrixType: 'configurable',
    baseFamily: 'GTL4',
    separator: '-',
    sampleNumber: 'GTL4-40L-835-MVOLT',
    columns: [
      {
        position: 1, label: 'Lumens', shortLabel: 'LM',
        required: true,
        options: [
          { code: '20L', description: '2000 lumens' },
          { code: '40L', description: '4000 lumens' },
          { code: '60L', description: '6000 lumens' },
        ],
      },
      {
        position: 2, label: 'CCT', shortLabel: 'CCT',
        required: true,
        options: [
          { code: '835', description: '3500K' },
          { code: '840', description: '4000K' },
          { code: '850', description: '5000K' },
        ],
      },
      {
        position: 3, label: 'Voltage', shortLabel: 'V',
        required: true,
        options: [
          { code: 'MVOLT', description: '120-277V' },
          { code: '347', description: '347V' },
        ],
      },
      {
        position: 4, label: 'Driver', shortLabel: 'DRV',
        required: false,
        options: [
          { code: 'DIM', description: '0-10V Dimming', constraints: ['Requires 0-10V compatible controller'] },
          { code: 'NODIM', description: 'Non-dimming' },
        ],
      },
    ],
    suffixOptions: [
      { code: 'EM', description: 'Emergency battery pack' },
      { code: 'WG', description: 'Wire guard', constraints: ['Adds 2" to fixture depth'] },
    ],
    skuEntries: [],
    uiMode: { showQuickPicks: false, showCustomBuilder: true },
    ...overrides,
  }
}

// ─── buildCatalogString ──────────────────────────────────────────────────────

describe('buildCatalogString', () => {
  it('builds catalog string from selections', () => {
    const matrix = makeMatrix()
    const result = buildCatalogString(matrix, { '1': '40L', '2': '835', '3': 'MVOLT' }, [])
    expect(result.catalogString).toBe('40L-835-MVOLT')
    expect(result.isComplete).toBe(true)
    expect(result.missingColumns).toEqual([])
  })

  it('includes suffix codes', () => {
    const matrix = makeMatrix()
    const result = buildCatalogString(matrix, { '1': '40L', '2': '835', '3': 'MVOLT' }, ['EM'])
    expect(result.catalogString).toBe('40L-835-MVOLT-EM')
  })

  it('reports missing required columns', () => {
    const matrix = makeMatrix()
    const result = buildCatalogString(matrix, { '1': '40L' }, [])
    expect(result.isComplete).toBe(false)
    expect(result.missingColumns).toContain('CCT')
    expect(result.missingColumns).toContain('Voltage')
  })

  it('does not report missing optional columns', () => {
    const matrix = makeMatrix()
    const result = buildCatalogString(matrix, { '1': '40L', '2': '835', '3': 'MVOLT' }, [])
    expect(result.missingColumns).not.toContain('Driver')
  })

  it('includes optional columns when selected', () => {
    const matrix = makeMatrix()
    const result = buildCatalogString(
      matrix,
      { '1': '40L', '2': '835', '3': 'MVOLT', '4': 'DIM' },
      []
    )
    expect(result.catalogString).toBe('40L-835-MVOLT-DIM')
  })

  it('collects constraint warnings from options', () => {
    const matrix = makeMatrix()
    const result = buildCatalogString(
      matrix,
      { '1': '40L', '2': '835', '3': 'MVOLT', '4': 'DIM' },
      []
    )
    expect(result.warnings).toContain('Requires 0-10V compatible controller')
  })

  it('collects constraint warnings from suffixes', () => {
    const matrix = makeMatrix()
    const result = buildCatalogString(
      matrix,
      { '1': '40L', '2': '835', '3': 'MVOLT' },
      ['WG']
    )
    expect(result.warnings).toContain('Adds 2" to fixture depth')
  })

  it('builds segments with descriptions', () => {
    const matrix = makeMatrix()
    const result = buildCatalogString(matrix, { '1': '40L', '2': '835', '3': 'MVOLT' }, [])
    expect(result.segments).toHaveLength(3)
    expect(result.segments[0]).toEqual({
      position: 1, label: 'LM', code: '40L', description: '4000 lumens',
    })
  })

  it('uses custom separator', () => {
    const matrix = makeMatrix({ separator: ' ' })
    const result = buildCatalogString(matrix, { '1': '40L', '2': '835', '3': 'MVOLT' }, [])
    expect(result.catalogString).toBe('40L 835 MVOLT')
  })

  it('returns isComplete false for empty selections', () => {
    const matrix = makeMatrix()
    const result = buildCatalogString(matrix, {}, [])
    expect(result.isComplete).toBe(false)
    expect(result.segments).toHaveLength(0)
  })
})

// ─── parseExistingCatalog ────────────────────────────────────────────────────

describe('parseExistingCatalog', () => {
  it('parses a complete catalog string', () => {
    const matrix = makeMatrix()
    const result = parseExistingCatalog('40L-835-MVOLT', matrix)
    expect(result.columnSelections).toEqual({ '1': '40L', '2': '835', '3': 'MVOLT' })
    expect(result.confidence).toBe(1)
    expect(result.unparsed).toEqual([])
  })

  it('parses catalog string with suffix', () => {
    const matrix = makeMatrix()
    const result = parseExistingCatalog('40L-835-MVOLT-DIM-EM', matrix)
    expect(result.columnSelections['4']).toBe('DIM')
    expect(result.suffixSelections).toContain('EM')
  })

  it('puts unrecognized segments in unparsed', () => {
    const matrix = makeMatrix()
    const result = parseExistingCatalog('40L-835-MVOLT-CUSTOM', matrix)
    expect(result.unparsed).toContain('CUSTOM')
  })

  it('is case insensitive', () => {
    const matrix = makeMatrix()
    const result = parseExistingCatalog('40l-835-mvolt', matrix)
    expect(result.columnSelections['1']).toBe('40L')
    expect(result.columnSelections['3']).toBe('MVOLT')
  })

  it('returns 0 confidence when no required columns matched', () => {
    const matrix = makeMatrix()
    const result = parseExistingCatalog('XYZ-ABC-123', matrix)
    expect(result.confidence).toBe(0)
  })

  it('returns partial confidence for partial match', () => {
    const matrix = makeMatrix()
    const result = parseExistingCatalog('40L-XYZ-MVOLT', matrix)
    // 2 of 3 required columns matched
    expect(result.confidence).toBeCloseTo(2 / 3, 2)
  })
})

// ─── validateMatrixFieldPresence ─────────────────────────────────────────────

describe('validateMatrixFieldPresence', () => {
  it('requires columns for configurable', () => {
    expect(validateMatrixFieldPresence('configurable', false, false)).toBe('CONFIGURABLE requires columns')
    expect(validateMatrixFieldPresence('configurable', true, false)).toBeNull()
  })

  it('requires skuTable for sku_table', () => {
    expect(validateMatrixFieldPresence('sku_table', false, false)).toBe('SKU_TABLE requires skuTable')
    expect(validateMatrixFieldPresence('sku_table', false, true)).toBeNull()
  })

  it('requires both for hybrid', () => {
    expect(validateMatrixFieldPresence('hybrid', false, true)).toBe('HYBRID requires columns')
    expect(validateMatrixFieldPresence('hybrid', true, false)).toBe('HYBRID requires skuTable')
    expect(validateMatrixFieldPresence('hybrid', true, true)).toBeNull()
  })
})
