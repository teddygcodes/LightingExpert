import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import SubmittalEditClient from '@/components/SubmittalEditClient'

export default async function SubmittalEditPage({
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
            select: {
              id: true,
              catalogNumber: true,
              displayName: true,
              familyName: true,
              orderingMatrixId: true,
              manufacturer: { select: { name: true, slug: true } },
            },
          },
        },
      },
    },
  })

  if (!submittal) redirect('/submittals')

  return <SubmittalEditClient initial={submittal} />
}
