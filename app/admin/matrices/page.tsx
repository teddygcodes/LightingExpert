import { prisma } from '@/lib/db'
import MatricesClient from './MatricesClient'

export default async function MatricesPage() {
  const matrices = await prisma.orderingMatrix.findMany({
    include: {
      manufacturer: { select: { name: true } },
      _count: { select: { products: true } },
    },
    orderBy: [{ manufacturer: { name: 'asc' } }, { familyName: 'asc' }],
  })

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Ordering Matrices</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {matrices.length} matrices extracted. Click a row to expand. Edit or re-extract as needed.
        </p>
      </div>
      <MatricesClient matrices={JSON.parse(JSON.stringify(matrices))} />
    </div>
  )
}
