import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/chats/[id] — load chat with messages
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const chat = await prisma.chat.findUnique({ where: { id } })
  if (!chat) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(chat)
}

// PATCH /api/chats/[id] — update title, messages, projectId
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if ('title' in body) data.title = body.title
  if ('messages' in body) data.messages = body.messages
  if ('projectId' in body) data.projectId = body.projectId

  const chat = await prisma.chat.update({
    where: { id },
    data,
    select: { id: true, title: true, projectId: true, updatedAt: true },
  })
  return NextResponse.json(chat)
}

// DELETE /api/chats/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.chat.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
