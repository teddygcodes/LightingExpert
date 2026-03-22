// lib/agent/tools.ts
// All 5 chat agent tools: search_products, cross_reference, get_spec_sheet, add_to_submittal, recommend_fixtures.

import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { searchProducts } from '@/lib/products-search'
import { findMatches } from '@/lib/cross-reference'
import type { ComparisonSnapshot } from '@/lib/types'
import { buildRecommendationContext, rankCandidates, ClassMatchResult, inferFixtureClass } from '@/lib/agent/recommend'

// ─── Helper: derive human-readable differences from comparisonSnapshot ─────────

function deriveImportantDifferences(snapshot: ComparisonSnapshot, matchReason: string): string[] {
  const diffs: string[] = []
  const { deltas } = snapshot

  if (deltas.lumens) {
    const pct = parseFloat(deltas.lumens)
    if (!isNaN(pct) && Math.abs(pct) > 5) {
      diffs.push(`Lumens ${pct > 0 ? 'higher' : 'lower'} (${deltas.lumens} vs source)`)
    }
  }
  if (deltas.wattage) {
    const pct = parseFloat(deltas.wattage)
    if (!isNaN(pct) && Math.abs(pct) > 10) {
      diffs.push(`Wattage ${pct > 0 ? 'higher' : 'lower'} (${deltas.wattage})`)
    }
  }
  if (deltas.cri && deltas.cri !== 'Match') {
    diffs.push(`CRI: ${deltas.cri}`)
  }
  if (deltas.cctOptions && deltas.cctOptions !== 'Full match') {
    diffs.push(`CCT: ${deltas.cctOptions}`)
  }

  for (const r of matchReason.split('; ')) {
    const low = r.toLowerCase()
    if (
      low.includes('mismatch') ||
      low.includes('differ') ||
      low.includes('not') ||
      low.includes('lower') ||
      low.includes('but') ||
      low.includes('without')
    ) {
      if (!diffs.includes(r)) diffs.push(r)
    }
  }

  return diffs.length > 0 ? diffs : ['No significant differences identified']
}

// ─── Helper: next unused fixture type letter ───────────────────────────────────

async function nextFixtureType(submittalId: string): Promise<string> {
  const items = await prisma.submittalItem.findMany({
    where: { submittalId },
    select: { fixtureType: true },
  })
  const used = new Set(items.map((i) => (i.fixtureType ?? '').toUpperCase()))

  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i)
    if (!used.has(letter)) return letter
  }
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(65 + i) + String.fromCharCode(65 + j)
      if (!used.has(code)) return code
    }
  }
  return `X${items.length + 1}`
}

// ─── Zod schemas (defined separately so execute can use z.infer) ──────────────

const searchProductsSchema = z.object({
  query: z.string().optional().describe(
    "Free text search: catalog number, product family, description, or application. Examples: 'CPX', '2x4 troffer', 'wall pack wet location', 'elite downlight'. Optional if structured filters are provided."
  ),
  manufacturer: z.enum(['acuity', 'cooper', 'elite', 'current', 'lutron']).optional()
    .describe('Filter to a specific manufacturer slug.'),
  categorySlug: z.string().optional().describe(
    "Category slug. Examples: 'troffers-panels', 'downlights', 'high-bay', 'wall-pack', 'flood', 'strip', 'linear', 'area-site', 'exit-emergency', 'track-lighting', 'architectural', 'cylinders', 'surface-mount', 'pendant', 'wraps', 'bollards', 'landscape', 'bay-lighting', 'panels', 'retrofit-kits', 'step-lights', 'linear-slot', 'decorative', 'sensors', 'dimmers-switches'."
  ),
  minLumens: z.number().optional().describe('Minimum lumen output'),
  maxWattage: z.number().optional().describe('Maximum wattage'),
  cct: z.string().optional().describe("Color temperature filter. Examples: '3000K', '4000K', '5000K'"),
  minCri: z.number().optional().describe('Minimum CRI value (e.g. 80, 90)'),
  environment: z.enum(['indoor', 'outdoor', 'both']).optional().describe('Indoor, outdoor, or both'),
  dlcListed: z.boolean().optional().describe('Must be DLC listed'),
  wetLocation: z.boolean().optional().describe('Must be wet location rated'),
  fixtureType: z.enum([
    'HIGH_BAY', 'LOW_BAY', 'TROFFER', 'FLAT_PANEL', 'DOWNLIGHT', 'RECESSED_CAN',
    'CYLINDER', 'VAPOR_TIGHT', 'WALL_PACK', 'WALL_MOUNT', 'SCONCE', 'FLOOD',
    'AREA_SITE', 'ROADWAY', 'CANOPY', 'GARAGE', 'LINEAR_SUSPENDED', 'LINEAR_SURFACE',
    'LINEAR_SLOT', 'STRIP', 'WRAP', 'PENDANT', 'SURFACE_MOUNT', 'TRACK', 'BOLLARD',
    'LANDSCAPE', 'POST_TOP', 'STEP_LIGHT', 'UNDER_CABINET', 'EXIT_EMERGENCY',
    'VANITY', 'COVE', 'RETROFIT_KIT', 'CONTROLS', 'SENSOR', 'DRIVER', 'POWER_SUPPLY',
    'MODULAR_WIRING', 'POLE', 'ARM_BRACKET', 'ACCESSORY', 'SPORTS_LIGHTING', 'UV_C',
    'SURGICAL', 'CLEANROOM', 'VANDAL_RESISTANT', 'BEHAVIORAL', 'DECORATIVE', 'OTHER',
  ]).optional().describe('Canonical fixture type. Use when you know the exact fixture type needed. Examples: HIGH_BAY for high bays, TROFFER for troffers/2x4, DOWNLIGHT for recessed downlights, WALL_PACK for exterior wall packs.'),
  limit: z.number().optional().describe('Max results to return. Default 10, max 20.'),
})

const crossReferenceSchema = z.object({
  catalogNumber: z.string().describe('Source fixture catalog number to cross-reference'),
  targetManufacturer: z.enum(['acuity', 'cooper', 'elite', 'current', 'lutron']).optional()
    .describe('Which manufacturer to find equivalents from. If omitted, searches all other manufacturers.'),
})

const getSpecSheetSchema = z.object({
  catalogNumber: z.string().describe('Product catalog number'),
})

const addToSubmittalSchema = z.object({
  catalogNumber: z.string().describe('Product catalog number to add'),
  fixtureType: z.string().optional().describe(
    "Fixture type designation for the schedule. Examples: 'A', 'B', 'C', 'A1'. If not specified, auto-assigns next available letter."
  ),
  quantity: z.number().optional().describe('Number of fixtures. Default 1.'),
  location: z.string().optional().describe(
    "Where the fixture goes. Examples: 'Open office', 'Conference rooms', 'Parking lot'"
  ),
  submittalId: z.string().optional().describe(
    'ID of existing submittal to add to. If omitted, uses the most recent DRAFT submittal or creates a new one.'
  ),
})

const FIXTURE_TYPE_VALUES = [
  'HIGH_BAY', 'LOW_BAY', 'TROFFER', 'FLAT_PANEL', 'DOWNLIGHT', 'RECESSED_CAN',
  'CYLINDER', 'VAPOR_TIGHT', 'WALL_PACK', 'WALL_MOUNT', 'SCONCE', 'FLOOD',
  'AREA_SITE', 'ROADWAY', 'CANOPY', 'GARAGE', 'LINEAR_SUSPENDED', 'LINEAR_SURFACE',
  'LINEAR_SLOT', 'STRIP', 'WRAP', 'PENDANT', 'SURFACE_MOUNT', 'TRACK', 'BOLLARD',
  'LANDSCAPE', 'POST_TOP', 'STEP_LIGHT', 'UNDER_CABINET', 'EXIT_EMERGENCY',
  'VANITY', 'COVE', 'RETROFIT_KIT', 'CONTROLS', 'SENSOR', 'DRIVER', 'POWER_SUPPLY',
  'MODULAR_WIRING', 'POLE', 'ARM_BRACKET', 'ACCESSORY', 'SPORTS_LIGHTING', 'UV_C',
  'SURGICAL', 'CLEANROOM', 'VANDAL_RESISTANT', 'BEHAVIORAL', 'DECORATIVE', 'OTHER',
] as const

const recommendFixturesSchema = z.object({
  applicationType: z.string().describe(
    'Space or application type: classroom, office, warehouse, retail, healthcare, renovation, school, private_school, etc.'
  ),
  budgetSensitivity: z.enum(['value', 'standard', 'premium']).optional().describe(
    "value = budget-sensitive/contractor posture; standard = typical commercial (default); premium = design-forward/architectural intent. Omit to use application-type defaults."
  ),
  fixtureType: z.enum(FIXTURE_TYPE_VALUES).optional().describe(
    'Canonical fixture type. E.g. TROFFER for 2x4/2x2 troffers, HIGH_BAY for warehouse, DOWNLIGHT for recessed.'
  ),
  minLumens: z.number().optional(),
  maxWattage: z.number().optional(),
  preferredCct: z.number().optional().describe('Preferred CCT in Kelvin, e.g. 3500 or 4000'),
  minCri: z.number().optional(),
  dlcRequired: z.boolean().optional().describe('If true, only DLC-listed products are considered'),
  wetLocation: z.boolean().optional(),
  manufacturerSlug: z.string().optional()
    .describe('Filter to a specific manufacturer by slug (e.g. "acuity", "elite"). Also disables cross-manufacturer diversity logic — use when the user explicitly names a brand.'),
  query: z.string().optional()
    .describe('Form factor or size token (e.g. "2x4", "2x2", "1x4"). Pass this when the user specifies a physical size so only that form factor is considered. Do NOT pass general text here — use fixtureType for fixture class.'),
  limit: z.number().min(1).max(5).optional().describe('Top N results to return. Default 3, max 5.'),
})

// ─── Tool 1: search_products ──────────────────────────────────────────────────

export const searchProductsTool = tool({
  description:
    'Search the lighting product database. Use this to find fixtures matching specific requirements like application type, lumen output, wattage, CCT, manufacturer, or category. Also use for catalog number lookups. Provide EITHER a free-text query OR at least one structured filter — or both.',
  parameters: searchProductsSchema,
  execute: async (params: z.infer<typeof searchProductsSchema>) => {
    console.log('[search_products] params:', JSON.stringify(params))
    try {
      const hasFilter =
        params.query ||
        params.manufacturer ||
        params.categorySlug ||
        params.fixtureType ||
        params.minLumens != null ||
        params.maxWattage != null ||
        params.cct ||
        params.minCri != null ||
        params.environment ||
        params.dlcListed ||
        params.wetLocation

      if (!hasFilter) {
        return { error: 'Please provide at least a search query or one filter to narrow down products.' }
      }

      const rows = await searchProducts({
        query: params.query,
        manufacturerSlug: params.manufacturer,
        categorySlug: params.categorySlug,
        fixtureType: params.fixtureType,
        minLumens: params.minLumens,
        maxWattage: params.maxWattage,
        cct: params.cct,
        minCri: params.minCri,
        environment: params.environment,
        dlcListed: params.dlcListed,
        wetLocation: params.wetLocation,
        limit: params.limit ?? 10,
      })

      return { products: rows, total: rows.length }
    } catch (err) {
      console.error('[tool:search_products] Error:', err)
      return { error: 'Search temporarily unavailable. Please try again.' }
    }
  },
})

// ─── Tool 2: cross_reference ──────────────────────────────────────────────────

export const crossReferenceTool = tool({
  description:
    "Find equivalent fixtures from other manufacturers. IMPORTANT: the catalogNumber parameter must be a real catalog number already retrieved from the database — call search_products first if the user only gave a partial description, family name, or spec. Use this when someone asks 'what's the equivalent of X in Y brand' or 'cross reference this fixture'.",
  parameters: crossReferenceSchema,
  execute: async ({ catalogNumber, targetManufacturer }: z.infer<typeof crossReferenceSchema>) => {
    try {
      const mfrInclude = { manufacturer: { select: { name: true, slug: true } } }
      // 1. Exact match
      let source = await prisma.product.findFirst({
        where: { catalogNumber: { equals: catalogNumber, mode: 'insensitive' }, isActive: true },
        include: mfrInclude,
      })
      // 2. Catalog number starts with input (e.g. "CPX" → "CPX 2X4 L40")
      if (!source) {
        source = await prisma.product.findFirst({
          where: { catalogNumber: { startsWith: catalogNumber, mode: 'insensitive' }, isActive: true },
          include: mfrInclude,
          orderBy: { catalogNumber: 'asc' },
        })
      }
      // 3. Family name exact match (e.g. "CPX" is a familyName)
      if (!source) {
        source = await prisma.product.findFirst({
          where: { familyName: { equals: catalogNumber, mode: 'insensitive' }, isActive: true },
          include: mfrInclude,
        })
      }
      if (!source) {
        return { error: `Product not found: "${catalogNumber}". Check the catalog number and try again.` }
      }

      const { matches, rejects, filterLevel } = await findMatches(source.id, targetManufacturer)

      const top5 = matches.slice(0, 5).map((m) => ({
        catalogNumber: m.catalogNumber,
        displayName: m.displayName,
        manufacturerSlug: m.manufacturerSlug,
        confidence: m.confidence,
        matchType: m.matchType,
        matchReason: m.matchReason,
        importantDifferences: deriveImportantDifferences(m.comparisonSnapshot, m.matchReason),
      }))

      // ── Fallback: if no exact matches, auto-search the target manufacturer
      //    using specs inferred from the source product.
      const needsFallback = filterLevel === 'untyped' || top5.length === 0
      let fallbackAlternatives: Awaited<ReturnType<typeof searchProducts>> = []
      let fallbackUsed = false
      let fallbackInferredSpecs: Record<string, unknown> | undefined

      if (needsFallback) {
        const inferredParams: Parameters<typeof searchProducts>[0] = { limit: 5 }

        if (targetManufacturer) inferredParams.manufacturerSlug = targetManufacturer

        if (source.canonicalFixtureType) {
          inferredParams.fixtureType = source.canonicalFixtureType as string
        }

        // Lumen floor: prefer lumensMin if available, else 80% of lumens
        const lumenFloor = source.lumensMin ?? (source.lumens ? Math.floor(source.lumens * 0.8) : undefined)
        if (lumenFloor) inferredParams.minLumens = lumenFloor

        // Environment mapping (DB enum → search param)
        if (source.environment) {
          const envMap: Record<string, 'indoor' | 'outdoor' | 'both'> = {
            INDOOR: 'indoor', OUTDOOR: 'outdoor', BOTH: 'both',
          }
          const mapped = envMap[source.environment as string]
          if (mapped) inferredParams.environment = mapped
        }

        if (source.wetLocation) inferredParams.wetLocation = true
        if (source.dlcListed) inferredParams.dlcListed = true

        if (source.cctOptions?.length) {
          inferredParams.cct = `${source.cctOptions[0]}K`
        }

        fallbackInferredSpecs = { ...inferredParams }

        try {
          fallbackAlternatives = await searchProducts(inferredParams)
          fallbackUsed = true
        } catch {
          // silently ignore fallback failure
        }
      }

      return {
        source: {
          catalogNumber: source.catalogNumber,
          displayName: source.displayName,
          manufacturer: source.manufacturer.name,
          wattage: source.wattage,
          lumens: source.lumens,
          cri: source.cri,
          cctOptions: source.cctOptions,
        },
        exactMatches: top5,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fallbackAlternatives: fallbackAlternatives as any,
        fallbackUsed,
        fallbackInferredSpecs,
        rejectCount: rejects.length,
        filterLevel,
        filterDescription: filterLevel === 'canonical'
          ? 'Results scoped to same fixture type only'
          : fallbackUsed
            ? `Fixture type not classified — showing closest ${targetManufacturer ?? 'alternative'} options by spec`
            : 'Fixture type not classified — cross-reference unavailable',
      }
    } catch (err) {
      console.error('[tool:cross_reference] Error:', err)
      return { error: 'Cross-reference temporarily unavailable. Please try again.' }
    }
  },
})

// ─── Tool 3: get_spec_sheet ───────────────────────────────────────────────────

export const getSpecSheetTool = tool({
  description:
    'Retrieve the spec sheet for a specific product. Returns the PDF path so it can be displayed inline. Use when someone asks to see a spec sheet, data sheet, or cut sheet.',
  parameters: getSpecSheetSchema,
  execute: async ({ catalogNumber }: z.infer<typeof getSpecSheetSchema>) => {
    try {
      const product = await prisma.product.findFirst({
        where: { catalogNumber: { equals: catalogNumber, mode: 'insensitive' }, isActive: true },
        select: {
          catalogNumber: true,
          displayName: true,
          specSheetPath: true,
          specSheets: true,
          productPageUrl: true,
          configOptions: true,
          manufacturer: { select: { name: true } },
        },
      })
      if (!product) {
        return { error: `Product not found: "${catalogNumber}". Check the catalog number and try again.` }
      }
      const matchType: 'exact_product_match' | 'family_spec_sheet_match' =
        Array.isArray(product.configOptions) && (product.configOptions as unknown[]).length > 0
          ? 'family_spec_sheet_match'
          : 'exact_product_match'
      return {
        catalogNumber: product.catalogNumber,
        displayName: product.displayName,
        manufacturer: product.manufacturer.name,
        specSheetPath: product.specSheetPath,
        specSheets: product.specSheets,
        productPageUrl: product.productPageUrl,
        matchType,
      }
    } catch (err) {
      console.error('[tool:get_spec_sheet] Error:', err)
      return { error: 'Spec sheet lookup temporarily unavailable. Please try again.' }
    }
  },
})

// ─── Tool 4: add_to_submittal ─────────────────────────────────────────────────

export const addToSubmittalTool = tool({
  description:
    "Add a fixture to a submittal project. Use when the user says 'add this to the submittal', 'put that on the schedule', or similar. If no active submittal exists, create one automatically. Note: uses base catalog number only — does not handle product configuration options.",
  parameters: addToSubmittalSchema,
  execute: async ({
    catalogNumber,
    fixtureType,
    quantity = 1,
    location,
    submittalId,
  }: z.infer<typeof addToSubmittalSchema>) => {
    try {
      const product = await prisma.product.findFirst({
        where: { catalogNumber: { equals: catalogNumber, mode: 'insensitive' }, isActive: true },
        select: {
          id: true,
          catalogNumber: true,
          displayName: true,
          manufacturer: { select: { name: true } },
        },
      })
      if (!product) {
        return { error: `Product not found: "${catalogNumber}". Check the catalog number and try again.` }
      }

      let wasNewSubmittal = false
      let submittal: { id: string; projectName: string } | null = null

      if (submittalId) {
        submittal = await prisma.submittal.findUnique({
          where: { id: submittalId },
          select: { id: true, projectName: true },
        })
        if (!submittal) return { error: `Submittal ID "${submittalId}" not found.` }
      } else {
        submittal = await prisma.submittal.findFirst({
          where: { status: 'DRAFT' },
          orderBy: { createdAt: 'desc' },
          select: { id: true, projectName: true },
        })
        if (!submittal) {
          const today = new Date().toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })
          submittal = await prisma.submittal.create({
            data: { projectName: `Chat Submittal — ${today}`, status: 'DRAFT' },
            select: { id: true, projectName: true },
          })
          wasNewSubmittal = true
        }
      }

      const assignedType = fixtureType ?? (await nextFixtureType(submittal.id))

      const maxOrder = await prisma.submittalItem.findFirst({
        where: { submittalId: submittal.id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      })

      await prisma.submittalItem.create({
        data: {
          submittalId: submittal.id,
          productId: product.id,
          fixtureType: assignedType,
          quantity,
          location: location ?? null,
          sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
        },
      })

      const totalItems = await prisma.submittalItem.count({ where: { submittalId: submittal.id } })

      return {
        submittalId: submittal.id,
        submittalName: submittal.projectName,
        wasNewSubmittal,
        fixtureType: assignedType,
        catalogNumber: product.catalogNumber,
        displayName: product.displayName,
        manufacturer: product.manufacturer.name,
        quantity,
        location: location ?? null,
        totalItems,
      }
    } catch (err) {
      console.error('[tool:add_to_submittal] Error:', err)
      return { error: 'Failed to add to submittal. Please try again.' }
    }
  },
})

// ─── Tool 5: recommend_fixtures ───────────────────────────────────────────────

export const recommendFixturesTool = tool({
  description:
    'Recommend the best-fit fixtures for a specific application and project context. Use this (NOT search_products) when the user asks "what\'s good for X", "recommend a fixture for Y", "what should I use in Z", or similar advisory questions. The tool infers application defaults (CCT, CRI, DLC, posture) and scores candidates by fit — not just keyword match.',
  parameters: recommendFixturesSchema,
  execute: async (params: z.infer<typeof recommendFixturesSchema>) => {
    try {
      const ctx = buildRecommendationContext({
        applicationType: params.applicationType,
        budgetSensitivity: params.budgetSensitivity,
        fixtureType: params.fixtureType as string | undefined,
        minLumens: params.minLumens,
        maxWattage: params.maxWattage,
        preferredCct: params.preferredCct,
        minCri: params.minCri,
      })

      // Focused candidate search — indoor, fixture type, DLC preference, CRI tolerance
      let candidates = await searchProducts({
        fixtureType: params.fixtureType,
        environment: ctx.indoorPreferred ? 'indoor' : 'outdoor',
        minCri: ctx.minCri > 5 ? ctx.minCri - 5 : undefined,  // slight tolerance
        dlcListed: params.dlcRequired === true ? true : undefined,
        wetLocation: params.wetLocation,
        maxWattage: ctx.maxWattage,
        manufacturerSlug: params.manufacturerSlug,
        query: params.query,  // form factor token (e.g. "2x4") — filters to that size only
        limit: 50,  // internal — allows scoring across full pool
      })

      if (candidates.length === 0) {
        // Retry without some filters if no results
        const retry = await searchProducts({
          fixtureType: params.fixtureType,
          limit: 50,
        })
        if (retry.length === 0) {
          return { error: `No products found for fixture type ${params.fixtureType ?? 'unspecified'}.` }
        }
        candidates = retry
      }

      // ── Fixture class gating ──────────────────────────────────────────────
      // Only active when fixtureType was passed. If Claude omits it, no filter applied.
      const fixtureTypeRequested = params.fixtureType as string | undefined

      // Build class match map (used for exclusion + scoring penalty)
      const classMatchMap = new Map<string, ClassMatchResult>()
      if (fixtureTypeRequested) {
        for (const p of candidates) {
          classMatchMap.set(p.id, inferFixtureClass(p, fixtureTypeRequested))
        }
      }

      // Hard-exclude 'excluded' products; keep 'confirmed', 'inferred_match', 'unknown'
      const classifiedCandidates = fixtureTypeRequested
        ? candidates.filter(p => classMatchMap.get(p.id) !== 'excluded')
        : candidates

      // Debug: log class match for each candidate (dev only)
      if (process.env.NODE_ENV !== 'production') {
        candidates.forEach(p => {
          const match = classMatchMap.get(p.id) ?? 'no-filter'
          console.log(`[recommend:class] ${p.catalogNumber.padEnd(20)} | canonical: ${String(p.canonicalFixtureType ?? 'null').padEnd(20)} | match: ${match}`)
        })
      }

      const ranked = rankCandidates(classifiedCandidates, ctx, Math.min(params.limit ?? 3, 5), !!params.manufacturerSlug, classMatchMap)

      return {
        recommendations: ranked.map(c => ({
          ...c.product,
          score: c.score,
          fitConfidence: c.fitConfidence,
          rankLabel: c.rankLabel,
          whyRecommended: c.whyRecommended,
          tradeoffs: c.tradeoffs,
        })),
        context: {
          applicationType: params.applicationType,
          projectPosture: ctx.projectPosture,
          inferredDefaults: ctx.inferredDefaultsDescription,
        },
        evaluatedCount: classifiedCandidates.length,
      }
    } catch (err) {
      console.error('[tool:recommend_fixtures] Error:', err)
      return { error: 'Recommendation temporarily unavailable. Please try again.' }
    }
  },
})

// ─── Export all tools ──────────────────────────────────────────────────────────

export const agentTools = {
  search_products: searchProductsTool,
  cross_reference: crossReferenceTool,
  get_spec_sheet: getSpecSheetTool,
  add_to_submittal: addToSubmittalTool,
  recommend_fixtures: recommendFixturesTool,
}
