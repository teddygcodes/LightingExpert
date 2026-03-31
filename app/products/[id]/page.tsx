import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import ProductDetailClient from './ProductDetailClient'

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const product = await prisma.product.findUnique({
    where: { id },
    include: { manufacturer: { select: { name: true, slug: true } } },
  })
  if (!product) notFound()

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link href="/products" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>
          ← Back to Products
        </Link>
      </div>
      <ProductDetailClient product={JSON.parse(JSON.stringify(product))} />
    </div>
  )
}
