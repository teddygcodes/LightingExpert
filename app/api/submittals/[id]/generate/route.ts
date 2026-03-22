import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateSubmittalPDF, FixtureEntry } from '@/lib/pdf/submittal-generator'
import { getSpecSheetPath } from '@/lib/storage'

// Fetch ordering matrix separator for a given matrix id via raw SQL
// (bypasses stale Prisma client field validation)
async function getMatrixSeparator(matrixId: string | null): Promise<string | null> {
  if (!matrixId) return null
  const rows = await prisma.$queryRaw<{ separator: string | null }[]>`
    SELECT separator FROM "OrderingMatrix" WHERE id = ${matrixId} LIMIT 1
  `
  return rows[0]?.separator ?? null
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const submittal = await prisma.submittal.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { product: { include: { manufacturer: true } } },
      },
    },
  })

  if (!submittal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch matrix separators for items that have a catalogNumberOverride
  // (need the separator to correctly split the override into option codes for highlighting)
  const matrixIds = [...new Set(
    submittal.items
      .filter(item => item.catalogNumberOverride && item.product.orderingMatrixId)
      .map(item => item.product.orderingMatrixId as string)
  )]
  const separatorMap = new Map<string, string | null>()
  await Promise.all(matrixIds.map(async id => {
    separatorMap.set(id, await getMatrixSeparator(id))
  }))

  const fixtures: FixtureEntry[] = submittal.items.map(item => {
    const p = item.product
    const mfrSlug = p.manufacturer?.slug ?? ''
    const specSheetPath = getSpecSheetPath(mfrSlug, p.catalogNumber)
    const matrixSeparator = p.orderingMatrixId
      ? (separatorMap.get(p.orderingMatrixId) ?? '-')
      : '-'

    return {
      type: item.fixtureType,
      qty: item.quantity,
      manufacturer: p.manufacturer?.name ?? '',
      catalogNumber: item.catalogNumberOverride ?? p.catalogNumber,
      description: p.displayName ?? p.familyName ?? '',
      watts: p.wattage != null
        ? `${p.wattage}W`
        : p.wattageMax != null
        ? `${p.wattageMin}–${p.wattageMax}W`
        : '',
      lumens: p.lumens != null
        ? `${p.lumens}`
        : p.lumensMax != null
        ? `${p.lumensMin}–${p.lumensMax}`
        : '',
      cct: Array.isArray(p.cctOptions) && p.cctOptions.length > 0
        ? (p.cctOptions as number[]).map(String).join('/')
        : '',
      voltage: p.voltage ?? '',
      location: item.location ?? '',
      notes: item.notes ?? '',
      specSheetPath,
      catalogOverride: item.catalogNumberOverride ?? null,
      matrixSeparator,
    }
  })

  const coverData = {
    projectName: submittal.projectName,
    projectAddress: submittal.projectAddress ?? undefined,
    clientName: submittal.clientName ?? undefined,
    contractorName: submittal.contractorName ?? undefined,
    preparedBy: submittal.preparedBy ?? undefined,
    date: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    revisionNumber: submittal.revisionNumber,
  }

  try {
    const result = await generateSubmittalPDF({
      submittalId: id,
      coverData,
      fixtures,
      showBranding: true,
    })

    await prisma.submittal.update({
      where: { id },
      data: {
        status: 'GENERATED',
        pdfUrl: result.pdfUrl,
        generatedAt: new Date(),
      },
    })

    return NextResponse.json({ pdfUrl: result.pdfUrl, warnings: result.warnings })
  } catch (err) {
    console.error('[submittal-generate] Error:', err)
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })
  }
}
