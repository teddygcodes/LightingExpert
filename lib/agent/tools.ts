// lib/agent/tools.ts
// All 4 chat agent tools: search_products, cross_reference, get_spec_sheet, add_to_submittal.

import { tool } from 'ai'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'
import { searchProducts } from '@/lib/products-search'
import { findMatches } from '@/lib/cross-reference'
import type { ComparisonSnapshot } from '@/lib/types'

const anthropic = new Anthropic()

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

// ─── Tool 1: search_products ──────────────────────────────────────────────────

export const searchProductsTool = tool({
  description:
    'Search the lighting product database. Use this to find fixtures matching specific requirements like application type, lumen output, wattage, CCT, manufacturer, or category. Also use for catalog number lookups. Provide EITHER a free-text query OR at least one structured filter — or both.',
  parameters: searchProductsSchema,
  execute: async (params: z.infer<typeof searchProductsSchema>) => {
    try {
      const hasFilter =
        params.query ||
        params.manufacturer ||
        params.categorySlug ||
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
      return { error: `Search failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
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

      const { matches, rejects, filterLevel } = await findMatches(source.id)

      const filtered = targetManufacturer
        ? matches.filter((m) => m.manufacturerSlug === targetManufacturer)
        : matches

      const top5 = filtered.slice(0, 5).map((m) => ({
        catalogNumber: m.catalogNumber,
        displayName: m.displayName,
        manufacturerSlug: m.manufacturerSlug,
        confidence: m.confidence,
        matchType: m.matchType,
        matchReason: m.matchReason,
        importantDifferences: deriveImportantDifferences(m.comparisonSnapshot, m.matchReason),
      }))

      // ─── AI verification: filter out fixture-type mismatches ─────────────────
      let verifiedMatches = top5
      if (top5.length > 0) {
        try {
          const sourceDesc = [
            source.displayName,
            source.familyName,
            source.lumens ? `${source.lumens} lumens` : null,
            source.wattage ? `${source.wattage}W` : null,
            source.voltage ?? null,
            source.dlcListed ? 'DLC listed' : null,
            source.wetLocation ? 'wet location rated' : null,
          ].filter(Boolean).join(', ')

          // Fetch familyName for richer candidate context
          const candidateMeta = await prisma.product.findMany({
            where: { catalogNumber: { in: top5.map((m) => m.catalogNumber) } },
            select: { catalogNumber: true, familyName: true },
          })
          const familyMap = new Map(candidateMeta.map((p) => [p.catalogNumber, p.familyName]))

          const candidateList = top5
            .map((m, i) => {
              const family = familyMap.get(m.catalogNumber)
              const label = family && family !== m.displayName ? `${m.displayName} (${family})` : m.displayName
              return `${i + 1}. ${m.catalogNumber} — ${label}`
            })
            .join('\n')

          const verifyMsg = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 256,
            messages: [{
              role: 'user',
              content: `Source fixture: ${source.catalogNumber} — ${sourceDesc}

Candidates returned as possible equivalents:
${candidateList}

Reply with a JSON array of catalog numbers to KEEP. Only remove obvious wrong fixture types (sign lights, roadway fixtures, decorative pendants, exit/emergency, sensors). Keep industrial/commercial overhead fixtures even if not an exact type match. Format: {"keep":["CAT1","CAT2",...]}`,
            }],
          })

          const raw = verifyMsg.content[0].type === 'text' ? verifyMsg.content[0].text : ''
          const jsonMatch = raw.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as { keep: string[] }
            if (Array.isArray(parsed.keep)) {
              const keepSet = new Set(parsed.keep.map((s: string) => s.toUpperCase()))
              verifiedMatches = top5.filter((m) => keepSet.has(m.catalogNumber.toUpperCase()))
              console.log(`[cross-ref] AI verification: kept ${verifiedMatches.length}/${top5.length}`, parsed.keep)
            }
          }
        } catch (err) {
          console.warn('[cross-ref] AI verification failed, using unfiltered results:', err)
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
        matches: verifiedMatches,
        rejectCount: rejects.length,
        filterLevel,
        filterDescription: filterLevel === 'group'
          ? 'Results scoped to same fixture category only'
          : filterLevel === 'branch'
          ? 'Results scoped to same indoor/outdoor branch'
          : 'Broad search — fixture category could not be determined',
      }
    } catch (err) {
      return { error: `Cross-reference failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
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
          manufacturer: { select: { name: true } },
        },
      })
      if (!product) {
        return { error: `Product not found: "${catalogNumber}". Check the catalog number and try again.` }
      }
      return {
        catalogNumber: product.catalogNumber,
        displayName: product.displayName,
        manufacturer: product.manufacturer.name,
        specSheetPath: product.specSheetPath,
        specSheets: product.specSheets,
        productPageUrl: product.productPageUrl,
      }
    } catch (err) {
      return { error: `Spec sheet lookup failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
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
      return { error: `Failed to add to submittal: ${err instanceof Error ? err.message : 'Unknown error'}` }
    }
  },
})

// ─── Export all tools ──────────────────────────────────────────────────────────

export const agentTools = {
  search_products: searchProductsTool,
  cross_reference: crossReferenceTool,
  get_spec_sheet: getSpecSheetTool,
  add_to_submittal: addToSubmittalTool,
}
