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
  const page = Math.max(1, Math.min(10000, parseInt(searchParams.get('page') || '1', 10) || 1))
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50))
  const offset = (page - 1) * pageSize

  // Input length guard
  if (search && search.length > 200) {
    return NextResponse.json({ error: 'Search query too long' }, { status: 400 })
  }

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

        // Build optional category filter for raw SQL
        const catFilter =
          where.categoryId && typeof where.categoryId === 'object' && 'in' in where.categoryId
            ? Prisma.sql`AND p."categoryId" = ANY(${(where.categoryId as { in: string[] }).in}::text[])`
            : where.categoryId && typeof where.categoryId === 'string'
              ? Prisma.sql`AND p."categoryId" = ${where.categoryId as string}`
              : Prisma.sql``

        // Single ranked query replaces 3 sequential bucket queries
        const ranked = await prisma.$queryRaw<{ id: string }[]>`
          SELECT p.id FROM "Product" p
          JOIN "Manufacturer" m ON m.id = p."manufacturerId"
          WHERE p."isActive" = true
            AND m.name ILIKE '%' || ${mfgToken} || '%'
            ${catFilter}
            AND (
              p."catalogNumber" ILIKE ${rest} || '%'
              OR p."familyName" ILIKE ${rest} || '%'
              OR p."catalogNumber" ILIKE '%' || ${rest} || '%'
            )
          ORDER BY
            CASE
              WHEN p."catalogNumber" ILIKE ${rest} || '%' THEN 1
              WHEN p."familyName" ILIKE ${rest} || '%' THEN 2
              ELSE 3
            END,
            p."catalogNumber" ASC
          LIMIT ${pageSize}
        `

        if (ranked.length > 0) {
          const ids = ranked.map((r) => r.id)
          const products = await prisma.product.findMany({
            where: { id: { in: ids } },
            include: { manufacturer: { select: { name: true, slug: true } } },
          })
          const sorted = ids.map((id) => products.find((p) => p.id === id)).filter(Boolean)
          return NextResponse.json({ data: sorted, total: sorted.length, page: 1, pageSize })
        }
        // Fall through to tsvector if no manufacturer-prefixed results found
      } catch {
        // Fall through to tsvector
      }
    }

    // Full-text search via tsvector (single-token or manufacturer search returned nothing)
    try {
      const escaped = search.trim().substring(0, 200)
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

  const response = NextResponse.json({ data: products, total, page, pageSize })
  if (!search && !categoryId) {
    response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
  }
  return response
}
