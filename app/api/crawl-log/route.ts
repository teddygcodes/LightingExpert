import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const logs = await prisma.crawlLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 50,
    include: { manufacturer: { select: { name: true } } },
  })
  return NextResponse.json(logs)
}
