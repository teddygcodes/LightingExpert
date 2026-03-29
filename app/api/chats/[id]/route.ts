import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { apiError } from '@/lib/api-response'

// GET /api/chats/[id] — load chat with messages
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const chat = await prisma.chat.findUnique({ where: { id } })
  if (!chat) return apiError('Not found', 404)
  return NextResponse.json(chat)
}

// PATCH /api/chats/[id] — update title, messages, projectId
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON in request body', 400)
  }
  const data: Record<string, unknown> = {}
  if ('title' in body) data.title = body.title
  if ('messages' in body) data.messages = body.messages
  if ('projectId' in body) data.projectId = body.projectId

  try {
    const chat = await prisma.chat.update({
      where: { id },
      data,
      select: { id: true, title: true, projectId: true, updatedAt: true },
    })
    return NextResponse.json(chat)
  } catch {
    return apiError('Chat not found', 404)
  }
}

// DELETE /api/chats/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth()
  if (authError) return authError

  const { id } = await params
  try {
    await prisma.chat.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch {
    return apiError('Chat not found', 404)
  }
}
