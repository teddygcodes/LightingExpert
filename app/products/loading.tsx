import { SkeletonCard } from '@/components/Skeleton'

export default function ProductsLoading() {
  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  )
}
