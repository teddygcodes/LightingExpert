import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { MatrixType, validateMatrixFieldPresence } from '@/lib/configurator'
import { requireAuth } from '@/lib/auth'
import { updateMatrixSchema, zodError } from '@/lib/validations'

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

export async function PUT(req: NextRequest) {
  const authErr = await requireAuth()
  if (authErr) return authErr

  const body = await req.json()
  const parsed = updateMatrixSchema.safeParse(body)
  if (!parsed.success) return zodError(parsed)

  const { id, columns, suffixOptions, sampleNumber, confidence, skuTable: skuTableData, matrixType: rawMatrixType } = parsed.data

  const matrixType: MatrixType = rawMatrixType ?? 'configurable'
  const hasColumns = Array.isArray(columns) && columns.length > 0
  const hasSkuTable = Array.isArray(skuTableData) && skuTableData.length > 0

  // Validate field presence using shared utility
  const presenceError = validateMatrixFieldPresence(matrixType, hasColumns, hasSkuTable)
  if (presenceError) {
    return NextResponse.json({ error: presenceError }, { status: 400 })
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
