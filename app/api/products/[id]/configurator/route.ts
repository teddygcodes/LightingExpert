import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      orderingMatrixId: true,
      orderingMatrix: {
        select: {
          id: true,
          baseFamily: true,
          separator: true,
          sampleNumber: true,
          columns: true,
          suffixOptions: true,
        },
      },
    },
  })

  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!product.orderingMatrix) return NextResponse.json({ hasMatrix: false })

  return NextResponse.json({ hasMatrix: true, matrix: product.orderingMatrix })
}
