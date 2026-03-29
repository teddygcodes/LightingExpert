import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import {
  addItemSchema, removeItemSchema, reorderSchema,
  updateItemSchema, updateSubmittalSchema, zodError,
} from '@/lib/validations'

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
              id: true, catalogNumber: true, displayName: true, familyName: true, wattage: true,
              lumens: true, cri: true, cctOptions: true, voltage: true,
              ipRating: true, nemaRating: true, mountingType: true,
              specSheetPath: true, orderingMatrixId: true,
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
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await params
  const body = await req.json()

  // Handle item operations
  if (body.action === 'add_item') {
    const parsed = addItemSchema.safeParse(body)
    if (!parsed.success) return zodError(parsed)
    const { productId, fixtureType, quantity, locationTag, location, mountingHeight, notes, catalogNumberOverride } = parsed.data
    const loc = locationTag ?? location
    // Atomic sort order increment via transaction
    const item = await prisma.$transaction(async (tx) => {
      const maxOrder = await tx.submittalItem.findFirst({
        where: { submittalId: id },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      })
      return tx.submittalItem.create({
        data: {
          submittalId: id,
          productId,
          fixtureType: fixtureType ?? '',
          quantity,
          location: loc,
          mountingHeight,
          notes,
          catalogNumberOverride: catalogNumberOverride ?? null,
          sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
        },
        include: { product: { select: { catalogNumber: true, displayName: true } } },
      })
    })
    return NextResponse.json(item)
  }

  if (body.action === 'remove_item') {
    const parsed = removeItemSchema.safeParse(body)
    if (!parsed.success) return zodError(parsed)
    await prisma.submittalItem.delete({ where: { id: parsed.data.itemId } })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'reorder') {
    const parsed = reorderSchema.safeParse(body)
    if (!parsed.success) return zodError(parsed)
    const { itemId, direction } = parsed.data
    const item = await prisma.submittalItem.findUnique({ where: { id: itemId } })
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const items = await prisma.submittalItem.findMany({
      where: { submittalId: id },
      orderBy: { sortOrder: 'asc' },
    })
    const idx = items.findIndex((i) => i.id === itemId)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= items.length) return NextResponse.json({ ok: true })

    const swapItem = items[swapIdx]
    await prisma.$transaction([
      prisma.submittalItem.update({ where: { id: item.id }, data: { sortOrder: swapItem.sortOrder } }),
      prisma.submittalItem.update({ where: { id: swapItem.id }, data: { sortOrder: item.sortOrder } }),
    ])
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'update_item') {
    const parsed = updateItemSchema.safeParse(body)
    if (!parsed.success) return zodError(parsed)
    const { itemId, fixtureType, quantity, location, notes, catalogNumberOverride } = parsed.data

    // Verify the item belongs to this submittal before updating
    const existing = await prisma.submittalItem.findFirst({
      where: { id: itemId, submittalId: id },
      select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const item = await prisma.submittalItem.update({
      where: { id: itemId },
      data: {
        ...(fixtureType           !== undefined && { fixtureType }),
        ...(quantity              !== undefined && { quantity: Number(quantity) }),
        ...(location              !== undefined && { location }),
        ...(notes                 !== undefined && { notes }),
        ...(catalogNumberOverride !== undefined && { catalogNumberOverride }),
      },
    })
    return NextResponse.json(item)
  }

  // Update submittal fields
  const parsed = updateSubmittalSchema.safeParse(body)
  if (!parsed.success) return zodError(parsed)
  try {
    const updated = await prisma.submittal.update({
      where: { id },
      data: parsed.data,
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Submittal not found' }, { status: 404 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    await prisma.$transaction([
      prisma.submittalItem.deleteMany({ where: { submittalId: id } }),
      prisma.submittal.delete({ where: { id } }),
    ])
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Submittal not found' }, { status: 404 })
  }
}
