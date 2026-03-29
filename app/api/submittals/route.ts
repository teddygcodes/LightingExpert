import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createSubmittalSchema, zodError } from '@/lib/validations'

export async function GET() {
  const submittals = await prisma.submittal.findMany({
    include: { items: { include: { product: { select: { catalogNumber: true, displayName: true, manufacturer: { select: { name: true } } } } } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(submittals)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const parsed = createSubmittalSchema.safeParse(body)
  if (!parsed.success) return zodError(parsed)

  const submittal = await prisma.submittal.create({
    data: parsed.data,
  })

  return NextResponse.json(submittal, { status: 201 })
}
