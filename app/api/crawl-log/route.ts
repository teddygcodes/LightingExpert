import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50))
  const offset = (page - 1) * pageSize

  const [logs, total] = await Promise.all([
    prisma.crawlLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: pageSize,
      skip: offset,
      include: { manufacturer: { select: { name: true } } },
    }),
    prisma.crawlLog.count(),
  ])

  return NextResponse.json({ data: logs, total, page, pageSize })
}
