import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError } from '@/lib/api-response'

export async function GET() {
  try {
    const projects = await prisma.chatProject.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        chats: {
          select: { id: true, title: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    })
    return NextResponse.json(projects)
  } catch {
    return apiError('Failed to load projects', 500)
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON in request body', 400)
  }
  try {
    const project = await prisma.chatProject.create({
      data: { name: (body.name as string) ?? 'New Project' },
      include: { chats: true },
    })
    return NextResponse.json(project, { status: 201 })
  } catch {
    return apiError('Failed to create project', 500)
  }
}
