import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { FieldProvenanceMap } from '@/lib/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const product = await prisma.product.findUnique({
    where: { id },
    include: { manufacturer: { select: { name: true, slug: true } } },
  })
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Strip internal extraction fields — not needed by UI, reduces payload size
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rawSpecText, specExtractionJson, specEvidenceJson, crawlEvidence, ...publicProduct } = product
  return NextResponse.json(publicProduct)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existingProvenance = (existing.fieldProvenance as unknown as FieldProvenanceMap) || {}

  // Merge provenance: mark all incoming fields as MANUAL
  const updatedProvenance: FieldProvenanceMap = { ...existingProvenance }
  const editableFields = [
    'wattage','wattageMin','wattageMax','lumens','lumensMin','lumensMax',
    'cri','cctOptions','voltage','dimmable','dimmingType','dlcListed','dlcPremium',
    'ulListed','wetLocation','dampLocation','efficacy','beamAngle','dimensions',
    'formFactor','ipRating','nemaRating','emergencyBackup','category','mountingType',
    'displayName','familyName','description','configOptions',
  ]

  for (const field of editableFields) {
    if (field in body) {
      updatedProvenance[field] = { source: 'MANUAL', confidence: 1.0 }
    }
  }

  // Build safe update — only allow known editable fields
  const allowedUpdate: Record<string, unknown> = {}
  for (const field of editableFields) {
    if (field in body) allowedUpdate[field] = body[field]
  }

  // Handle special marking
  if (body.markVerified) {
    allowedUpdate.lastVerifiedAt = new Date()
    allowedUpdate.verifiedBy = body.verifiedBy || 'Manual'
  }

  allowedUpdate.fieldProvenance = updatedProvenance as unknown as Prisma.InputJsonValue

  const updated = await prisma.product.update({
    where: { id },
    data: allowedUpdate as Prisma.ProductUpdateInput,
  })

  return NextResponse.json(updated)
}
