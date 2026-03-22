import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const matrices = await prisma.orderingMatrix.findMany({
    include: {
      manufacturer: { select: { name: true, slug: true } },
      _count: { select: { products: true } },
    },
    orderBy: [{ manufacturer: { name: 'asc' } }, { familyName: 'asc' }],
  })
  return NextResponse.json(matrices)
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const { id, columns, suffixOptions, sampleNumber, confidence } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Validate JSON parseable arrays
  if (!Array.isArray(columns)) return NextResponse.json({ error: 'columns must be an array' }, { status: 400 })

  const matrix = await prisma.orderingMatrix.update({
    where: { id },
    data: {
      columns,
      suffixOptions: suffixOptions ?? [],
      sampleNumber: sampleNumber ?? null,
      confidence: confidence ?? 0.8,
      extractionSource: 'MANUAL',
    },
  })
  return NextResponse.json(matrix)
}
