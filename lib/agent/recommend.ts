// lib/agent/recommend.ts
// Recommendation engine: context inference, candidate scoring, and ranking.

import type { SearchProductRow } from '@/lib/products-search'

// ─── Brand Tier ───────────────────────────────────────────────────────────────

export type BrandTier = 'contractor' | 'commercial' | 'premium' | 'specialty'

// Manufacturer-level fallback tiers
// NOTE: This is a market-posture proxy based on brand/family signals, NOT price data.
// Acuity is listed as 'commercial' (not 'premium') because it spans contractor to premium —
// family keyword overrides handle the premium cases.
const MANUFACTURER_TIER_FALLBACK: Record<string, BrandTier> = {
  elite:   'contractor',   // primarily contractor/value lines
  cooper:  'commercial',   // broad commercial standard
  current: 'commercial',   // broad commercial standard
  acuity:  'commercial',   // spans contractor to premium — family override applies
  lutron:  'specialty',    // primarily controls; fixture products rare
}

// Family name keyword overrides — checked against product.familyName, case-insensitive
// Highest-priority first. First match wins.
const FAMILY_TIER_KEYWORDS: { keywords: string[]; tier: BrandTier }[] = [
  { keywords: ['premium', 'architectural', 'designer', 'select', 'ultra', 'prestige', 'luxe'], tier: 'premium' },
  { keywords: ['contractor', 'value', 'economy', 'basic'], tier: 'contractor' },
]

export function resolveProductTier(manufacturerSlug: string, familyName?: string | null): BrandTier {
  if (familyName) {
    const lower = familyName.toLowerCase()
    for (const { keywords, tier } of FAMILY_TIER_KEYWORDS) {
      if (keywords.some(k => lower.includes(k))) return tier
    }
  }
  return MANUFACTURER_TIER_FALLBACK[manufacturerSlug] ?? 'commercial'
}

// ─── Project Posture ──────────────────────────────────────────────────────────

export type ProjectPosture = 'value_engineered' | 'standard_commercial' | 'premium_design' | 'specialty_controls'

export interface AppDefaults {
  projectPosture: ProjectPosture
  preferredCCTs: number[]
  minCri: number
  dlcPreferred: boolean
  dimmingPreferred: boolean
  indoorPreferred: boolean
}

const BUDGET_TO_POSTURE: Record<string, ProjectPosture> = {
  value:    'value_engineered',
  standard: 'standard_commercial',
  premium:  'premium_design',
}

export const APPLICATION_DEFAULTS: Record<string, AppDefaults> = {
  classroom:      { projectPosture: 'value_engineered',    preferredCCTs: [3500, 4000], minCri: 80, dlcPreferred: true,  dimmingPreferred: true,  indoorPreferred: true },
  school:         { projectPosture: 'value_engineered',    preferredCCTs: [3500, 4000], minCri: 80, dlcPreferred: true,  dimmingPreferred: true,  indoorPreferred: true },
  private_school: { projectPosture: 'standard_commercial', preferredCCTs: [3500, 4000], minCri: 80, dlcPreferred: true,  dimmingPreferred: true,  indoorPreferred: true },
  office:         { projectPosture: 'standard_commercial', preferredCCTs: [3500, 4000], minCri: 80, dlcPreferred: true,  dimmingPreferred: true,  indoorPreferred: true },
  warehouse:      { projectPosture: 'value_engineered',    preferredCCTs: [5000, 4000], minCri: 70, dlcPreferred: true,  dimmingPreferred: false, indoorPreferred: true },
  retail:         { projectPosture: 'standard_commercial', preferredCCTs: [3000, 3500], minCri: 90, dlcPreferred: false, dimmingPreferred: true,  indoorPreferred: true },
  healthcare:     { projectPosture: 'standard_commercial', preferredCCTs: [4000],       minCri: 90, dlcPreferred: true,  dimmingPreferred: true,  indoorPreferred: true },
  renovation:     { projectPosture: 'standard_commercial', preferredCCTs: [3500, 4000], minCri: 80, dlcPreferred: true,  dimmingPreferred: true,  indoorPreferred: true },
  default:        { projectPosture: 'standard_commercial', preferredCCTs: [3500, 4000], minCri: 80, dlcPreferred: true,  dimmingPreferred: true,  indoorPreferred: true },
}

// ─── Recommendation Context ───────────────────────────────────────────────────

export interface RecommendationContext extends AppDefaults {
  applicationType: string
  fixtureType?: string
  minLumens?: number
  maxWattage?: number
  preferredCct?: number
  inferredDefaultsDescription: string[]
}

export interface RecommendParams {
  applicationType: string
  budgetSensitivity?: 'value' | 'standard' | 'premium'
  fixtureType?: string
  minLumens?: number
  maxWattage?: number
  preferredCct?: number
  minCri?: number
}

export function buildRecommendationContext(params: RecommendParams): RecommendationContext {
  const key = params.applicationType.toLowerCase().replace(/[\s-]+/g, '_')
  const defaults = APPLICATION_DEFAULTS[key] ?? APPLICATION_DEFAULTS.default

  // budgetSensitivity overrides the application-type default posture
  const projectPosture = params.budgetSensitivity
    ? (BUDGET_TO_POSTURE[params.budgetSensitivity] ?? defaults.projectPosture)
    : defaults.projectPosture

  const minCri = params.minCri ?? defaults.minCri
  const preferredCCTs = params.preferredCct
    ? [params.preferredCct]
    : defaults.preferredCCTs

  const inferredDefaultsDescription: string[] = [
    `projectPosture: ${projectPosture}`,
    `preferredCCTs: ${preferredCCTs.join(', ')}K`,
    `minCri: ${minCri}`,
    defaults.dlcPreferred ? 'DLC preferred' : 'DLC not required',
    defaults.dimmingPreferred ? 'dimming preferred' : 'dimming not required',
  ]

  return {
    ...defaults,
    projectPosture,
    applicationType: params.applicationType,
    fixtureType: params.fixtureType,
    preferredCCTs,
    minCri,
    minLumens: params.minLumens,
    maxWattage: params.maxWattage,
    preferredCct: params.preferredCct,
    inferredDefaultsDescription,
  }
}

// ─── Tier Weight Tables ───────────────────────────────────────────────────────

// Tier weight by posture: [contractor, commercial, premium, specialty]
const TIER_WEIGHTS: Record<ProjectPosture, Record<BrandTier, number>> = {
  value_engineered:    { contractor: 25, commercial: 12, premium:  8, specialty:  5 },
  standard_commercial: { contractor: 15, commercial: 20, premium: 15, specialty:  5 },
  premium_design:      { contractor:  8, commercial: 15, premium: 20, specialty: 10 },
  specialty_controls:  { contractor:  5, commercial: 10, premium: 15, specialty: 20 },
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

export interface ScoredCandidate {
  product: SearchProductRow
  score: number
  fitConfidence: number   // 0–1: how complete the scoring data was
  whyRecommended: string
  tradeoffs?: string
  rankLabel: string       // set after sorting: "Top pick" | "Strong alternative" | "Also consider"
}

export function scoreCandidate(product: SearchProductRow, ctx: RecommendationContext): Omit<ScoredCandidate, 'rankLabel'> {
  let score = 0
  let fitConfidence = 1.0
  const positives: string[] = []
  const negatives: string[] = []

  // ── Manufacturer / family tier ──────────────────────────────────────────
  const tier = resolveProductTier(product.manufacturer.slug, product.familyName)
  const tierScore = TIER_WEIGHTS[ctx.projectPosture][tier]
  score += tierScore
  if (tierScore >= 18) positives.push(`${tier} tier fixture`)
  else if (tierScore <= 8) negatives.push(`${tier} posture may not match ${ctx.projectPosture.replace(/_/g, ' ')} context`)

  // ── DLC ──────────────────────────────────────────────────────────────────
  if (ctx.dlcPreferred) {
    if (product.dlcPremium) { score += 12; positives.push('DLC Premium') }
    else if (product.dlcListed) { score += 10; positives.push('DLC listed') }
    // no penalty for missing DLC — data may simply be absent
  }

  // ── CCT match ────────────────────────────────────────────────────────────
  if (product.cctOptions && product.cctOptions.length > 0) {
    const exactMatch = product.cctOptions.some(c => ctx.preferredCCTs.includes(c))
    const nearMatch = product.cctOptions.some(c => ctx.preferredCCTs.some(p => Math.abs(c - p) <= 500))
    if (exactMatch) { score += 15; positives.push(`${product.cctOptions.find(c => ctx.preferredCCTs.includes(c))}K CCT`) }
    else if (nearMatch) score += 8
    else { score -= 10; negatives.push('CCT outside preferred range') }
  } else {
    fitConfidence -= 0.1  // cctOptions unknown
  }

  // ── CRI ──────────────────────────────────────────────────────────────────
  if (product.cri != null) {
    if (product.cri >= ctx.minCri) {
      score += 10
      positives.push(`CRI ${product.cri}`)      // always mention CRI when it passes
      if (ctx.projectPosture === 'premium_design' && product.cri >= 90) score += 5
    } else {
      score -= 10; negatives.push(`CRI ${product.cri} below ${ctx.minCri} minimum`)
    }
  } else {
    fitConfidence -= 0.2  // CRI unknown — important spec
  }

  // ── Dimming ───────────────────────────────────────────────────────────────
  if (ctx.dimmingPreferred) {
    // dimmable is not in SearchProductRow — we skip penalty since data is often absent
    // but no bonus either unless we have positive signal
    fitConfidence -= 0.05  // slight confidence reduction for missing dimming data
  }

  // ── Efficacy ─────────────────────────────────────────────────────────────
  // efficacy is not in SearchProductRow (not selected) — reduce confidence only
  fitConfidence -= 0.1  // efficacy data not available in search results

  // ── Lumen fit ────────────────────────────────────────────────────────────
  if (ctx.minLumens != null) {
    const productLumens = product.lumens ?? product.lumensMax ?? product.lumensMin
    if (productLumens != null) {
      if (productLumens >= ctx.minLumens) { score += 10; positives.push(`${productLumens.toLocaleString()} lm`) }
      else if (productLumens >= ctx.minLumens * 0.8) score += 5  // close enough
      // else: no extra penalty (just missed bonus)
    }
  }

  // ── Outdoor product for indoor application ────────────────────────────────
  // environment is not in SearchProductRow (not selected), but we can check wetLocation as proxy
  if (ctx.indoorPreferred && product.wetLocation) {
    // Wet-location fixtures for indoor dry spaces: small penalty
    score -= 5; negatives.push('wet-location rated — may be overkill for indoor')
  }

  // ── Data confidence ────────────────────────────────────────────────────────
  // overallConfidence not in SearchProductRow — skip
  fitConfidence = Math.max(0, Math.min(1, fitConfidence))

  // ── Build rationale strings ──────────────────────────────────────────────
  const tierLabel = { contractor: 'Contractor-grade', commercial: 'Commercial', premium: 'Premium', specialty: 'Specialty' }[tier]
  const posLabel = ctx.projectPosture.replace(/_/g, ' ')
  const primaryPositives = positives.slice(0, 3).join(', ')
  const whyBase = `${tierLabel} fixture${primaryPositives ? `, ${primaryPositives}` : ''} — ${fitConfidence >= 0.6 ? 'strong' : 'closest available'} fit for ${posLabel}`
  const whyRecommended = whyBase
  const tradeoffs = negatives.length > 0 ? negatives.join('; ') : undefined

  return { product, score, fitConfidence, whyRecommended, tradeoffs }
}

// ─── Fixture Class Inference ──────────────────────────────────────────────────

// confirmed      = canonicalFixtureType present and matches requested type (authoritative)
// inferred_match = canonicalFixtureType null, but positive text signal matched
// unknown        = canonicalFixtureType null, no text signal either way — passes filter, small score penalty
// excluded       = canonicalFixtureType present but wrong type, OR negative text signal matched
export type ClassMatchResult = 'confirmed' | 'inferred_match' | 'unknown' | 'excluded'

// Keyword signals for inferring fixture class when canonicalFixtureType is null.
// Only populated for types commonly queried in advisory mode.
// negative signals WIN over positive — checked first.
const FIXTURE_CLASS_SIGNALS: Partial<Record<string, { positive: string[]; negative: string[] }>> = {
  TROFFER: {
    positive: [
      'troffer', 'lay-in', 'layin', 'lay in', 'recessed troffer', 'volumetric',
      'center basket', 'basket troffer', 'recessed lay-in', 'grid ceiling', 't-bar troffer',
    ],
    negative: [
      'light bar', 'lbk', 'bar kit', 'strip', 'wrap', 'high bay',
      'panel kit', 'retrofit bar', 'linear bar', 'surface strip',
    ],
  },
  HIGH_BAY: {
    positive: ['high bay', 'highbay', 'high-bay', 'ufo'],
    negative: ['troffer', 'strip', 'wrap', 'wall pack', 'flat panel'],
  },
  FLAT_PANEL: {
    positive: ['flat panel', 'panel led', 'edge-lit', 'backlit panel'],
    negative: ['troffer', 'high bay', 'wrap', 'strip'],
  },
  WALL_PACK: {
    positive: ['wall pack', 'wall-pack', 'wallpack'],
    negative: ['troffer', 'high bay', 'strip', 'canopy'],
  },
  STRIP: {
    positive: ['strip', 'shop light', 'shoplight', 'industrial strip'],
    negative: ['troffer', 'high bay', 'flat panel'],
  },
  LINEAR_SUSPENDED: {
    positive: ['linear suspended', 'suspended linear', 'pendant linear', 'continuous row'],
    negative: ['troffer', 'high bay', 'strip', 'wall pack'],
  },
  VAPOR_TIGHT: {
    positive: ['vapor tight', 'vaportight', 'vapor-tight'],
    negative: ['troffer', 'high bay', 'wall pack'],
  },
  DOWNLIGHT: {
    positive: [
      'downlight', 'down light', 'recessed', 'wafer', 'slim', 'pancake',
      'pot light', 'can light', 'ic-rated', 'ic rated',
    ],
    negative: ['troffer', 'high bay', 'strip', 'flat panel', 'wall pack'],
  },
  CANOPY: {
    positive: ['canopy', 'gas station', 'fueling station', 'covered walkway'],
    negative: ['troffer', 'high bay', 'wall pack', 'flat panel'],
  },
  AREA_SITE: {
    positive: ['area light', 'site light', 'shoe box', 'shoebox', 'parking lot', 'area/site'],
    negative: ['troffer', 'high bay', 'wall pack', 'canopy'],
  },
  WRAP: {
    positive: ['wrap', 'wraparound', 'wrap-around', 'shop light'],
    negative: ['troffer', 'high bay', 'flat panel', 'strip'],
  },
  SURFACE_MOUNT: {
    positive: ['surface mount', 'surface-mount', 'j-box', 'jbox', 'flush mount'],
    negative: ['troffer', 'high bay', 'wall pack', 'pendant', 'recessed'],
  },
  WALL_MOUNT: {
    positive: ['wall mount', 'sconce', 'wall-mount', 'wall mounted'],
    negative: ['troffer', 'high bay', 'wall pack', 'canopy'],
  },
}

// Returns a fixture-class match result for a product against a requested type.
// Negative text signals are checked FIRST and can veto even a canonical type match,
// because the classification pipeline can misclassify products (e.g. LBK light bar
// kits miscategorised as TROFFER). Positive signals and canonical type are consulted
// only after the negative veto passes.
// Text basis: displayName + familyName + catalogNumber.
export function inferFixtureClass(product: SearchProductRow, requestedType: string): ClassMatchResult {
  const signals = FIXTURE_CLASS_SIGNALS[requestedType]

  // 1. Negative text signals win over everything — including canonical type
  if (signals) {
    const text = [product.displayName, product.familyName, product.catalogNumber]
      .filter(Boolean).join(' ').toLowerCase()
    if (signals.negative.some(s => text.includes(s))) return 'excluded'
  }

  // 2. Canonical type present (and not vetoed by negative signals) — authoritative
  if (product.canonicalFixtureType != null) {
    return (product.canonicalFixtureType as string) === requestedType ? 'confirmed' : 'excluded'
  }

  // 3. No canonical type — use positive text signals
  if (signals) {
    const text = [product.displayName, product.familyName, product.catalogNumber]
      .filter(Boolean).join(' ').toLowerCase()
    if (signals.positive.some(s => text.includes(s))) return 'inferred_match'
  }

  return 'unknown'
}

// ─── Diversity Selection ──────────────────────────────────────────────────────

// Max score gap within which we prefer cross-manufacturer diversity.
// If a same-manufacturer candidate's score advantage exceeds the threshold, it is
// materially better and diversity is NOT forced.
const DIVERSITY_GAP: Record<ProjectPosture, number> = {
  value_engineered:    8,   // commodity market — many near-equivalent options
  standard_commercial: 6,
  premium_design:      4,   // premium products differentiate more; less forced diversity
  specialty_controls:  4,
}

// Threshold-based diversity: prefer cross-manufacturer alternatives when scores are close.
// Falls back to score-order if fewer than `limit` manufacturers are available in the pool.
// skipDiversity = true when the caller has already filtered to one manufacturer.
function diversifySelection(
  allScored: Omit<ScoredCandidate, 'rankLabel'>[],
  limit: number,
  posture: ProjectPosture,
  skipDiversity: boolean
): Omit<ScoredCandidate, 'rankLabel'>[] {
  if (skipDiversity) return allScored.slice(0, limit)

  const gap = DIVERSITY_GAP[posture]
  const selected: Omit<ScoredCandidate, 'rankLabel'>[] = []
  const deferred: Omit<ScoredCandidate, 'rankLabel'>[] = []
  const selectedMfrs = new Set<string>()

  for (const candidate of allScored) {
    if (selected.length >= limit) break
    const mfr = candidate.product.manufacturer.slug

    if (!selectedMfrs.has(mfr)) {
      // New manufacturer — always select
      selected.push(candidate)
      selectedMfrs.add(mfr)
    } else {
      // Same manufacturer already represented — check if there is a comparable cross-mfr option
      const bestCrossMfr = allScored.find(
        s => !selectedMfrs.has(s.product.manufacturer.slug) && !selected.includes(s) && !deferred.includes(s)
      )
      if (bestCrossMfr && candidate.score <= bestCrossMfr.score + gap) {
        // Scores are within threshold — defer, prefer cross-manufacturer diversity
        deferred.push(candidate)
      } else {
        // Materially better than any cross-mfr option — select despite duplicate manufacturer
        selected.push(candidate)
      }
    }
  }

  // Fill remaining slots from deferred (score-ordered) if we ran out of diverse options
  for (const candidate of deferred) {
    if (selected.length >= limit) break
    selected.push(candidate)
  }

  return selected.slice(0, limit)
}

// ─── Comparative Rationale ────────────────────────────────────────────────────

// Post-diversification pass: enriches whyRecommended + tradeoffs with comparative context.
// Mutates `selected` in-place.
function enrichWithComparativeRationale(
  selected: Omit<ScoredCandidate, 'rankLabel'>[],
  ctx: RecommendationContext,
  classMatchMap?: Map<string, ClassMatchResult>
): void {
  const appLabel = ctx.applicationType === 'general' ? 'this application' : ctx.applicationType
  const posture = ctx.projectPosture
  const topPick = selected[0]
  if (!topPick) return

  const topTier = resolveProductTier(topPick.product.manufacturer.slug, topPick.product.familyName)

  selected.forEach((c, i) => {
    const tier = resolveProductTier(c.product.manufacturer.slug, c.product.familyName)
    const mfrName = c.product.manufacturer.name ?? c.product.manufacturer.slug

    if (i === 0) {
      // Top pick: replace generic "— strong/closest fit for X" with application-specific context
      const tierFit =
        posture === 'value_engineered' && tier === 'contractor' ? `best contractor-grade fit for ${appLabel}` :
        posture === 'value_engineered' && tier === 'commercial'  ? `strongest mainstream fit for ${appLabel}` :
        posture === 'premium_design'   && tier === 'premium'     ? `best premium fit for ${appLabel}` :
        `top overall fit for ${appLabel}`
      c.whyRecommended = c.whyRecommended.replace(/ — (?:strong|closest available) fit for [^—]+$/, '') + ` — ${tierFit}`
    } else {
      // Alternatives: prepend manufacturer + comparative context
      const scoreDiff = topPick.score - c.score
      const sameMfr = c.product.manufacturer.slug === topPick.product.manufacturer.slug
      const diffTier = tier !== topTier

      const prefix = sameMfr
        ? `Another ${mfrName} option`
        : diffTier
          ? `${mfrName} — ${tier} tier option`
          : `${mfrName} — similar spec profile`

      // Strip old suffix and rewrite, keeping core positives
      const stripped = c.whyRecommended.replace(/ — (?:strong|closest available) fit for [^—]+$/, '')
      // Remove the tier label prefix (e.g. "Contractor-grade fixture, ") to avoid duplication
      const corePositives = stripped.replace(/^[A-Z][a-z-]+ (?:grade |tier )?fixture,?\s*/, '')
      c.whyRecommended = corePositives
        ? `${prefix}; ${corePositives}`
        : prefix

      // Comparative tradeoff lines
      const scoreLine = scoreDiff > 8 ? 'Slightly lower overall fit than top pick' : null
      const mfrLine = !sameMfr
        ? `Good fallback if ${topPick.product.manufacturer.name ?? topPick.product.manufacturer.slug} options are unavailable`
        : null
      const extra = [scoreLine, mfrLine].filter(Boolean).join('; ')
      if (extra) {
        c.tradeoffs = c.tradeoffs ? `${extra}; ${c.tradeoffs}` : extra
      }
    }

    // Hedge rationale if fixture class was not canonically confirmed
    const classMatch = classMatchMap?.get(c.product.id)
    if (classMatch === 'inferred_match' || classMatch === 'unknown') {
      c.tradeoffs = c.tradeoffs
        ? `Fixture class inferred from product name/family; ${c.tradeoffs}`
        : 'Fixture class inferred from product name/family'
    }
  })
}

export function rankCandidates(
  products: SearchProductRow[],
  ctx: RecommendationContext,
  limit: number,
  skipDiversity = false,
  classMatchMap?: Map<string, ClassMatchResult>
): ScoredCandidate[] {
  const scored = products.map(p => scoreCandidate(p, ctx))

  // Apply small penalty for 'unknown' fixture class in advisory mode
  if (classMatchMap) {
    scored.forEach(c => {
      if (classMatchMap.get(c.product.id) === 'unknown') c.score -= 5
    })
  }

  scored.sort((a, b) => b.score - a.score)

  const selected = diversifySelection(scored, limit, ctx.projectPosture, skipDiversity)
  enrichWithComparativeRationale(selected, ctx, classMatchMap)

  const labels = ['Top pick', 'Strong alternative', 'Also consider', 'Consider', 'Alternative']
  return selected.map((c, i) => ({ ...c, rankLabel: labels[i] ?? `Option ${i + 1}` }))
}
