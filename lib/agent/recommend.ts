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
  minLumens?: number
  maxWattage?: number
  preferredCct?: number
  overriddenMinCri?: number
  inferredDefaultsDescription: string[]
}

export interface RecommendParams {
  applicationType: string
  budgetSensitivity?: 'value' | 'standard' | 'premium'
  minLumens?: number
  maxWattage?: number
  preferredCct?: number
  minCri?: number
}

export function buildRecommendationContext(params: RecommendParams): RecommendationContext {
  const key = params.applicationType.toLowerCase().replace(/\s+/g, '_')
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
    preferredCCTs,
    minCri,
    minLumens: params.minLumens,
    maxWattage: params.maxWattage,
    preferredCct: params.preferredCct,
    overriddenMinCri: params.minCri,
    inferredDefaultsDescription,
  }
}

// ─── Tier Weight Tables ───────────────────────────────────────────────────────

// Tier weight by posture: [contractor, commercial, premium, specialty]
const TIER_WEIGHTS: Record<ProjectPosture, Record<BrandTier, number>> = {
  value_engineered:    { contractor: 20, commercial: 15, premium:  8, specialty:  5 },
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
    if (product.dlcPremium) { score += 15; positives.push('DLC Premium') }
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
      if (ctx.projectPosture === 'premium_design' && product.cri >= 90) {
        score += 5; positives.push(`CRI ${product.cri}`)
      }
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
  const whyRecommended = fitConfidence < 0.5 ? `${whyBase} (limited spec data)` : whyBase
  const tradeoffs = negatives.length > 0 ? negatives.join('; ') : undefined

  return { product, score, fitConfidence, whyRecommended, tradeoffs }
}

export function rankCandidates(
  products: SearchProductRow[],
  ctx: RecommendationContext,
  limit: number
): ScoredCandidate[] {
  const scored = products.map(p => scoreCandidate(p, ctx))
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, limit)
  const labels = ['Top pick', 'Strong alternative', 'Also consider', 'Consider', 'Alternative']
  return top.map((c, i) => ({ ...c, rankLabel: labels[i] ?? `Option ${i + 1}` }))
}
