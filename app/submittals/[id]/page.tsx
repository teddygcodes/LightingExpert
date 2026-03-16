import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import SubmittalDetailClient from './SubmittalDetailClient'

export default async function SubmittalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const submittal = await prisma.submittal.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: {
          product: {
            include: { manufacturer: { select: { name: true } } },
          },
        },
      },
    },
  })
  if (!submittal) notFound()

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href="/submittals" style={{ fontSize: 13, color: '#6b6b6b', textDecoration: 'none' }}>
          ← Back to Submittals
        </Link>
      </div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px 0' }}>{submittal.projectName}</h1>
        {submittal.projectNumber && (
          <div style={{ fontSize: 13, color: '#6b6b6b' }}>Project # {submittal.projectNumber}</div>
        )}
      </div>
      <SubmittalDetailClient initial={JSON.parse(JSON.stringify(submittal))} />
    </div>
  )
}
