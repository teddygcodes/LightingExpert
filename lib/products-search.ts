// lib/products-search.ts
// Shared product search logic used by both /api/products and the chat agent tool.

import { prisma } from '@/lib/db'
import { Prisma, CanonicalFixtureType } from '@prisma/client'
import { FORM_FACTOR_MAP } from '@/lib/crawler/normalize'

export async function getDescendantCategoryIds(rootId: string, manufacturerId: string): Promise<string[]> {
  const all = await prisma.category.findMany({
    where: { manufacturerId },
    select: { id: true, parentId: true },
  })
  const childrenOf = new Map<string, string[]>()
  for (const c of all) {
    if (c.parentId) {
      const arr = childrenOf.get(c.parentId) ?? []
      arr.push(c.id)
      childrenOf.set(c.parentId, arr)
    }
  }
  const ids: string[] = []
  const stack = [rootId]
  while (stack.length) {
    const id = stack.pop()!
    ids.push(id)
    const children = childrenOf.get(id)
    if (children) stack.push(...children)
  }
  return ids
}

export interface SearchProductsParams {
  query?: string
  manufacturerSlug?: string
  categorySlug?: string
  fixtureType?: string
  minLumens?: number
  maxWattage?: number
  cct?: string
  minCri?: number
  environment?: 'indoor' | 'outdoor' | 'both'
  dlcListed?: boolean
  wetLocation?: boolean
  voltage?: string
  limit?: number
}

// Map a stated voltage to the set of DB Voltage enum values that are compatible.
// e.g. "V277" → ["V277", "V120_277", "UNIVERSAL"]
// e.g. "V480" → ["V480", "V347_480", "UNIVERSAL"]
function compatibleVoltages(stated: string): string[] {
  const always = ['UNIVERSAL', 'V120_277']  // universal/multi-volt are always included
  switch (stated) {
    case 'V120':      return ['V120', ...always]
    case 'V277':      return ['V277', 'V120_277', 'UNIVERSAL']
    case 'V120_277':  return ['V120', 'V277', 'V120_277', 'UNIVERSAL']
    case 'V347':      return ['V347', 'V120_347', 'V347_480', 'UNIVERSAL']
    case 'V480':      return ['V480', 'V347_480', 'UNIVERSAL']
    case 'V347_480':  return ['V347', 'V480', 'V347_480', 'UNIVERSAL']
    case 'UNIVERSAL': return []  // no filter — UNIVERSAL means any voltage is fine
    default:          return []
  }
}

const PRODUCT_SELECT = {
  id: true,
  catalogNumber: true,
  displayName: true,
  familyName: true,
  wattage: true,
  wattageMin: true,
  wattageMax: true,
  lumens: true,
  lumensMin: true,
  lumensMax: true,
  cri: true,
  cctOptions: true,
  voltage: true,
  dlcListed: true,
  dlcPremium: true,
  wetLocation: true,
  specSheetPath: true,
  specSheets: true,
  productPageUrl: true,
  canonicalFixtureType: true,
  orderingMatrixId: true,
  manufacturer: { select: { name: true, slug: true } },
} as const

export type SearchProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>

export async function searchProducts(params: SearchProductsParams): Promise<SearchProductRow[]> {
  const limit = Math.min(params.limit ?? 10, 50)
  const where: Prisma.ProductWhereInput = { isActive: true }

  // Manufacturer filter (by slug)
  if (params.manufacturerSlug) {
    where.manufacturer = { slug: params.manufacturerSlug }
  }

  // Canonical fixture type filter
  if (params.fixtureType) {
    where.canonicalFixtureType = params.fixtureType as CanonicalFixtureType
  }

  // Category filter — find by slug, expand descendants
  if (params.categorySlug) {
    const cat = await prisma.category.findFirst({
      where: { slug: params.categorySlug },
      select: { id: true, manufacturerId: true },
    })
    if (cat) {
      const ids = await getDescendantCategoryIds(cat.id, cat.manufacturerId)
      where.categoryId = { in: ids }
    }
  }

  // Structured filters
  if (params.minLumens != null) {
    where.OR = [
      { lumens: { gte: params.minLumens } },
      { lumensMax: { gte: params.minLumens } },
    ]
  }

  const andClauses: Prisma.ProductWhereInput[] = []
  if (Array.isArray(where.AND)) {
    andClauses.push(...(where.AND as Prisma.ProductWhereInput[]))
  }

  if (params.maxWattage != null) {
    andClauses.push({
      OR: [
        { wattage: { lte: params.maxWattage } },
        { wattageMax: { lte: params.maxWattage } },
      ],
    })
  }

  if (andClauses.length > 0) where.AND = andClauses

  if (params.cct) {
    // cctOptions is Int[] in DB — parse "4000K" → 4000
    const cctNum = parseInt(params.cct.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(cctNum)) {
      where.cctOptions = { has: cctNum }
    }
  }
  if (params.minCri != null) {
    where.cri = { gte: params.minCri }
  }
  if (params.environment) {
    const envMap: Record<string, 'INDOOR' | 'OUTDOOR' | 'BOTH'> = { indoor: 'INDOOR', outdoor: 'OUTDOOR', both: 'BOTH' }
    where.environment = envMap[params.environment]
  }
  if (params.dlcListed) {
    where.dlcListed = true
  }
  if (params.wetLocation) {
    where.wetLocation = true
  }
  if (params.voltage && params.voltage !== 'UNIVERSAL') {
    const voltages = compatibleVoltages(params.voltage)
    if (voltages.length > 0) {
      if (!Array.isArray(where.AND)) where.AND = []
      ;(where.AND as Prisma.ProductWhereInput[]).push({
        OR: [
          { voltage: null },  // null voltage = unknown, keep it rather than reject
          { voltage: { in: voltages as Prisma.EnumVoltageNullableFilter['in'] } },
        ],
      })
    }
  }

  // Form factor / shape tokens — match against the formFactor DB field.
  // Grid sizes (e.g. "2x4") use exact match via FORM_FACTOR_MAP normalization.
  // Shape descriptors (e.g. "round") map to multiple formFactor patterns
  // because the DB stores values like "UFO", "ROUND_UFO", "4_INCH_ROUND", "CIRCULAR_HIGH_BAY".
  if (params.query) {
    const GRID_RE = /^\d+x\d+$/i
    const SHAPE_TOKEN_MAP: Record<string, string[]> = {
      round:    ['ROUND', 'UFO', 'CIRCULAR'],
      ufo:      ['UFO', 'ROUND'],
      circular: ['CIRCULAR', 'ROUND', 'UFO'],
      linear:   ['LINEAR', 'FT_LINEAR'],
    }
    const queryTokens = params.query.split(/\s+/)
    const gridTokens  = queryTokens.filter(t => GRID_RE.test(t))
    const shapeTokens = queryTokens.filter(t => t.toLowerCase() in SHAPE_TOKEN_MAP)
    const remaining   = queryTokens.filter(t => !GRID_RE.test(t) && !(t.toLowerCase() in SHAPE_TOKEN_MAP)).join(' ')

    if (gridTokens.length > 0 || shapeTokens.length > 0) {
      const ffClauses: Prisma.ProductWhereInput[] = [
        ...gridTokens.map(t => {
          const normalized = FORM_FACTOR_MAP[t.toLowerCase()]
          return normalized
            ? { formFactor: { equals: normalized, mode: 'insensitive' as const } }
            : { formFactor: { contains: t, mode: 'insensitive' as const } }
        }),
        ...shapeTokens.flatMap(t =>
          (SHAPE_TOKEN_MAP[t.toLowerCase()] ?? []).map(p => ({ formFactor: { contains: p, mode: 'insensitive' as const } }))
        ),
      ]
      if (!Array.isArray(where.AND)) where.AND = []
      ;(where.AND as Prisma.ProductWhereInput[]).push({ OR: ffClauses })
      params = { ...params, query: remaining || undefined }
    }
  }

  // Free-text query: try manufacturer-prefixed 3-bucket, then tsvector
  if (params.query) {
    const tokens = params.query.split(/\s+/).filter(Boolean)
    if (tokens.length >= 2) {
      try {
        const mfgToken = tokens[0]
        const rest = tokens.slice(1).join(' ')

        // Use manufacturer slug if already specified, otherwise match first token against name
        const mfrFilter = params.manufacturerSlug
          ? Prisma.sql`AND m.slug = ${params.manufacturerSlug}`
          : Prisma.sql`AND m.name ILIKE '%' || ${mfgToken} || '%'`
        const catFilter = where.categoryId && typeof where.categoryId === 'object' && 'in' in where.categoryId
          ? Prisma.sql`AND p."categoryId" = ANY(${(where.categoryId as { in: string[] }).in}::text[])`
          : Prisma.sql``
        const ftFilter = where.canonicalFixtureType
          ? Prisma.sql`AND p."canonicalFixtureType"::text = ${where.canonicalFixtureType as string}`
          : Prisma.sql``

        // Single ranked query replaces 2 sequential bucket queries
        const ranked = await prisma.$queryRaw<{ id: string }[]>`
          SELECT p.id FROM "Product" p
          JOIN "Manufacturer" m ON m.id = p."manufacturerId"
          WHERE p."isActive" = true
            ${mfrFilter}
            ${catFilter}
            ${ftFilter}
            AND (
              p."catalogNumber" ILIKE ${rest} || '%'
              OR p."familyName" ILIKE ${rest} || '%'
            )
          ORDER BY
            CASE
              WHEN p."catalogNumber" ILIKE ${rest} || '%' THEN 1
              ELSE 2
            END,
            p."catalogNumber" ASC
          LIMIT ${Prisma.raw(String(limit))}
        `

        if (ranked.length > 0) {
          const ids = ranked.map((r) => r.id)
          const products = await prisma.product.findMany({
            where: { id: { in: ids } },
            select: PRODUCT_SELECT,
          })
          return ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as SearchProductRow[]
        }
      } catch {
        // fall through to tsvector
      }
    }

    // tsvector fallback
    try {
      const escaped = params.query.replace(/['"\\]/g, '')
      const tsMfrFilter = params.manufacturerSlug
        ? Prisma.sql`AND m.slug = ${params.manufacturerSlug}`
        : Prisma.sql``
      const tsFtFilter = params.fixtureType
        ? Prisma.sql`AND p."canonicalFixtureType"::text = ${params.fixtureType}`
        : Prisma.sql``
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM "Product" p
        JOIN "Manufacturer" m ON m.id = p."manufacturerId"
        WHERE p."isActive" = true
          AND p.search_vector @@ plainto_tsquery('english', ${escaped})
          ${tsMfrFilter}
          ${tsFtFilter}
        ORDER BY ts_rank(p.search_vector, plainto_tsquery('english', ${escaped})) DESC
        LIMIT ${Prisma.raw(String(limit))}
      `
      if (rows.length > 0) {
        const ids = rows.map((r) => r.id)
        const products = await prisma.product.findMany({
          where: { id: { in: ids } },
          select: PRODUCT_SELECT,
        })
        const sorted = ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as SearchProductRow[]
        return sorted
      }
    } catch {
      // fall through to fuzzy query
    }

    // Fuzzy fallback — handles typos like "stak" → "STACK" via pg_trgm word_similarity
    // Only runs when tsvector returns 0 results (i.e. query has no real English word match)
    try {
      const STOP_WORDS = new Set(['the','a','an','for','of','in','on','with','and','or','to','is','it','at','by','from'])
      const significantTokens = tokens.filter(t => t.length >= 3 && !STOP_WORDS.has(t.toLowerCase()))
      if (significantTokens.length > 0) {
        // Build manufacturer filter condition for the raw query
        const mfrFilter = params.manufacturerSlug
          ? Prisma.sql`AND m.slug = ${params.manufacturerSlug}`
          : Prisma.sql``
        const catFilter = where.categoryId && typeof where.categoryId === 'object' && 'in' in where.categoryId
          ? Prisma.sql`AND p."categoryId" = ANY(${(where.categoryId as { in: string[] }).in}::text[])`
          : Prisma.sql``

        for (const token of significantTokens) {
          const rows = await prisma.$queryRaw<{ id: string; score: number }[]>`
            SELECT p.id,
              GREATEST(
                word_similarity(${token}, p."displayName"),
                word_similarity(${token}, COALESCE(p."familyName", ''))
              ) AS score
            FROM "Product" p
            JOIN "Manufacturer" m ON m.id = p."manufacturerId"
            WHERE p."isActive" = true
              ${mfrFilter}
              ${catFilter}
              AND GREATEST(
                word_similarity(${token}, p."displayName"),
                word_similarity(${token}, COALESCE(p."familyName", ''))
              ) > 0.4
            ORDER BY
              similarity(${token}, p."displayName") DESC,
              score DESC,
              LENGTH(p."displayName") ASC
            LIMIT ${Prisma.raw(String(limit))}
          `
          if (rows.length > 0) {
            const ids = rows.map((r) => r.id)
            const products = await prisma.product.findMany({
              where: { id: { in: ids } },
              select: PRODUCT_SELECT,
            })
            return ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as SearchProductRow[]
          }
        }
      }
    } catch {
      // fall through to structured query
    }
  }

  // Structured filter query (no text, or text fell through)
  return prisma.product.findMany({
    where,
    select: PRODUCT_SELECT,
    orderBy: [{ overallConfidence: 'desc' }, { catalogNumber: 'asc' }],
    take: limit,
  })
}
