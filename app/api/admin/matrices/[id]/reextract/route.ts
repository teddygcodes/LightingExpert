import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()
const MAX_SPEC_TEXT_LENGTH = 80_000

function buildExtractionPrompt(specText: string, familyName: string, catalogNumber: string): string {
  const truncated = specText.slice(0, MAX_SPEC_TEXT_LENGTH)
  return `Extract the ordering/catalog number matrix from this lighting spec sheet.

Product family: ${familyName}
Representative catalog number: ${catalogNumber}

Return ONLY valid JSON — no preamble, no markdown backticks.

If no ordering matrix is found, return: {"found": false}

If found, return:
{
  "found": true,
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

RULES: Position 0 is the family column. Separate required pick-one columns from optional suffix codes. Extract ALL options.

Spec sheet text:
---
${truncated}
---`
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const matrix = await prisma.orderingMatrix.findUnique({
    where: { id },
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

  const updated = await prisma.orderingMatrix.update({
    where: { id },
    data: {
      baseFamily: parsed.baseFamily as string,
      separator: (parsed.separator as string) ?? '-',
      sampleNumber: (parsed.sampleNumber as string) ?? null,
      columns: parsed.columns as object,
      suffixOptions: (parsed.suffixOptions as object) ?? [],
      confidence: 0.80,
      extractionSource: 'AI',
      extractedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true, matrix: updated })
}
