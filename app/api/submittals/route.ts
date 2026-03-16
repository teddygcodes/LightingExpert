import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const submittals = await prisma.submittal.findMany({
    include: { items: { include: { product: { select: { catalogNumber: true, displayName: true, manufacturer: { select: { name: true } } } } } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(submittals)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { projectName, projectAddress, clientName, contractorName, preparedBy, notes } = body

  if (!projectName?.trim()) {
    return NextResponse.json({ error: 'projectName is required' }, { status: 400 })
  }

  const submittal = await prisma.submittal.create({
    data: { projectName, projectAddress, clientName, contractorName, preparedBy, notes },
  })

  return NextResponse.json(submittal, { status: 201 })
}
