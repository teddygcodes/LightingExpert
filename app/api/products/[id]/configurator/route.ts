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
import { extractOrderingMatrixFromSpec } from '@/lib/extract-matrix'

const MATRIX_COLS = `id, "matrixType", "baseFamily", separator, "sampleNumber", columns, "suffixOptions", "skuTable"`

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
      manufacturerId: true,
      familyName: true,
      displayName: true,
      catalogNumber: true,
      rawSpecText: true,
    },
  })

  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Use raw queries to bypass stale Prisma client field validation
  let rows: Record<string, unknown>[]

  // Tier 1: direct orderingMatrixId link
  if (product.orderingMatrixId) {
    rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, "matrixType", "baseFamily", separator, "sampleNumber", columns, "suffixOptions", "skuTable"
      FROM "OrderingMatrix"
      WHERE id = ${product.orderingMatrixId}
      LIMIT 1
    `
  // Tier 2: family-name fallback (orderingMatrixId not yet linked on this product row)
  } else if (product.manufacturerId && product.familyName) {
    rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT id, "matrixType", "baseFamily", separator, "sampleNumber", columns, "suffixOptions", "skuTable"
      FROM "OrderingMatrix"
      WHERE "manufacturerId" = ${product.manufacturerId}
        AND "familyName" = ${product.familyName}
      LIMIT 1
    `
  } else {
    return NextResponse.json({ hasMatrix: false })
  }

  // Tier 3: on-demand extraction from rawSpecText when no matrix exists yet
  if (!rows.length && product.rawSpecText && product.rawSpecText.length >= 200 && product.familyName) {
    try {
      // Derive a cleaner family name for the AI prompt when the DB familyName is a generic phrase.
      // e.g. "EPANL Flat Panel" → "EPANL"; fall back to DB familyName if no clean code found.
      const firstWord = (product.displayName ?? '').split(/\s+/)[0] ?? ''
      const effectiveFamilyName = /^[A-Z0-9]{2,12}$/.test(firstWord) ? firstWord : product.familyName

      const extracted = await extractOrderingMatrixFromSpec(
        product.rawSpecText,
        effectiveFamilyName,
        product.catalogNumber,
      )

      if (extracted) {
        const dbMatrixType =
          extracted.matrixType === 'sku_table' ? 'SKU_TABLE' :
          extracted.matrixType === 'hybrid'    ? 'HYBRID'    :
                                                 'CONFIGURABLE'

        const columnsJson = extracted.columns       ? JSON.stringify(extracted.columns)       : null
        const suffixJson  = extracted.suffixOptions ? JSON.stringify(extracted.suffixOptions) : null
        const skuJson     = extracted.skuEntries    ? JSON.stringify(extracted.skuEntries)    : null

        // Upsert the matrix — $queryRawUnsafe used here because we need typed SQL casts (::jsonb,
        // ::"OrderingMatrixType") that Prisma tagged templates don't support without Prisma.raw injection
        // All parameter values are fully controlled (never user-supplied)
        const matrixRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `INSERT INTO "OrderingMatrix" (
            id, "manufacturerId", "familyName", "baseFamily", separator, "sampleNumber",
            "matrixType", columns, "suffixOptions", "skuTable", confidence, "extractionSource", "extractedAt"
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5,
            $6::"OrderingMatrixType",
            $7::jsonb, $8::jsonb, $9::jsonb,
            0.80, 'AI', NOW()
          )
          ON CONFLICT ("manufacturerId", "familyName") DO UPDATE SET
            "baseFamily"     = EXCLUDED."baseFamily",
            separator        = EXCLUDED.separator,
            "sampleNumber"   = EXCLUDED."sampleNumber",
            "matrixType"     = EXCLUDED."matrixType",
            columns          = EXCLUDED.columns,
            "suffixOptions"  = EXCLUDED."suffixOptions",
            "skuTable"       = EXCLUDED."skuTable",
            confidence       = 0.80,
            "extractedAt"    = NOW()
          RETURNING id`,
          product.manufacturerId,
          product.familyName,
          extracted.baseFamily ?? product.familyName,
          extracted.separator ?? '-',
          extracted.sampleNumber ?? null,
          dbMatrixType,
          columnsJson,
          suffixJson,
          skuJson,
        )

        if (matrixRows.length) {
          const matrixId = matrixRows[0].id

          // Link all active products in this family to the new matrix
          await prisma.$executeRawUnsafe(
            `UPDATE "Product" SET "orderingMatrixId" = $1
             WHERE "manufacturerId" = $2 AND "familyName" = $3 AND "isActive" = true`,
            matrixId,
            product.manufacturerId,
            product.familyName,
          )

          rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT ${MATRIX_COLS} FROM "OrderingMatrix" WHERE id = $1 LIMIT 1`,
            matrixId,
          )
        }
      }
    } catch (err) {
      console.error(`[configurator] On-demand extraction failed for product ${id}:`, err instanceof Error ? err.message : err)
      // Fall through — return hasMatrix: false
    }
  }

  if (!rows.length) return NextResponse.json({ hasMatrix: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = rows[0] as any
  const matrixType = String(m.matrixType ?? 'CONFIGURABLE').toLowerCase() as MatrixType
  const parseJson = (v: unknown) => {
    if (!v) return null
    if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
    return v
  }
  const columns = (parseJson(m.columns) as OrderingColumn[] | null) ?? []
  const skuEntries = (parseJson(m.skuTable) as SkuTableEntry[] | null) ?? []

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
      suffixOptions: (parseJson(m.suffixOptions) as SuffixOption[] | null) ?? [],
      skuEntries: skuEntries.sort((a, b) => a.position - b.position),
      uiMode: {
        showQuickPicks: matrixType === 'sku_table' || matrixType === 'hybrid',
        showCustomBuilder: matrixType === 'configurable' || matrixType === 'hybrid',
      },
    } satisfies OrderingMatrixData,
  })
}
