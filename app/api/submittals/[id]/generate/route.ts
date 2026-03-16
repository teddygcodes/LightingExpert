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
      catalogNumber: p.catalogNumber,
      description: p.displayName ?? p.familyName ?? '',
      watts: p.wattage != null ? `${p.wattage}W` : p.wattageMax != null ? `${p.wattageMin}–${p.wattageMax}W` : '',
      lumens: p.lumens != null ? `${p.lumens}` : p.lumensMax != null ? `${p.lumensMin}–${p.lumensMax}` : '',
      cct: Array.isArray(p.cctOptions) && p.cctOptions.length > 0 ? (p.cctOptions as number[]).map(String).join('/') : '',
      cri: p.cri != null ? `${p.cri}` : '',
      voltage: p.voltage ?? '',
      ipNema: [p.ipRating, p.nemaRating].filter(Boolean).join(' / '),
      mounting: Array.isArray(p.mountingType) ? (p.mountingType as string[]).join(', ') : '',
      location: item.location ?? '',
      notes: item.notes ?? '',
      specSheetPath,
    }
  })

  const missingCatalogNumbers = fixtures.filter(f => !f.specSheetPath).map(f => f.catalogNumber)

  const coverData = {
    projectName: submittal.projectName,
    projectAddress: submittal.projectAddress ?? undefined,
    clientName: submittal.clientName ?? undefined,
    contractorName: submittal.contractorName ?? undefined,
    preparedBy: submittal.preparedBy ?? undefined,
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    revisionNumber: submittal.revisionNumber,
    fixtures: fixtures.map(f => ({
      type: f.type,
      qty: f.qty,
      manufacturer: f.manufacturer,
      catalogNumber: f.catalogNumber,
      description: f.description,
    })),
    missingDocuments: missingCatalogNumbers,
  }

  try {
    const result = await generateSubmittalPDF({ submittalId: id, coverData, fixtures })

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
    const message = err instanceof Error ? err.message : 'PDF generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
