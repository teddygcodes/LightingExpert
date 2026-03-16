import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { findMatches } from '@/lib/cross-reference'

export async function GET(req: NextRequest) {
  const catalogNumber = req.nextUrl.searchParams.get('catalogNumber')?.trim()
  if (!catalogNumber) {
    return NextResponse.json({ error: 'catalogNumber is required' }, { status: 400 })
  }

  const source = await prisma.product.findFirst({
    where: { catalogNumber: { equals: catalogNumber, mode: 'insensitive' }, isActive: true },
    include: { manufacturer: { select: { name: true, slug: true } } },
  })

  if (!source) {
    return NextResponse.json({ error: `Product "${catalogNumber}" not found` }, { status: 404 })
  }

  const { matches, rejects, filterLevel } = await findMatches(source.id)

  return NextResponse.json({
    source,
    matches,
    rejects,
    meta: {
      totalCandidates: matches.length + rejects.length,
      hardRejected: rejects.length,
      matched: matches.length,
      filterLevel,
    },
  })
}
