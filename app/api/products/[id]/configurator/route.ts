import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  MatrixType,
  OrderingColumn,
  SuffixOption,
  SkuTableEntry,
  OrderingMatrixData,
  validateMatrixFieldPresence,
} from '@/lib/configurator'

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
          matrixType: true,
          baseFamily: true,
          separator: true,
          sampleNumber: true,
          columns: true,
          suffixOptions: true,
          skuTable: true,
        },
      },
    },
  })

  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!product.orderingMatrix) return NextResponse.json({ hasMatrix: false })

  const m = product.orderingMatrix
  const matrixType = m.matrixType.toLowerCase() as MatrixType
  const columns = (m.columns as OrderingColumn[] | null) ?? []
  const skuEntries = (m.skuTable as SkuTableEntry[] | null) ?? []

  // Validate field presence — log a warning but don't block the response
  const validationError = validateMatrixFieldPresence(matrixType, columns.length > 0, skuEntries.length > 0)
  if (validationError) {
    console.warn(`[configurator] Matrix ${m.id} validation warning: ${validationError}`)
  }

  return NextResponse.json({
    hasMatrix: true,
    matrix: {
      id: m.id,
      matrixType,
      baseFamily: m.baseFamily,
      separator: m.separator,
      sampleNumber: m.sampleNumber,
      columns,
      suffixOptions: (m.suffixOptions as SuffixOption[] | null) ?? [],
      skuEntries: skuEntries.sort((a, b) => a.position - b.position),
      uiMode: {
        showQuickPicks: matrixType === 'sku_table' || matrixType === 'hybrid',
        showCustomBuilder: matrixType === 'configurable' || matrixType === 'hybrid',
      },
    } satisfies OrderingMatrixData,
  })
}
