import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { getDescendantCategoryIds } from '@/lib/products-search'

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const search = searchParams.get('search')?.trim() || ''
  const categoryId = searchParams.get('categoryId') || ''
  const manufacturerId = searchParams.get('manufacturerId') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))
  const offset = (page - 1) * pageSize

  const where: Prisma.ProductWhereInput = { isActive: true }
  if (manufacturerId) where.manufacturerId = manufacturerId

  // Expand categoryId to include all descendants
  if (categoryId) {
    if (manufacturerId) {
      const ids = await getDescendantCategoryIds(categoryId, manufacturerId)
      where.categoryId = { in: ids }
    } else {
      // Find the manufacturer from the category, then expand
      const cat = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { manufacturerId: true },
      })
      if (cat) {
        const ids = await getDescendantCategoryIds(categoryId, cat.manufacturerId)
        where.categoryId = { in: ids }
      } else {
        where.categoryId = categoryId
      }
    }
  }

  if (search) {
    // Manufacturer-prefixed ranked search: "elite HH6" → token[0] = manufacturer, rest = catalog
    const tokens = search.split(/\s+/).filter(Boolean)
    if (tokens.length >= 2) {
      try {
        const mfgToken = tokens[0]
        const rest = tokens.slice(1).join(' ')
        const mfgBase: Prisma.ProductWhereInput = {
          isActive: true,
          manufacturer: { name: { contains: mfgToken, mode: 'insensitive' } },
          ...(categoryId ? { categoryId: where.categoryId } : {}),
        }

        // Bucket 1: catalogNumber startsWith rest (highest priority)
        const b1 = await prisma.product.findMany({
          where: { ...mfgBase, catalogNumber: { startsWith: rest, mode: 'insensitive' } },
          include: { manufacturer: { select: { name: true, slug: true } } },
          take: pageSize,
        })
        const b1Ids = new Set(b1.map((p) => p.id))

        // Bucket 2: familyName startsWith rest
        const b2 = await prisma.product.findMany({
          where: {
            ...mfgBase,
            familyName: { startsWith: rest, mode: 'insensitive' },
            NOT: { id: { in: [...b1Ids] } },
          },
          include: { manufacturer: { select: { name: true, slug: true } } },
          take: pageSize,
        })
        const b12Ids = new Set([...b1Ids, ...b2.map((p) => p.id)])

        // Bucket 3: catalogNumber contains rest (lowest priority)
        const b3 = await prisma.product.findMany({
          where: {
            ...mfgBase,
            catalogNumber: { contains: rest, mode: 'insensitive' },
            NOT: { id: { in: [...b12Ids] } },
          },
          include: { manufacturer: { select: { name: true, slug: true } } },
          take: pageSize,
        })

        const merged = [...b1, ...b2, ...b3].slice(0, pageSize)
        if (merged.length > 0) {
          return NextResponse.json({ data: merged, total: merged.length, page: 1, pageSize })
        }
        // Fall through to tsvector if no manufacturer-prefixed results found
      } catch {
        // Fall through to tsvector
      }
    }

    // Full-text search via tsvector (single-token or manufacturer search returned nothing)
    try {
      const escaped = search.replace(/['"\\]/g, '')
      const rows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product"
        WHERE "isActive" = true
          AND search_vector @@ plainto_tsquery('english', ${escaped})
          ${manufacturerId ? Prisma.sql`AND "manufacturerId" = ${manufacturerId}` : Prisma.empty}
        ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${escaped})) DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `
      const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "Product"
        WHERE "isActive" = true
          AND search_vector @@ plainto_tsquery('english', ${escaped})
          ${manufacturerId ? Prisma.sql`AND "manufacturerId" = ${manufacturerId}` : Prisma.empty}
      `
      const ids = rows.map((r) => r.id)
      const products = await prisma.product.findMany({
        where: { id: { in: ids } },
        include: { manufacturer: { select: { name: true, slug: true } } },
      })
      const sorted = ids.map((id) => products.find((p) => p.id === id)).filter(Boolean)
      return NextResponse.json({
        data: sorted,
        total: Number(countRows[0]?.count ?? 0),
        page,
        pageSize,
      })
    } catch {
      // Fall through to regular filter if search fails
    }
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { manufacturer: { select: { name: true, slug: true } } },
      orderBy: [{ overallConfidence: 'desc' }, { catalogNumber: 'asc' }],
      take: pageSize,
      skip: offset,
    }),
    prisma.product.count({ where }),
  ])

  return NextResponse.json({ data: products, total, page, pageSize })
}
