import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/chats — list all chats (no messages, for sidebar)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  const chats = await prisma.chat.findMany({
    where: projectId ? { projectId } : undefined,
    select: { id: true, title: true, projectId: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })
  return NextResponse.json(chats)
}

// POST /api/chats — create a new chat
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const chat = await prisma.chat.create({
    data: {
      title: body.title ?? null,
      projectId: body.projectId ?? null,
      messages: body.messages ?? [],
    },
    select: { id: true, title: true, projectId: true, createdAt: true, updatedAt: true },
  })
  return NextResponse.json(chat, { status: 201 })
}
