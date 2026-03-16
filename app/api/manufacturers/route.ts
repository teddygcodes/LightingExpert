import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const manufacturers = await prisma.manufacturer.findMany({
    include: {
      products: {
        where: { isActive: true },
        select: { id: true },
      },
      categories: {
        where: { parentId: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  const result = manufacturers
    .filter((m) => m.products.length > 0 || m.categories.length > 0)
    .map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      productCount: m.products.length,
      categories: m.categories,
    }))

  return NextResponse.json(result)
}
