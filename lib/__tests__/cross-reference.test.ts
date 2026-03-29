import { describe, it, expect } from 'vitest'
import { Product } from '@prisma/client'
import {
  voltagesCompatible,
  mountingCompatible,
  runHardRejects,
  rangeOverlapScore,
  scoreMatch,
  determineMatchType,
  type ProductWithManufacturer,
} from '../cross-reference'

// ─── Test Fixture Factory ────────────────────────────────────────────────────

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'test-id',
    manufacturerId: 'mfr-1',
    categoryId: null,
    catalogNumber: 'TEST-100',
    familyName: null,
    displayName: 'Test Fixture',
    description: null,
    isActive: true,
    environment: null,
    application: null,
    wattage: 40,
    wattageMin: null,
    wattageMax: null,
    voltage: null,
    dimmable: null,
    dimmingType: [],
    powerFactor: null,
    lumens: 4000,
    lumensMin: null,
    lumensMax: null,
    efficacy: null,
    cri: 80,
    cctOptions: [3500, 4000, 5000],
    colorTemp: null,
    beamAngle: null,
    formFactor: '2X4',
    dimensions: null,
    weight: null,
    finish: null,
    ipRating: null,
    nemaRating: null,
    mountingType: ['RECESSED'],
    wetLocation: null,
    dampLocation: null,
    ulListed: null,
    dlcListed: null,
    dlcPremium: null,
    energyStar: null,
    title24: null,
    emergencyBackup: null,
    operatingTempMin: null,
    operatingTempMax: null,
    warranty: null,
    lifespan: null,
    specSheetUrl: null,
    installGuideUrl: null,
    cadFileUrl: null,
    iesFileUrl: null,
    thumbnailUrl: null,
    overallConfidence: 0.8,
    fieldProvenance: {},
    pageUrl: null,
    canonicalType: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Product
}

function makeProductWithMfr(overrides: Partial<Product> = {}): ProductWithManufacturer {
  return {
    ...makeProduct(overrides),
    manufacturer: { name: 'Test Mfr', slug: 'test-mfr' },
    category: null,
  }
}

// ─── voltagesCompatible ──────────────────────────────────────────────────────

describe('voltagesCompatible', () => {
  it('returns true when either is null', () => {
    expect(voltagesCompatible(null, 'V120')).toBe(true)
    expect(voltagesCompatible('V120', null)).toBe(true)
    expect(voltagesCompatible(null, null)).toBe(true)
  })

  it('returns true when either is UNIVERSAL', () => {
    expect(voltagesCompatible('UNIVERSAL', 'V120')).toBe(true)
    expect(voltagesCompatible('V277', 'UNIVERSAL')).toBe(true)
  })

  it('returns true when either is V120_277', () => {
    expect(voltagesCompatible('V120_277', 'V120')).toBe(true)
    expect(voltagesCompatible('V277', 'V120_277')).toBe(true)
  })

  it('returns true for same voltage', () => {
    expect(voltagesCompatible('V120', 'V120')).toBe(true)
  })

  it('returns false for different specific voltages', () => {
    expect(voltagesCompatible('V120', 'V277')).toBe(false)
  })
})

// ─── mountingCompatible ──────────────────────────────────────────────────────

describe('mountingCompatible', () => {
  it('returns true when either is empty', () => {
    expect(mountingCompatible([], ['RECESSED'])).toBe(true)
    expect(mountingCompatible(['SURFACE'], [])).toBe(true)
  })

  it('returns true for overlapping types', () => {
    expect(mountingCompatible(['RECESSED', 'SURFACE'], ['SURFACE', 'PENDANT'])).toBe(true)
  })

  it('returns false for no overlap', () => {
    expect(mountingCompatible(['RECESSED'], ['SURFACE', 'PENDANT'])).toBe(false)
  })
})

// ─── runHardRejects ──────────────────────────────────────────────────────────

describe('runHardRejects', () => {
  it('returns null when products are compatible', () => {
    const source = makeProductWithMfr()
    const target = makeProductWithMfr()
    expect(runHardRejects(source, target)).toBeNull()
  })

  it('rejects environment mismatch', () => {
    const source = makeProductWithMfr({ environment: 'INDOOR' })
    const target = makeProductWithMfr({ environment: 'OUTDOOR' })
    const result = runHardRejects(source, target)
    expect(result).not.toBeNull()
    expect(result!.reason).toBe('environment_mismatch')
  })

  it('allows BOTH environment', () => {
    const source = makeProductWithMfr({ environment: 'INDOOR' })
    const target = makeProductWithMfr({ environment: 'BOTH' })
    expect(runHardRejects(source, target)).toBeNull()
  })

  it('rejects emergency backup mismatch', () => {
    const source = makeProductWithMfr({ emergencyBackup: true })
    const target = makeProductWithMfr({ emergencyBackup: false })
    const result = runHardRejects(source, target)
    expect(result).not.toBeNull()
    expect(result!.reason).toBe('emergency_mismatch')
  })

  it('allows non-emergency source with emergency target', () => {
    const source = makeProductWithMfr({ emergencyBackup: false })
    const target = makeProductWithMfr({ emergencyBackup: true })
    expect(runHardRejects(source, target)).toBeNull()
  })

  it('rejects voltage incompatible', () => {
    const source = makeProductWithMfr({ voltage: 'V120' })
    const target = makeProductWithMfr({ voltage: 'V277' })
    const result = runHardRejects(source, target)
    expect(result).not.toBeNull()
    expect(result!.reason).toBe('voltage_incompatible')
  })

  it('rejects mounting incompatible', () => {
    const source = makeProductWithMfr({ mountingType: ['RECESSED'] })
    const target = makeProductWithMfr({ mountingType: ['PENDANT'] })
    const result = runHardRejects(source, target)
    expect(result).not.toBeNull()
    expect(result!.reason).toBe('mounting_incompatible')
  })

  it('rejects CCT incompatible (zero overlap with ≥2 source options)', () => {
    const source = makeProductWithMfr({ cctOptions: [3000, 3500] })
    const target = makeProductWithMfr({ cctOptions: [5000, 6500] })
    const result = runHardRejects(source, target)
    expect(result).not.toBeNull()
    expect(result!.reason).toBe('cct_incompatible')
  })

  it('allows CCT when source has only 1 option', () => {
    const source = makeProductWithMfr({ cctOptions: [3000] })
    const target = makeProductWithMfr({ cctOptions: [5000] })
    expect(runHardRejects(source, target)).toBeNull()
  })

  it('rejects form factor mismatch for troffers', () => {
    const source = makeProductWithMfr({ formFactor: '2X4' })
    const target = makeProductWithMfr({ formFactor: '2X2' })
    const result = runHardRejects(source, target)
    expect(result).not.toBeNull()
    expect(result!.reason).toBe('form_factor_incompatible')
  })

  it('rejects form factor mismatch for downlights', () => {
    const source = makeProductWithMfr({ formFactor: '4_INCH' })
    const target = makeProductWithMfr({ formFactor: '6_INCH' })
    const result = runHardRejects(source, target)
    expect(result).not.toBeNull()
    expect(result!.reason).toBe('form_factor_incompatible')
  })

  it('does NOT hard-reject cross-category form factor (troffer vs downlight)', () => {
    const source = makeProductWithMfr({ formFactor: '2X4' })
    const target = makeProductWithMfr({ formFactor: '6_INCH' })
    expect(runHardRejects(source, target)).toBeNull()
  })
})

// ─── rangeOverlapScore ───────────────────────────────────────────────────────

describe('rangeOverlapScore', () => {
  it('returns 0.5 when data is missing', () => {
    expect(rangeOverlapScore(null, null, null, null, null, null, 0.10)).toBe(0.5)
  })

  it('returns 1.0 for exact point match', () => {
    expect(rangeOverlapScore(4000, null, null, 4000, null, null, 0.10)).toBe(1.0)
  })

  it('returns 0 for no overlap', () => {
    // source 1000-2000, target 5000-6000, 10% tolerance
    expect(rangeOverlapScore(1500, 1000, 2000, 5500, 5000, 6000, 0.10)).toBe(0)
  })

  it('returns 1.0 for full overlap', () => {
    // source 3000-5000, target 3000-5000
    expect(rangeOverlapScore(4000, 3000, 5000, 4000, 3000, 5000, 0.10)).toBe(1.0)
  })

  it('returns partial score for partial overlap', () => {
    // source 3000-5000, target 4500-6000 — moderate overlap
    const score = rangeOverlapScore(4000, 3000, 5000, 5000, 4500, 6000, 0.10)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(1.0)
  })
})

// ─── scoreMatch ──────────────────────────────────────────────────────────────

describe('scoreMatch', () => {
  it('gives high score for identical products', () => {
    const product = makeProduct()
    const result = scoreMatch(product, { ...product })
    expect(result.score).toBeGreaterThanOrEqual(0.80)
  })

  it('gives lower score for different form factors', () => {
    const source = makeProduct({ formFactor: '2X4' })
    const target = makeProduct({ formFactor: 'ROUND' })
    const result = scoreMatch(source, target)
    // Missing form factor match = 0 out of 0.20 weight
    expect(result.score).toBeLessThan(scoreMatch(source, source).score)
  })

  it('includes reasons array', () => {
    const source = makeProduct()
    const target = makeProduct()
    const result = scoreMatch(source, target)
    expect(result.reasons).toBeInstanceOf(Array)
    expect(result.reasons.length).toBeGreaterThan(0)
  })

  it('penalizes wet location downgrade', () => {
    const source = makeProduct({ wetLocation: true })
    const target = makeProduct({ wetLocation: false })
    const withPenalty = scoreMatch(source, target)
    const withoutPenalty = scoreMatch(source, makeProduct({ wetLocation: true }))
    expect(withPenalty.score).toBeLessThan(withoutPenalty.score)
  })

  it('penalizes NEMA rating downgrade', () => {
    const source = makeProduct({ nemaRating: '4X' })
    const target = makeProduct({ nemaRating: null })
    const withPenalty = scoreMatch(source, target)
    const withoutPenalty = scoreMatch(source, makeProduct({ nemaRating: '4X' }))
    expect(withPenalty.score).toBeLessThan(withoutPenalty.score)
  })

  it('rewards dimming match', () => {
    const source = makeProduct({ dimmable: true, dimmingType: ['TRIAC'] })
    const target = makeProduct({ dimmable: true, dimmingType: ['TRIAC'] })
    const result = scoreMatch(source, target)
    expect(result.reasons).toEqual(
      expect.arrayContaining([expect.stringContaining('Dimming')])
    )
  })

  it('score is between 0 and 1', () => {
    const source = makeProduct()
    const target = makeProduct({
      lumens: 100,
      cri: 50,
      cctOptions: [6500],
      wattage: 200,
    })
    const result = scoreMatch(source, target)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })
})

// ─── determineMatchType ──────────────────────────────────────────────────────

describe('determineMatchType', () => {
  const base = makeProduct()

  it('returns DIRECT_REPLACEMENT for score >= 0.90', () => {
    expect(determineMatchType(0.90, base, base)).toBe('DIRECT_REPLACEMENT')
    expect(determineMatchType(0.95, base, base)).toBe('DIRECT_REPLACEMENT')
  })

  it('returns FUNCTIONAL_EQUIVALENT for score >= 0.75', () => {
    expect(determineMatchType(0.75, base, base)).toBe('FUNCTIONAL_EQUIVALENT')
    expect(determineMatchType(0.89, base, base)).toBe('FUNCTIONAL_EQUIVALENT')
  })

  it('returns UPGRADE when target has higher lumens and score >= 0.60', () => {
    const target = makeProduct({ lumens: 6000 }) // 50% more than source 4000
    expect(determineMatchType(0.65, base, target)).toBe('UPGRADE')
  })

  it('returns SIMILAR for score >= 0.60 without lumen upgrade', () => {
    expect(determineMatchType(0.65, base, base)).toBe('SIMILAR')
  })

  it('returns BUDGET_ALTERNATIVE for low scores', () => {
    expect(determineMatchType(0.50, base, base)).toBe('BUDGET_ALTERNATIVE')
    expect(determineMatchType(0.30, base, base)).toBe('BUDGET_ALTERNATIVE')
  })
})
