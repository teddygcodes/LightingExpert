import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const manufacturers = await prisma.manufacturer.findMany({
    take: 100,
    include: {
      _count: { select: { products: { where: { isActive: true } } } },
      categories: {
        where: { parentId: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  const result = manufacturers
    .filter((m) => m._count.products > 0 || m.categories.length > 0)
    .map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      productCount: m._count.products,
      categories: m.categories,
    }))

  const response = NextResponse.json(result)
  response.headers.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400')
  return response
}
