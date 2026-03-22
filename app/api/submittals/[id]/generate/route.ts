import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateSubmittalPDF, FixtureEntry } from '@/lib/pdf/submittal-generator'
import { getSpecSheetPath } from '@/lib/storage'

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

  const fixtures: FixtureEntry[] = submittal.items.map(item => {
    const p = item.product
    const mfrSlug = p.manufacturer?.slug ?? ''
    const specSheetPath = getSpecSheetPath(mfrSlug, p.catalogNumber)

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
