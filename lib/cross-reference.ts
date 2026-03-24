import { Product, MatchType, CrossRefSource, CanonicalFixtureType, Prisma } from '@prisma/client'
import { prisma } from './db'
import type { HardRejectReason, CrossRefMatch, CrossRefReject, ComparisonSnapshot } from './types'

// Voltage compatibility — UNIVERSAL is compatible with everything
function voltagesCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return true
  if (a === 'UNIVERSAL' || b === 'UNIVERSAL') return true
  if (a === 'V120_277' || b === 'V120_277') return true // universal-ish
  return a === b
}

// Mounting type overlap — at least one type in common
function mountingCompatible(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true
  return a.some((m) => b.includes(m))
}

// ─── Hard Reject Rules ────────────────────────────────────────────────────────

interface RejectResult {
  reason: HardRejectReason
  detail: string
}

function runHardRejects(source: ProductWithManufacturer, target: ProductWithManufacturer): RejectResult | null {
  // 1. Environment mismatch
  if (
    source.environment && target.environment &&
    source.environment !== 'BOTH' && target.environment !== 'BOTH' &&
    source.environment !== target.environment
  ) {
    return {
      reason: 'environment_mismatch',
      detail: `Source is ${source.environment}, target is ${target.environment}`,
    }
  }

  // 2. Emergency backup mismatch
  if (source.emergencyBackup === true && target.emergencyBackup !== true) {
    return {
      reason: 'emergency_mismatch',
      detail: 'Source requires emergency backup; target does not have it',
    }
  }

  // 3. Wet location required
  if (source.wetLocation === true && target.wetLocation !== true) {
    return {
      reason: 'wet_location_required',
      detail: 'Source is rated for wet locations; target is not',
    }
  }

  // 4. NEMA downgrade
  if (source.nemaRating && !target.nemaRating) {
    return {
      reason: 'nema_downgrade',
      detail: `Source has NEMA rating (${source.nemaRating}); target has none`,
    }
  }

  // 5. Voltage incompatible
  if (!voltagesCompatible(source.voltage, target.voltage)) {
    return {
      reason: 'voltage_incompatible',
      detail: `Source voltage ${source.voltage} incompatible with target ${target.voltage}`,
    }
  }

  // 6. Mounting incompatible
  if (!mountingCompatible(source.mountingType, target.mountingType)) {
    return {
      reason: 'mounting_incompatible',
      detail: `No overlapping mounting types (source: ${source.mountingType.join(', ')}, target: ${target.mountingType.join(', ')})`,
    }
  }

  // 7. Form factor incompatible (only when both are specified)
  if (source.formFactor && target.formFactor && source.formFactor !== target.formFactor) {
    // Only hard-reject for clearly incompatible form factors (2X4 vs 2X2, 4_INCH vs 6_INCH)
    const isTroffer = (ff: string) => ff.startsWith('1X') || ff.startsWith('2X')
    const isDownlight = (ff: string) => ff.includes('INCH')
    if (
      (isTroffer(source.formFactor) && isTroffer(target.formFactor)) ||
      (isDownlight(source.formFactor) && isDownlight(target.formFactor))
    ) {
      return {
        reason: 'form_factor_incompatible',
        detail: `Form factor mismatch: ${source.formFactor} vs ${target.formFactor}`,
      }
    }
  }

  return null
}

// ─── Range overlap helper ─────────────────────────────────────────────────────

function rangeOverlapScore(
  sNom: number | null, sMin: number | null, sMax: number | null,
  tNom: number | null, tMin: number | null, tMax: number | null,
  tolerancePct: number
): number {
  // Get effective ranges
  const sLow = sMin ?? sNom ?? null
  const sHigh = sMax ?? sNom ?? null
  const tLow = tMin ?? tNom ?? null
  const tHigh = tMax ?? tNom ?? null

  if (!sLow || !sHigh || !tLow || !tHigh) return 0.5 // unknown = neutral

  const mid = (sLow + sHigh) / 2
  const tolerance = mid * tolerancePct

  // Check if ranges overlap within tolerance
  const overlapLow = Math.max(sLow, tLow - tolerance)
  const overlapHigh = Math.min(sHigh, tHigh + tolerance)

  if (overlapHigh < overlapLow) return 0 // no overlap

  // Score based on how well they overlap
  const sourceRange = sHigh - sLow
  if (sourceRange <= 0) return 1.0  // point value — any overlap is a full match
  const overlapRange = overlapHigh - overlapLow
  const pctOverlap = Math.min(1, overlapRange / sourceRange)

  if (pctOverlap >= 0.8) return 1.0
  if (pctOverlap >= 0.5) return 0.7
  return 0.3
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

interface ScoreResult {
  score: number
  reasons: string[]
}

function scoreMatch(source: Product, target: Product): ScoreResult {
  let score = 0
  const reasons: string[] = []

  // Form factor match (weight 0.20)
  if (source.formFactor && target.formFactor) {
    if (source.formFactor === target.formFactor) {
      score += 0.20
      reasons.push('Form factor matches')
    } else {
      reasons.push(`Form factor differs (${source.formFactor} vs ${target.formFactor})`)
    }
  } else {
    score += 0.10 // partial credit when unknown
  }

  // Lumens within range (weight 0.20)
  const lumensScore = rangeOverlapScore(
    source.lumens, source.lumensMin, source.lumensMax,
    target.lumens, target.lumensMin, target.lumensMax,
    0.10
  )
  score += lumensScore * 0.20
  {
    const sLumStr = (source.lumensMin != null && source.lumensMax != null)
      ? `${source.lumensMin.toLocaleString()}–${source.lumensMax.toLocaleString()} lm`
      : source.lumens != null ? `${source.lumens.toLocaleString()} lm` : null
    const tLumStr = (target.lumensMin != null && target.lumensMax != null)
      ? `${target.lumensMin.toLocaleString()}–${target.lumensMax.toLocaleString()} lm`
      : target.lumens != null ? `${target.lumens.toLocaleString()} lm` : null
    const lumLabel = sLumStr && tLumStr ? `target ${tLumStr} vs source ${sLumStr}` : null
    if (lumensScore >= 0.9) reasons.push(lumLabel ? `Lumens match: ${lumLabel}` : 'Lumen output matches closely')
    else if (lumensScore >= 0.6) reasons.push(lumLabel ? `Lumens similar: ${lumLabel}` : 'Lumen output is similar')
    else if (lumensScore > 0) reasons.push(lumLabel ? `Lumens differ: ${lumLabel}` : 'Lumen output differs moderately')
    else reasons.push(lumLabel ? `Lumens no overlap: ${lumLabel}` : 'Lumen output does not overlap')
  }

  // CRI match (weight 0.10)
  if (source.cri && target.cri) {
    if (source.cri === target.cri) {
      score += 0.10
      reasons.push(`CRI matches (${source.cri})`)
    } else if (target.cri > source.cri) {
      score += 0.08
      reasons.push(`Target CRI (${target.cri}) exceeds source (${source.cri})`)
    } else {
      score += 0.03
      reasons.push(`Target CRI (${target.cri}) is lower than source (${source.cri})`)
    }
  } else {
    score += 0.05
  }

  // CCT overlap (weight 0.10)
  if (source.cctOptions.length > 0 && target.cctOptions.length > 0) {
    const overlap = source.cctOptions.filter((c) => target.cctOptions.includes(c))
    const pctOverlap = overlap.length / source.cctOptions.length
    const sSrc = source.cctOptions.map(c => `${c}K`).join('/')
    const sTgt = target.cctOptions.map(c => `${c}K`).join('/')
    const sOver = overlap.map(c => `${c}K`).join('/')
    if (pctOverlap >= 1.0) {
      score += 0.10
      reasons.push(`CCT full match: ${sSrc}`)
    } else if (pctOverlap >= 0.5) {
      score += 0.05
      reasons.push(`CCT partial: source ${sSrc}, target ${sTgt} (shared: ${sOver})`)
    } else {
      reasons.push(`CCT limited overlap: source ${sSrc}, target ${sTgt}`)
    }
  } else {
    score += 0.05
  }

  // Wattage within range (weight 0.05)
  const wattScore = rangeOverlapScore(
    source.wattage, source.wattageMin, source.wattageMax,
    target.wattage, target.wattageMin, target.wattageMax,
    0.15
  )
  score += wattScore * 0.05
  if (wattScore < 0.5) {
    const sWStr = (source.wattageMin != null && source.wattageMax != null)
      ? `${source.wattageMin}–${source.wattageMax}W`
      : source.wattage != null ? `${source.wattage}W` : null
    const tWStr = (target.wattageMin != null && target.wattageMax != null)
      ? `${target.wattageMin}–${target.wattageMax}W`
      : target.wattage != null ? `${target.wattage}W` : null
    reasons.push(sWStr && tWStr ? `Wattage differs: target ${tWStr} vs source ${sWStr}` : 'Wattage differs significantly')
  }

  // Dimming compatibility (weight 0.10)
  if (source.dimmable === true && target.dimmable === true) {
    const srcTypes = source.dimmingType
    const tgtTypes = target.dimmingType
    if (srcTypes.length > 0 && tgtTypes.length > 0) {
      const overlap = srcTypes.filter((d) => tgtTypes.includes(d))
      if (overlap.length > 0) {
        score += 0.10
        reasons.push(`Dimming protocol matches (${overlap.join(', ')})`)
      } else {
        score += 0.07
        reasons.push(`Source: ${srcTypes.join('/')} dimming; Target: ${tgtTypes.join('/')} — verify control system compatibility`)
      }
    } else {
      score += 0.07
      reasons.push('Both dimmable')
    }
  } else if (source.dimmable !== true && target.dimmable !== true) {
    score += 0.10
    reasons.push('Neither requires dimming')
  } else if (source.dimmable === true) {
    reasons.push('Source is dimmable but target is not')
  }

  // DLC match (weight 0.10)
  if (source.dlcListed && target.dlcListed) {
    if (source.dlcPremium && target.dlcPremium) {
      score += 0.10
      reasons.push('Both DLC Premium listed')
    } else {
      score += 0.10
      reasons.push('Both DLC listed')
    }
  } else if (!source.dlcListed && !target.dlcListed) {
    score += 0.07
  } else {
    score += 0.03
    reasons.push('DLC listing mismatch')
  }

  // Physical dimensions (weight 0.05)
  if (source.dimensions && target.dimensions) {
    if (source.dimensions === target.dimensions) {
      score += 0.05
      reasons.push('Dimensions match exactly')
    } else {
      // Simple string similarity
      const sDims = source.dimensions.replace(/[^\d.]/g, ' ').trim().split(/\s+/).map(Number).filter(Boolean).sort()
      const tDims = target.dimensions.replace(/[^\d.]/g, ' ').trim().split(/\s+/).map(Number).filter(Boolean).sort()
      const allClose = sDims.length > 0 &&
        sDims.length === tDims.length &&
        sDims.every((d, i) => d > 0 && tDims[i] > 0 && Math.abs(d - tDims[i]) / d < 0.1)
      if (allClose) {
        score += 0.04
        reasons.push('Dimensions are very close')
      } else {
        score += 0.02
      }
    }
  } else {
    score += 0.025
  }

  // IP/NEMA rating (weight 0.10)
  if (source.ipRating && target.ipRating) {
    if (source.ipRating === target.ipRating) {
      score += 0.10
    } else {
      score += 0.05
      reasons.push('IP ratings differ')
    }
  } else if (!source.ipRating && !target.ipRating) {
    score += 0.07
  } else {
    score += 0.05
  }

  return { score: Math.min(1, Math.round(score * 100) / 100), reasons }
}

// ─── Match Type Determination ─────────────────────────────────────────────────

function determineMatchType(score: number, source: Product, target: Product): MatchType {
  if (score >= 0.90) return MatchType.DIRECT_REPLACEMENT
  if (score >= 0.75) return MatchType.FUNCTIONAL_EQUIVALENT
  if (score >= 0.60) {
    // Check if target is an upgrade
    const targetLumens = target.lumens ?? target.lumensMax ?? 0
    const sourceLumens = source.lumens ?? source.lumensMax ?? 0
    if (targetLumens > sourceLumens * 1.1) return MatchType.UPGRADE
    return MatchType.SIMILAR
  }
  return MatchType.BUDGET_ALTERNATIVE
}

// ─── Comparison Snapshot ──────────────────────────────────────────────────────

function buildComparisonSnapshot(source: Product, target: Product): ComparisonSnapshot {
  const snapFields = ['catalogNumber', 'lumens', 'lumensMin', 'lumensMax', 'wattage', 'wattageMin', 'wattageMax', 'cri', 'cctOptions', 'voltage', 'ipRating', 'nemaRating', 'formFactor']

  const srcSnap: Record<string, unknown> = {}
  const tgtSnap: Record<string, unknown> = {}

  for (const f of snapFields) {
    srcSnap[f] = (source as unknown as Record<string, unknown>)[f]
    tgtSnap[f] = (target as unknown as Record<string, unknown>)[f]
  }

  const deltas: Record<string, string> = {}

  // Lumens delta — cite actual ranges
  const sLumStr = (source.lumensMin != null && source.lumensMax != null)
    ? `${source.lumensMin.toLocaleString()}–${source.lumensMax.toLocaleString()} lm`
    : source.lumens != null ? `${source.lumens.toLocaleString()} lm` : null
  const tLumStr = (target.lumensMin != null && target.lumensMax != null)
    ? `${target.lumensMin.toLocaleString()}–${target.lumensMax.toLocaleString()} lm`
    : target.lumens != null ? `${target.lumens.toLocaleString()} lm` : null
  if (sLumStr && tLumStr) {
    const sLum = source.lumens ?? source.lumensMax ?? 0
    const tLum = target.lumens ?? target.lumensMax ?? 0
    if (sLum && tLum) {
      const pct = Math.round(((tLum - sLum) / sLum) * 100)
      deltas.lumens = `${tLumStr} vs ${sLumStr} (${pct >= 0 ? '+' : ''}${pct}%)`
    } else {
      deltas.lumens = `${tLumStr} vs ${sLumStr}`
    }
  }

  // Wattage delta — cite actual ranges
  const sWattStr = (source.wattageMin != null && source.wattageMax != null)
    ? `${source.wattageMin}–${source.wattageMax}W`
    : source.wattage != null ? `${source.wattage}W` : null
  const tWattStr = (target.wattageMin != null && target.wattageMax != null)
    ? `${target.wattageMin}–${target.wattageMax}W`
    : target.wattage != null ? `${target.wattage}W` : null
  if (sWattStr && tWattStr) {
    const sWatt = source.wattage ?? source.wattageMax ?? 0
    const tWatt = target.wattage ?? target.wattageMax ?? 0
    if (sWatt && tWatt) {
      const pct = Math.round(((tWatt - sWatt) / sWatt) * 100)
      deltas.wattage = `${tWattStr} vs ${sWattStr} (${pct >= 0 ? '+' : ''}${pct}%)`
    } else {
      deltas.wattage = `${tWattStr} vs ${sWattStr}`
    }
  }

  // CRI delta
  if (source.cri && target.cri) {
    if (target.cri > source.cri) deltas.cri = `Target CRI ${target.cri} vs source ${source.cri} (+${target.cri - source.cri})`
    else if (target.cri < source.cri) deltas.cri = `Target CRI ${target.cri} vs source ${source.cri} (${target.cri - source.cri})`
    else deltas.cri = `CRI ${source.cri} — match`
  }

  // CCT delta — cite actual values
  if (source.cctOptions.length > 0 && target.cctOptions.length > 0) {
    const sSrc = source.cctOptions.map(c => `${c}K`).join('/')
    const sTgt = target.cctOptions.map(c => `${c}K`).join('/')
    const missing = source.cctOptions.filter((c) => !target.cctOptions.includes(c))
    const extra = target.cctOptions.filter((c) => !source.cctOptions.includes(c))
    if (missing.length === 0 && extra.length === 0) {
      deltas.cctOptions = `Full match: ${sSrc}`
    } else if (missing.length > 0) {
      deltas.cctOptions = `Source: ${sSrc}; Target: ${sTgt} — target missing ${missing.map(c => `${c}K`).join('/')}`
    } else {
      deltas.cctOptions = `Source: ${sSrc}; Target: ${sTgt} — target adds ${extra.map(c => `${c}K`).join('/')}`
    }
  }

  // Dimming delta — cite protocol names
  if (source.dimmingType.length > 0 && target.dimmingType.length > 0) {
    const overlap = source.dimmingType.filter(d => target.dimmingType.includes(d))
    if (overlap.length === 0) {
      deltas.dimming = `Source: ${source.dimmingType.join('/')}; Target: ${target.dimmingType.join('/')} — verify controls`
    }
  }

  return { source: srcSnap, target: tgtSnap, deltas }
}

// ─── Main: Find Matches ───────────────────────────────────────────────────────

type ProductWithManufacturer = Product & {
  manufacturer: { name: string; slug: string }
  category: { name: string; slug: string; path: string | null } | null
}

// Compatible types — some fixture types are interchangeable for cross-reference
const COMPATIBLE_TYPES: Partial<Record<string, string[]>> = {
  HIGH_BAY: ['HIGH_BAY', 'LOW_BAY'],
  LOW_BAY: ['HIGH_BAY', 'LOW_BAY'],
  TROFFER: ['TROFFER', 'FLAT_PANEL'],
  FLAT_PANEL: ['TROFFER', 'FLAT_PANEL'],
  DOWNLIGHT: ['DOWNLIGHT', 'RECESSED_CAN', 'CYLINDER'],
  RECESSED_CAN: ['DOWNLIGHT', 'RECESSED_CAN'],
  CYLINDER: ['DOWNLIGHT', 'CYLINDER'],
  LINEAR_SUSPENDED: ['LINEAR_SUSPENDED', 'LINEAR_SURFACE', 'LINEAR_SLOT'],
  LINEAR_SURFACE: ['LINEAR_SUSPENDED', 'LINEAR_SURFACE'],
  LINEAR_SLOT: ['LINEAR_SUSPENDED', 'LINEAR_SLOT'],
  WALL_MOUNT: ['WALL_MOUNT', 'SCONCE'],
  SCONCE: ['WALL_MOUNT', 'SCONCE'],
  CANOPY: ['CANOPY', 'GARAGE'],
  GARAGE: ['CANOPY', 'GARAGE'],
}

export async function findMatches(
  sourceId: string,
  targetManufacturerSlug?: string
): Promise<{ matches: CrossRefMatch[]; rejects: CrossRefReject[]; filterLevel: string }> {
  const catSelect = { select: { name: true, slug: true, path: true } }
  const source = await prisma.product.findUnique({
    where: { id: sourceId },
    include: { manufacturer: { select: { name: true, slug: true } }, category: catSelect },
  }) as ProductWithManufacturer | null

  if (!source) throw new Error('Source product not found')

  const sourceType = source.canonicalFixtureType

  if (!sourceType) {
    console.log(`[cross-ref] source ${source.catalogNumber} has no canonicalFixtureType — cannot cross-reference`)
    return { matches: [], rejects: [], filterLevel: 'untyped' }
  }

  const allowedTypes = (COMPATIBLE_TYPES[sourceType] ?? [sourceType]) as CanonicalFixtureType[]

  const candidates = await prisma.product.findMany({
    where: {
      isActive: true,
      id: { not: sourceId },
      canonicalFixtureType: { in: allowedTypes },
      // Cross-reference is between manufacturers
      manufacturerId: { not: source.manufacturerId },
      ...(targetManufacturerSlug ? { manufacturer: { slug: targetManufacturerSlug } } : {}),
    },
    take: 50,
    include: {
      manufacturer: { select: { name: true, slug: true } },
      category: catSelect,
    },
  }) as ProductWithManufacturer[]

  console.log(`[cross-ref] ${source.catalogNumber} (${sourceType}) → ${candidates.length} candidates of types [${allowedTypes.join(', ')}]`)

  const filterLevel = 'canonical'

  const matches: CrossRefMatch[] = []
  const rejects: CrossRefReject[] = []
  const upserts: Parameters<typeof prisma.crossReference.upsert>[0][] = []

  for (const target of candidates) {
    const reject = runHardRejects(source, target)
    if (reject) {
      console.log(`[cross-ref] REJECT ${target.catalogNumber}: ${reject.reason} — ${reject.detail}`)
      rejects.push({
        productId: target.id,
        catalogNumber: target.catalogNumber,
        reason: reject.reason,
        detail: reject.detail,
      })
      continue
    }

    const { score, reasons } = scoreMatch(source, target)
    // Force BUDGET_ALTERNATIVE for Contractor Select products regardless of score
    const isContractorSelect = target.category?.path?.startsWith('contractor-select') ?? false
    const matchType = isContractorSelect
      ? MatchType.BUDGET_ALTERNATIVE
      : determineMatchType(score, source, target)
    const snapshot = buildComparisonSnapshot(source, target)
    const matchReason = reasons.slice(0, 3).join('; ')

    upserts.push({
      where: { sourceProductId_targetProductId: { sourceProductId: sourceId, targetProductId: target.id } },
      create: {
        sourceProductId: sourceId,
        targetProductId: target.id,
        matchType,
        confidence: score,
        matchReason,
        comparisonSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        source: CrossRefSource.RULE_BASED,
      },
      update: {
        matchType,
        confidence: score,
        matchReason,
        comparisonSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    })

    matches.push({
      productId: target.id,
      catalogNumber: target.catalogNumber,
      displayName: target.displayName,
      manufacturerSlug: target.manufacturer.slug,
      confidence: score,
      matchType,
      matchReason,
      comparisonSnapshot: snapshot,
    })
  }

  // Batch all upserts in parallel instead of sequential awaits
  await Promise.all(upserts.map((args) => prisma.crossReference.upsert(args)))

  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence)

  return { matches, rejects, filterLevel }
}
