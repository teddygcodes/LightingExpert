// lib/products-search.ts
// Shared product search logic used by both /api/products and the chat agent tool.

import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'

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
  minLumens?: number
  maxWattage?: number
  cct?: string
  minCri?: number
  environment?: 'indoor' | 'outdoor' | 'both'
  dlcListed?: boolean
  wetLocation?: boolean
  limit?: number
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
  manufacturer: { select: { name: true, slug: true } },
} as const

export type SearchProductRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>

export async function searchProducts(params: SearchProductsParams): Promise<SearchProductRow[]> {
  const limit = Math.min(params.limit ?? 10, 20)
  const where: Prisma.ProductWhereInput = { isActive: true }

  // Manufacturer filter (by slug)
  if (params.manufacturerSlug) {
    where.manufacturer = { slug: params.manufacturerSlug }
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

  // Free-text query: try manufacturer-prefixed 3-bucket, then tsvector
  if (params.query) {
    const tokens = params.query.split(/\s+/).filter(Boolean)
    if (tokens.length >= 2) {
      try {
        const mfgToken = tokens[0]
        const rest = tokens.slice(1).join(' ')
        const mfgBase: Prisma.ProductWhereInput = {
          isActive: true,
          manufacturer: { name: { contains: mfgToken, mode: 'insensitive' } },
          ...(where.categoryId ? { categoryId: where.categoryId } : {}),
        }

        const b1 = await prisma.product.findMany({
          where: { ...mfgBase, catalogNumber: { startsWith: rest, mode: 'insensitive' } },
          select: PRODUCT_SELECT,
          take: limit,
        })
        if (b1.length > 0) return b1

        const b1Ids = new Set(b1.map((p) => p.id))
        const b2 = await prisma.product.findMany({
          where: {
            ...mfgBase,
            familyName: { startsWith: rest, mode: 'insensitive' },
            NOT: { id: { in: [...b1Ids] } },
          },
          select: PRODUCT_SELECT,
          take: limit,
        })
        const merged = [...b1, ...b2]
        if (merged.length > 0) return merged
      } catch {
        // fall through to tsvector
      }
    }

    // tsvector fallback
    try {
      const escaped = params.query.replace(/['"\\]/g, '')
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product"
        WHERE "isActive" = true
          AND search_vector @@ plainto_tsquery('english', ${escaped})
        ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${escaped})) DESC
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
