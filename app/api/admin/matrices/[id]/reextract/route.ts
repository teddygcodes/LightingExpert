import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import Anthropic from '@anthropic-ai/sdk'
import { validateMatrixFieldPresence } from '@/lib/configurator'

const anthropic = new Anthropic()
const MAX_SPEC_TEXT_LENGTH = 80_000

function buildExtractionPrompt(specText: string, familyName: string, catalogNumber: string): string {
  const truncated = specText.slice(0, MAX_SPEC_TEXT_LENGTH)
  return `Extract the ordering/catalog number matrix from this lighting spec sheet.

Product family: ${familyName}
Representative catalog number: ${catalogNumber}

Return ONLY valid JSON — no preamble, no markdown backticks.

If no ordering matrix is found, return: {"found": false}

If the product uses a configurable ordering matrix (pick-one columns), return:
{
  "found": true,
  "matrixType": "configurable",
  "baseFamily": "BRT6",
  "separator": "-",
  "sampleNumber": "BRT6-A3-740-U-T4-36-GM",
  "columns": [
    { "position": 0, "label": "Product Family", "shortLabel": "Family", "required": true, "options": [{ "code": "BRT6", "description": "Bollard, 6\\" Round Base" }] }
  ],
  "suffixOptions": [
    { "code": "DIM", "description": "External 0-10V Dimming Leads" }
  ]
}

If the product uses a SKU table (pre-built stock part numbers), return:
{
  "found": true,
  "matrixType": "sku_table",
  "baseFamily": "REBL",
  "separator": " ",
  "sampleNumber": "REBL ALO13 UVOLT SWW3 80CRI DWH M2",
  "skuEntries": [
    { "position": 1, "stockPartNumber": "REBL ALO13 UVOLT SWW3 80CRI DWH M2", "lumens": "13,000", "watts": "80", "cct": "3000K/3500K/4000K/5000K" }
  ]
}

If the product has both (hybrid), return matrixType "hybrid" with both columns and skuEntries.

RULES: Position 0 is the family column for configurable. Separate required pick-one columns from optional suffix codes. Extract ALL options and ALL SKU table rows.

Spec sheet text:
---
${truncated}
---`
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matrixId } = await params

  const matrix = await prisma.orderingMatrix.findUnique({
    where: { id: matrixId },
    include: {
      products: {
        where: { rawSpecText: { not: null }, isActive: true },
        select: { id: true, catalogNumber: true, familyName: true, rawSpecText: true, specExtractionStatus: true },
        orderBy: { catalogNumber: 'asc' },
      },
    },
  })

  if (!matrix) return NextResponse.json({ error: 'Matrix not found' }, { status: 404 })

  // Pick best representative: longest rawSpecText
  const best = matrix.products
    .filter(p => p.rawSpecText && p.rawSpecText.length >= 100)
    .sort((a, b) => {
      const lenDiff = (b.rawSpecText?.length ?? 0) - (a.rawSpecText?.length ?? 0)
      if (lenDiff !== 0) return lenDiff
      if (a.specExtractionStatus === 'SUCCESS' && b.specExtractionStatus !== 'SUCCESS') return -1
      if (b.specExtractionStatus === 'SUCCESS' && a.specExtractionStatus !== 'SUCCESS') return 1
      return 0
    })[0]

  if (!best) {
    return NextResponse.json({ error: 'No products with spec text found for this family' }, { status: 422 })
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: buildExtractionPrompt(best.rawSpecText!, matrix.familyName, best.catalogNumber),
    }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ error: 'Claude returned invalid JSON', raw: text }, { status: 422 })
  }

  if (!parsed.found) {
    return NextResponse.json({ error: 'No ordering matrix found in spec text' }, { status: 422 })
  }

  if (!parsed.baseFamily || typeof parsed.baseFamily !== 'string') {
    return NextResponse.json({ error: 'Claude returned no baseFamily — extraction failed' }, { status: 422 })
  }

  // Determine matrixType from Claude response (default to 'configurable' for backwards compat)
  const rawMatrixType = typeof parsed.matrixType === 'string' ? parsed.matrixType : 'configurable'
  const matrixType = rawMatrixType as 'configurable' | 'sku_table' | 'hybrid'

  const hasColumns = Array.isArray(parsed.columns) && (parsed.columns as unknown[]).length > 0
  const hasSkuTable = Array.isArray(parsed.skuEntries) && (parsed.skuEntries as unknown[]).length > 0

  // Validate field presence using shared utility
  const presenceError = validateMatrixFieldPresence(matrixType, hasColumns, hasSkuTable)
  if (presenceError) {
    return NextResponse.json({ error: presenceError }, { status: 422 })
  }

  // Per-type additional validation
  if (matrixType === 'configurable' || matrixType === 'hybrid') {
    if (!hasColumns) {
      return NextResponse.json({ error: 'Claude returned no columns — extraction failed' }, { status: 422 })
    }
  }
  if (matrixType === 'sku_table' || matrixType === 'hybrid') {
    if (!hasSkuTable) {
      return NextResponse.json({ error: 'Claude returned no skuEntries — extraction failed' }, { status: 422 })
    }
  }

  // Map lowercase matrixType to uppercase Prisma enum
  const dbMatrixType =
    matrixType === 'sku_table' ? 'SKU_TABLE' as const :
    matrixType === 'hybrid'    ? 'HYBRID'    as const :
                                 'CONFIGURABLE' as const

  const updated = await prisma.orderingMatrix.update({
    where: { id: matrixId },
    data: {
      matrixType: dbMatrixType,
      baseFamily: parsed.baseFamily as string,
      separator: (parsed.separator as string) ?? '-',
      columns: parsed.columns ? (parsed.columns as Prisma.InputJsonValue) : Prisma.JsonNull,
      suffixOptions: parsed.suffixOptions ? (parsed.suffixOptions as Prisma.InputJsonValue) : Prisma.JsonNull,
      skuTable: parsed.skuEntries ? (parsed.skuEntries as Prisma.InputJsonValue) : Prisma.JsonNull,
      sampleNumber: (parsed.sampleNumber as string) ?? null,
      confidence: 0.80,
      extractionSource: 'AI',
      extractedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true, matrix: updated })
}
