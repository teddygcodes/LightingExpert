import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const project = await prisma.chatProject.update({
    where: { id },
    data: { name: body.name },
    select: { id: true, name: true },
  })
  return NextResponse.json(project)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Unassign chats from this project first
  await prisma.chat.updateMany({ where: { projectId: id }, data: { projectId: null } })
  await prisma.chatProject.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}
