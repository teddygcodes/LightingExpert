import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { apiError } from '@/lib/api-response'

// GET /api/chats — list all chats (no messages, for sidebar)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  try {
    const chats = await prisma.chat.findMany({
      where: projectId ? { projectId } : undefined,
      select: { id: true, title: true, projectId: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    })
    return NextResponse.json(chats)
  } catch {
    return apiError('Failed to load chats', 500)
  }
}

// POST /api/chats — create a new chat
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON in request body', 400)
  }
  try {
    const chat = await prisma.chat.create({
      data: {
        title: (body.title as string) ?? null,
        projectId: (body.projectId as string) ?? null,
        messages: (body.messages ?? []) as Prisma.InputJsonValue,
      },
      select: { id: true, title: true, projectId: true, createdAt: true, updatedAt: true },
    })
    return NextResponse.json(chat, { status: 201 })
  } catch {
    return apiError('Failed to create chat', 500)
  }
}
