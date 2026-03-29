import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiError } from '@/lib/api-response'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON in request body', 400)
  }
  try {
    const project = await prisma.chatProject.update({
      where: { id },
      data: { name: body.name as string },
      select: { id: true, name: true },
    })
    return NextResponse.json(project)
  } catch {
    return apiError('Project not found', 404)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await prisma.$transaction([
      prisma.chat.updateMany({ where: { projectId: id }, data: { projectId: null } }),
      prisma.chatProject.delete({ where: { id } }),
    ])
    return new NextResponse(null, { status: 204 })
  } catch {
    return apiError('Project not found', 404)
  }
}
