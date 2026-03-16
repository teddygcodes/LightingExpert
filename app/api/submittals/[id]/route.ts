import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const submittal = await prisma.submittal.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true, catalogNumber: true, displayName: true, wattage: true,
              lumens: true, cri: true, cctOptions: true, voltage: true,
              ipRating: true, nemaRating: true, mountingType: true,
              specSheetPath: true,
              manufacturer: { select: { name: true, slug: true } },
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  })
  if (!submittal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(submittal)
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  // Handle item operations
  if (body.action === 'add_item') {
    const { productId, fixtureType, quantity, locationTag, location, mountingHeight, notes } = body
    const maxOrder = await prisma.submittalItem.findFirst({
      where: { submittalId: id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    const item = await prisma.submittalItem.create({
      data: {
        submittalId: id,
        productId,
        fixtureType,
        quantity: quantity || 1,
        location: locationTag ?? location,
        mountingHeight,
        notes,
        sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      },
      include: { product: { select: { catalogNumber: true, displayName: true } } },
    })
    return NextResponse.json(item)
  }

  if (body.action === 'remove_item') {
    await prisma.submittalItem.delete({ where: { id: body.itemId } })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'reorder') {
    // body.itemId, body.direction: 'up' | 'down'
    const item = await prisma.submittalItem.findUnique({ where: { id: body.itemId } })
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const items = await prisma.submittalItem.findMany({
      where: { submittalId: id },
      orderBy: { sortOrder: 'asc' },
    })
    const idx = items.findIndex((i) => i.id === body.itemId)
    const swapIdx = body.direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= items.length) return NextResponse.json({ ok: true })

    const swapItem = items[swapIdx]
    await prisma.$transaction([
      prisma.submittalItem.update({ where: { id: item.id }, data: { sortOrder: swapItem.sortOrder } }),
      prisma.submittalItem.update({ where: { id: swapItem.id }, data: { sortOrder: item.sortOrder } }),
    ])
    return NextResponse.json({ ok: true })
  }

  // Update submittal fields
  const { projectName, projectNumber, projectAddress, clientName, contractorName, preparedBy, preparedFor, revision, notes, status } = body
  const updated = await prisma.submittal.update({
    where: { id },
    data: { projectName, projectNumber, projectAddress, clientName, contractorName, preparedBy, preparedFor, revision, notes, status },
  })
  return NextResponse.json(updated)
}
