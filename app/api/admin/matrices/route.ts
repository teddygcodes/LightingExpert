import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { MatrixType, SkuTableEntry, validateMatrixFieldPresence } from '@/lib/configurator'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  const authErr = await requireAuth()
  if (authErr) return authErr

  const matrices = await prisma.orderingMatrix.findMany({
    include: {
      manufacturer: { select: { name: true, slug: true } },
      _count: { select: { products: true } },
    },
    orderBy: [{ manufacturer: { name: 'asc' } }, { familyName: 'asc' }],
  })
  return NextResponse.json(matrices)
}

const VALID_MATRIX_TYPES: MatrixType[] = ['configurable', 'sku_table', 'hybrid']

export async function PUT(req: NextRequest) {
  const authErr = await requireAuth()
  if (authErr) return authErr

  const body = await req.json()
  const { id, columns, suffixOptions, sampleNumber, confidence, skuTable: skuTableData, matrixType: rawMatrixType } = body

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Validate matrixType if provided
  let matrixType: MatrixType = 'configurable'
  if (rawMatrixType !== undefined) {
    if (!VALID_MATRIX_TYPES.includes(rawMatrixType as MatrixType)) {
      return NextResponse.json(
        { error: `matrixType must be one of: ${VALID_MATRIX_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
    matrixType = rawMatrixType as MatrixType
  }

  const hasColumns = Array.isArray(columns) && columns.length > 0
  const hasSkuTable = Array.isArray(skuTableData) && skuTableData.length > 0

  // Validate field presence using shared utility
  const presenceError = validateMatrixFieldPresence(matrixType, hasColumns, hasSkuTable)
  if (presenceError) {
    return NextResponse.json({ error: presenceError }, { status: 400 })
  }

  // Validate columns when present
  if (Array.isArray(columns)) {
    for (const col of columns) {
      if (typeof col.position !== 'number') {
        return NextResponse.json({ error: 'Each column must have a numeric position' }, { status: 400 })
      }
      if (!Array.isArray(col.options)) {
        return NextResponse.json({ error: `Column at position ${col.position} must have an options array` }, { status: 400 })
      }
    }
  }

  // Validate skuTable entries when present
  if (Array.isArray(skuTableData)) {
    for (const entry of skuTableData as SkuTableEntry[]) {
      if (typeof entry.stockPartNumber !== 'string' || !entry.stockPartNumber) {
        return NextResponse.json({ error: 'Each skuTable entry must have a stockPartNumber string' }, { status: 400 })
      }
      if (typeof entry.position !== 'number' || entry.position <= 0) {
        return NextResponse.json({ error: 'Each skuTable entry must have a numeric position > 0' }, { status: 400 })
      }
    }
  }

  // Map lowercase matrixType to uppercase Prisma enum
  const dbMatrixType =
    matrixType === 'sku_table' ? 'SKU_TABLE' as const :
    matrixType === 'hybrid'    ? 'HYBRID'    as const :
                                 'CONFIGURABLE' as const

  const matrix = await prisma.orderingMatrix.update({
    where: { id },
    data: {
      matrixType: dbMatrixType,
      columns: hasColumns ? (columns as Prisma.InputJsonValue) : Prisma.JsonNull,
      suffixOptions: suffixOptions ? (suffixOptions as Prisma.InputJsonValue) : Prisma.JsonNull,
      skuTable: hasSkuTable ? (skuTableData as Prisma.InputJsonValue) : Prisma.JsonNull,
      sampleNumber: sampleNumber ?? null,
      confidence: confidence ?? 0.8,
      extractionSource: 'MANUAL',
    },
  })
  return NextResponse.json(matrix)
}
