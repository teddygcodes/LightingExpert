import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
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
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const project = await prisma.chatProject.create({
    data: { name: body.name ?? 'New Project' },
    include: { chats: true },
  })
  return NextResponse.json(project, { status: 201 })
}
